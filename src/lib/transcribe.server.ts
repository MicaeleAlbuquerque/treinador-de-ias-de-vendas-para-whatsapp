import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  transcribeAudioWithGemini,
  transcribeAudioWithWhisper,
} from "@/lib/ai-gateway.server";
import { anonymizeText, buildSellerWhitelist } from "@/lib/anonymize.server";
import { chargeLlmCost, LlmCapHitError } from "@/lib/llm-cost.server";
import { coachEvaluateMessage } from "@/lib/coach.server";

const TRANSCRIBE_COST_USD = 0.002;

function parseDataUrl(url: string): { mime: string; base64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(url);
  if (!m) return null;
  return { mime: m[1]!, base64: m[2]! };
}

async function getByokAndWhitelist() {
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

  return { byok, whitelist };
}

/**
 * Transcreve uma mensagem de áudio específica e atualiza o banco de dados.
 * Dispara avaliação de coach automaticamente se a mensagem for do vendedor.
 */
export async function transcribeSingleAudioMessage(messageId: string): Promise<string | null> {
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id, audio_url, sender_role, audio_transcript")
    .eq("id", messageId)
    .maybeSingle();

  if (!msg || !msg.audio_url) return null;
  if (msg.audio_transcript) return msg.audio_transcript;

  const parsed = parseDataUrl(msg.audio_url);
  if (!parsed) {
    await supabaseAdmin
      .from("messages")
      .update({ audio_transcript: "[áudio inacessível]" })
      .eq("id", msg.id);
    return null;
  }

  const { byok, whitelist } = await getByokAndWhitelist();

  try {
    await chargeLlmCost({
      provider: byok ? "openai" : "google",
      model: byok ? "whisper-1" : "gemini-2.5-flash",
      costUsd: TRANSCRIBE_COST_USD,
      source: "transcribe",
    });
  } catch (e) {
    if (e instanceof LlmCapHitError) {
      console.warn("[transcribe] Cap diário atingido ao transcrever mensagem", messageId);
      return null;
    }
    // Prossegue mesmo se houver erro ao contabilizar custo
  }

  try {
    let transcript = "";
    if (byok) {
      const bytes = Uint8Array.from(atob(parsed.base64), (c) => c.charCodeAt(0));
      transcript = await transcribeAudioWithWhisper(bytes.buffer, "audio.ogg", byok);
    } else {
      transcript = await transcribeAudioWithGemini(parsed.base64, parsed.mime);
    }

    const safe = transcript
      ? anonymizeText(transcript, whitelist).anonymized
      : "[transcrição vazia]";

    await supabaseAdmin
      .from("messages")
      .update({ audio_transcript: safe })
      .eq("id", msg.id);

    // Se o áudio foi enviado pelo vendedor, roda o coach com o conteúdo transcrito
    if (msg.sender_role === "seller") {
      coachEvaluateMessage(msg.id).catch((err) =>
        console.error("[coach post-transcribe]", err.message),
      );
    }

    return safe;
  } catch (e) {
    console.error("[transcribeSingleAudioMessage] Falha ao transcrever áudio", messageId, (e as Error).message);
    await supabaseAdmin
      .from("messages")
      .update({ audio_transcript: "[falha na transcrição]" })
      .eq("id", msg.id);
    return null;
  }
}

/**
 * Processa mensagens de áudio pendentes de transcrição em lote.
 */
export async function processAllPendingTranscriptions(limit: number = 20): Promise<{
  processed: number;
  failed: number;
  remaining: number;
}> {
  const { data: pending } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("media_type", "audio")
    .is("audio_transcript", null)
    .not("audio_url", "is", null)
    .limit(limit);

  if (!pending || pending.length === 0) {
    return { processed: 0, failed: 0, remaining: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const m of pending) {
    try {
      const res = await transcribeSingleAudioMessage(m.id);
      if (res && !res.startsWith("[falha")) {
        processed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  const { count: remaining } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("media_type", "audio")
    .is("audio_transcript", null)
    .not("audio_url", "is", null);

  return { processed, failed, remaining: remaining ?? 0 };
}
