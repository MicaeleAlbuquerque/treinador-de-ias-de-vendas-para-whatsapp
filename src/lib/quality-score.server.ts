// Quality score: avalia qualidade de atendimento de uma conversa via IA.
// Permite DNA alimentar-se mesmo sem outcome marcado (won/lost).
// Rubric calibrada pra vendas WhatsApp 1-on-1 em PT-BR.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, resolveChatProvider } from "./ai-gateway.server";
import { chargeLlmCost, LlmCapHitError } from "./llm-cost.server";

const QUALITY_COST_USD = 0.003; // ~1k tokens in/out @ Gemini 2.5 Flash

const RUBRIC = [
  { key: "abertura", label: "Abertura clara e personalizada", weight: 10 },
  { key: "descoberta", label: "Perguntas de descoberta (dor, contexto, urgência)", weight: 15 },
  { key: "escuta", label: "Escuta ativa — acolhe e devolve o que o lead disse", weight: 10 },
  { key: "valor", label: "Apresenta valor concreto (não só features)", weight: 15 },
  { key: "objecao", label: "Trata objeções com calma e sem brigar", weight: 10 },
  { key: "ritmo", label: "Ritmo adequado — não some, não atropela", weight: 10 },
  { key: "fechamento", label: "Movimenta pro próximo passo concreto (call, link, próxima ação)", weight: 15 },
  { key: "tom", label: "Tom humano, confiante, sem script robotizado", weight: 10 },
  { key: "personalizacao", label: "Usa o que aprendeu sobre o lead nas próximas mensagens", weight: 5 },
] as const;

const SYSTEM_PROMPT = `Você é um especialista sênior em vendas consultivas via WhatsApp em português brasileiro.

Avalia QUALIDADE DE ATENDIMENTO do VENDEDOR (não do lead) em uma conversa, independente do desfecho.

Critérios (cada um 0 a 10):
${RUBRIC.map((r) => `- ${r.key} (peso ${r.weight}): ${r.label}`).join("\n")}

Regras importantes:
- Não confunda esforço com qualidade: muitas mensagens não significam bom atendimento.
- Se a conversa for muito curta (≤3 mensagens do vendedor), penalize "fechamento" e "descoberta" mas não invente.
- Não puna o vendedor pelo silêncio do lead.
- Foque no que o vendedor FEZ ou DEIXOU DE FAZER.

Devolva APENAS um JSON estrito assim:
{
  "scores": { "abertura": 0-10, "descoberta": 0-10, "escuta": 0-10, "valor": 0-10, "objecao": 0-10, "ritmo": 0-10, "fechamento": 0-10, "tom": 0-10, "personalizacao": 0-10 },
  "highlights": ["3-5 bullets curtos do que o vendedor fez bem"],
  "gaps": ["3-5 bullets curtos do que ficou faltando ou foi mal"],
  "summary": "1 frase de 1-2 linhas resumindo o atendimento"
}`;

type ScoreResponse = {
  scores: Record<string, number>;
  highlights?: string[];
  gaps?: string[];
  summary?: string;
};

function computeOverall(scores: Record<string, number>): number {
  let sum = 0;
  let totalWeight = 0;
  for (const r of RUBRIC) {
    const s = Number(scores[r.key]);
    if (Number.isFinite(s)) {
      sum += Math.max(0, Math.min(10, s)) * r.weight;
      totalWeight += r.weight;
    }
  }
  if (totalWeight === 0) return 0;
  return Math.round((sum / totalWeight) * 10);
}

function formatTranscript(messages: Array<{ sender_role: string; text: string | null; audio_transcript: string | null; ts: string }>): string {
  return messages
    .map((m) => {
      const who = m.sender_role === "seller" ? "VENDEDOR" : "LEAD";
      const body = (m.text ?? m.audio_transcript ?? "[mídia]").slice(0, 800);
      return `[${who}] ${body}`;
    })
    .join("\n");
}

export async function scoreConversationQuality(conversationId: string): Promise<{
  scoreOverall: number;
  breakdown: ScoreResponse;
  provider: string;
  model: string;
} | null> {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id, message_count")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return null;

  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("sender_role, text, audio_transcript, ts")
    .eq("conversation_id", conversationId)
    .order("ts", { ascending: true })
    .limit(300);

  const msgs = messages ?? [];
  if (msgs.length === 0) {
    // Conversa vazia: zero score sem chamar LLM.
    const empty: ScoreResponse = {
      scores: Object.fromEntries(RUBRIC.map((r) => [r.key, 0])),
      highlights: [],
      gaps: ["Sem mensagens registradas."],
      summary: "Conversa vazia.",
    };
    return { scoreOverall: 0, breakdown: empty, provider: "none", model: "none" };
  }

  // Resolve provider (OpenAI BYOK > Lovable AI) e cobra o custo ANTES da chamada,
  // no provider certo.
  const resolved = await resolveChatProvider();
  await chargeLlmCost({
    provider: resolved.provider,
    model: resolved.model,
    costUsd: QUALITY_COST_USD,
    source: "quality_score",
  });

  const transcript = formatTranscript(msgs);
  const userPrompt = `Conversa de WhatsApp (já anonimizada). Avalie a qualidade do atendimento do VENDEDOR.\n\n---\n${transcript}\n---\n\nResponda em JSON estrito conforme instruído.`;

  const { text: raw, provider, model } = await chatCompletion({
    resolved,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    temperature: 0.2,
  });

  let parsed: ScoreResponse;
  try {
    parsed = JSON.parse(raw) as ScoreResponse;
  } catch {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      parsed = JSON.parse(cleaned) as ScoreResponse;
    } catch {
      // tenta achar o primeiro {...} se modelo bagunçar
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Resposta IA não-JSON.");
      parsed = JSON.parse(match[0]) as ScoreResponse;
    }
  }
  if (!parsed.scores || typeof parsed.scores !== "object") {
    throw new Error("Resposta IA sem campo 'scores'.");
  }

  const overall = computeOverall(parsed.scores);
  return { scoreOverall: overall, breakdown: parsed, provider, model };
}

