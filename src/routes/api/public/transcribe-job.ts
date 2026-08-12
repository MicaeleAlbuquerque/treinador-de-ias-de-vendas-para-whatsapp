import { isCronAuthorized } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  transcribeAudioWithGemini,
  transcribeAudioWithWhisper,
} from "@/lib/ai-gateway.server";
import { anonymizeText, buildSellerWhitelist } from "@/lib/anonymize.server";
import { chargeLlmCost, LlmCapHitError } from "@/lib/llm-cost.server";

// Approximação conservadora pra cap:
// Gemini 2.5 Flash com áudio nativo ≈ US$ 0.002 por minuto.
// Whisper-1 OpenAI = US$ 0.006 por minuto.
// Sem duração precisa do áudio, usamos US$ 0.002 por chamada.
const TRANSCRIBE_COST_USD = 0.002;

function parseDataUrl(url: string): { mime: string; base64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(url);
  if (!m) return null;
  return { mime: m[1]!, base64: m[2]! };
}

async function ensureJobsExist(): Promise<void> {
  // Cria transcribe_jobs pra qualquer message audio sem transcript que ainda não tem job.
  const { data: pending } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("media_type", "audio")
    .is("audio_transcript", null)
    .limit(50);
  if (!pending || pending.length === 0) return;
  const rows = pending.map((m) => ({ message_id: m.id }));
  // Upsert ignora duplicatas pelo unique parcial em (message_id) WHERE status IN ('pending','running').
  await supabaseAdmin.from("transcribe_jobs").upsert(rows, { onConflict: "message_id", ignoreDuplicates: true });
}

async function claimJobs(limit: number): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc("claim_pending_jobs", {
    _table: "transcribe_jobs",
    _batch_size: limit,
  });
  if (error) {
    console.error("[transcribe] claim failed", error.message);
    return [];
  }
  return (data as unknown as string[]) ?? [];
}

async function transcribeOne(jobId: string, byok: string | null, whitelist: string[]): Promise<void> {
  // Carrega o message_id e audio_url do job
  const { data: job } = await supabaseAdmin
    .from("transcribe_jobs")
    .select("id, message_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id, audio_url")
    .eq("id", job.message_id)
    .maybeSingle();
  if (!msg || !msg.audio_url) {
    await markJob(jobId, "failed", "Mensagem ou áudio inacessível.");
    return;
  }
  const parsed = parseDataUrl(msg.audio_url);
  if (!parsed) {
    await supabaseAdmin
      .from("messages")
      .update({ audio_transcript: "[áudio inacessível]" })
      .eq("id", msg.id);
    await markJob(jobId, "done", null);
    return;
  }

  try {
    // Cap diário antes de chamar provider externo
    await chargeLlmCost({
      provider: byok ? "openai" : "google",
      model: byok ? "whisper-1" : "gemini-2.5-flash",
      costUsd: TRANSCRIBE_COST_USD,
      source: "transcribe",
    });
  } catch (e) {
    if (e instanceof LlmCapHitError) {
      // Re-enfileira: volta pra pending pra retomar amanhã quando reset diário.
      await supabaseAdmin
        .from("transcribe_jobs")
        .update({ status: "pending", error_text: e.message, locked_at: null })
        .eq("id", jobId);
      return;
    }
    throw e;
  }

  try {
    let transcript = "";
    if (byok) {
      const bytes = Uint8Array.from(atob(parsed.base64), (c) => c.charCodeAt(0));
      transcript = await transcribeAudioWithWhisper(bytes.buffer, "audio.ogg", byok);
    } else {
      transcript = await transcribeAudioWithGemini(parsed.base64, parsed.mime);
    }
    // ANONIMIZAÇÃO obrigatória antes de persistir o transcript.
    const safe = transcript
      ? anonymizeText(transcript, whitelist).anonymized
      : "[transcrição vazia]";

    await supabaseAdmin
      .from("messages")
      .update({ audio_transcript: safe })
      .eq("id", msg.id);
    await markJob(jobId, "done", null);
  } catch (e) {
    console.error("[transcribe-job] failed", msg.id, (e as Error).message);
    await supabaseAdmin
      .from("messages")
      .update({ audio_transcript: "[falha na transcrição]" })
      .eq("id", msg.id);
    await markJob(jobId, "failed", (e as Error).message);
  }
}

async function markJob(jobId: string, status: "done" | "failed", error: string | null) {
  await supabaseAdmin
    .from("transcribe_jobs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_text: error?.slice(0, 500) ?? null,
    })
    .eq("id", jobId);
}

async function handle(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  await ensureJobsExist();
  const claimed = await claimJobs(10);
  if (claimed.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  // BYOK + whitelist carregados uma vez por execução
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("has_openai_byok")
    .maybeSingle();
  let byok: string | null = null;
  if (settings?.has_openai_byok) {
    const { data: sec } = await supabaseAdmin
      .from("app_secrets")
      .select("openai_api_key")
      .maybeSingle();
    byok = sec?.openai_api_key ?? null;
  }
  const { data: sellersRaw } = await supabaseAdmin
    .from("sellers")
    .select("name, phone, active");
  const whitelist = buildSellerWhitelist((sellersRaw ?? []).filter((s) => s.active));

  for (const jobId of claimed) {
    await transcribeOne(jobId, byok, whitelist);
  }

  return new Response(JSON.stringify({ ok: true, processed: claimed.length }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/transcribe-job")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