export async function scoreAndPersistQuality(conversationId: string): Promise<{
  scoreOverall: number;
} | null> {
  try {
    const result = await scoreConversationQuality(conversationId);
    if (!result) return null;
    await supabaseAdmin
      .from("conversations")
      .update({
        quality_score: result.scoreOverall,
        quality_breakdown: result.breakdown as never,
        quality_evaluated_at: new Date().toISOString(),
        quality_model: result.model,
        quality_provider: result.provider,
      })
      .eq("id", conversationId);
    return { scoreOverall: result.scoreOverall };
  } catch (e) {
    if (e instanceof LlmCapHitError) throw e;
    // Propaga pra o caller registrar no job
    throw e;
  }
}

// Worker payload: processa um job inteiro (claim já fez status='running').
export async function processQualityScoreJob(jobId: string): Promise<void> {
  const { data: job } = await supabaseAdmin
    .from("quality_score_jobs")
    .select("id, conversation_id, attempt_count")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;
  try {
    await scoreAndPersistQuality(job.conversation_id);
    await supabaseAdmin
      .from("quality_score_jobs")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
        error_text: null,
        attempt_count: (job.attempt_count ?? 0) + 1,
      })
      .eq("id", jobId);
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof LlmCapHitError) {
      // Re-enfileira: volta pra pending pra retomar amanhã.
      await supabaseAdmin
        .from("quality_score_jobs")
        .update({
          status: "pending",
          locked_at: null,
          error_text: msg.slice(0, 500),
          attempt_count: (job.attempt_count ?? 0) + 1,
        })
        .eq("id", jobId);
      return;
    }
    await supabaseAdmin
      .from("quality_score_jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_text: msg.slice(0, 500),
        attempt_count: (job.attempt_count ?? 0) + 1,
      })
      .eq("id", jobId);
  }
}

// Cria jobs pra conversas sem score (idempotente e sem depender de constraint unique no Postgres).
export async function ensureQualityScoreJobs(batchSize = 100): Promise<number> {
  const { data: pending } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .is("quality_score", null)
    .gte("message_count", 2) // ignora conversas vazias/uma msg
    .limit(batchSize);
  if (!pending || pending.length === 0) return 0;

  const convIds = pending.map((c) => c.id);

  // Consulta jobs existentes para não duplicar e reativar falhas antigas
  const { data: existingJobs } = await supabaseAdmin
    .from("quality_score_jobs")
    .select("id, conversation_id, status")
    .in("conversation_id", convIds);

  const existingByConv = new Map((existingJobs ?? []).map((j) => [j.conversation_id, j]));

  // Conversas sem job algum
  const toInsert = convIds
    .filter((id) => !existingByConv.has(id))
    .map((id) => ({ conversation_id: id, status: "pending" }));

  // Conversas com jobs que falharam anteriormente: re-enfileira para pending para poderem ser reavaliadas
  const failedJobIds = (existingJobs ?? [])
    .filter((j) => j.status === "failed")
    .map((j) => j.id);

  if (failedJobIds.length > 0) {
    await supabaseAdmin
      .from("quality_score_jobs")
      .update({
        status: "pending",
        locked_at: null,
        error_text: null,
        started_at: null,
        finished_at: null,
      })
      .in("id", failedJobIds);
  }

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin
      .from("quality_score_jobs")
      .insert(toInsert);
    if (error) {
      console.error("[quality] ensureJobs insert failed", error.message);
      return failedJobIds.length;
    }
  }

  return toInsert.length + failedJobIds.length;
}

// Reivindica jobs pendentes para processamento
export async function claimQualityScoreJobs(batchSize = 10): Promise<string[]> {
  // 1. Tenta via RPC se disponível e sem erros de formato
  try {
    const { data: claimedRaw, error } = await supabaseAdmin.rpc("claim_pending_jobs", {
      _table: "quality_score_jobs",
      _batch_size: batchSize,
    });
    if (!error && Array.isArray(claimedRaw) && claimedRaw.length > 0) {
      return claimedRaw as string[];
    }
  } catch {
    // Falha do RPC (ex: bug de array literal no Postgres)
  }

  // 2. Libera órfãos que ficaram travados há mais de 5 minutos
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("quality_score_jobs")
    .update({ status: "pending", locked_at: null })
    .eq("status", "running")
    .lt("locked_at", fiveMinutesAgo);

  // 3. Busca candidatos pendentes
  const { data: candidates } = await supabaseAdmin
    .from("quality_score_jobs")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (!candidates || candidates.length === 0) return [];

  const candidateIds = candidates.map((c) => c.id);
  const now = new Date().toISOString();

  // 4. Lock atômico nos candidatos selecionados
  const { data: claimed } = await supabaseAdmin
    .from("quality_score_jobs")
    .update({
      status: "running",
      locked_at: now,
      started_at: now,
    })
    .in("id", candidateIds)
    .eq("status", "pending")
    .select("id");

  return (claimed ?? []).map((c) => c.id);
}
