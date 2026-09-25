// Conversation analyzer. Calls Lovable AI Gateway to classify messages into
// sales stages, then computes cadence/objections/vocabulary heuristics.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chargeLlmCost } from "./llm-cost.server";
import { chatCompletion, resolveChatProvider } from "./ai-gateway.server";

const STAGES = ["abertura", "qualificacao", "valor", "objecao", "fechamento"] as const;
type Stage = (typeof STAGES)[number];

const OBJECTION_PATTERNS: { category: string; re: RegExp }[] = [
  { category: "preco", re: /\b(t[aá]\s*caro|caro\s*demais|muito\s*caro|caro)\b/i },
  { category: "tempo", re: /\b(vou\s*pensar|t[oô]\s*pensando|me\s*d[aá]\s*um\s*tempo)\b/i },
  { category: "autoridade", re: /\b(preciso\s*falar|tenho\s*que\s*ver\s*com|consultar)\b/i },
  { category: "canal", re: /\b(manda\s*email|manda\s*por\s*email|email)\b/i },
  { category: "orcamento", re: /\b(sem\s*or[cç]amento|n[aã]o\s*tenho\s*verba|fora\s*do\s*or[cç]amento)\b/i },
  { category: "avaliacao", re: /\b(t[oô]\s*avaliando|comparando|cota[cç][aã]o|or[cç]amento)\b/i },
  { category: "desconto", re: /\b(tem\s*desconto|abaixar|negociar|melhor\s*pre[cç]o)\b/i },
];

const STOPWORDS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","na","no","nas","nos","um","uma","uns","umas","para","pra","por","com","sem","ao","que","se","ou","é","ser","sou","seu","sua","seus","suas","te","ti","tu","me","mim","você","voce","vc","eu","nós","nos","ele","ela","eles","elas","isso","isto","aqui","ali","já","ja","mas","como","muito","mais","menos","tá","ta","tô","to","sim","não","nao","oi","ola","olá","ok","valeu","obrigado","obrigada",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t.length >= 2 && !STOPWORDS.has(t));
}

export type BizHours = { start: string; end: string; days: number[]; tz?: string };

export const DEFAULT_TZ = process.env.APP_TIMEZONE || "America/Sao_Paulo";

/**
 * Retorna {year, month, day, hour, minute, weekday} no fuso especificado,
 * usando Intl.DateTimeFormat (sem libs). weekday: 0=Dom..6=Sáb.
 */
export function partsInTz(d: Date, tz: string = DEFAULT_TZ) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday as string] ?? 0,
  };
}

export function minutesRespectingBizHours(fromIso: string, toIso: string, bh: BizHours): number {
  const tz = bh.tz || DEFAULT_TZ;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (to <= from) return 0;
  const [sH, sM] = bh.start.split(":").map(Number);
  const [eH, eM] = bh.end.split(":").map(Number);
  const startMin = (sH ?? 9) * 60 + (sM ?? 0);
  const endMin = (eH ?? 18) * 60 + (eM ?? 0);
  if (endMin <= startMin) return 0;

  let total = 0;
  let cur = from.getTime();
  const toMs = to.getTime();

  while (cur < toMs) {
    const p = partsInTz(new Date(cur), tz);
    const minuteOfDay = p.hour * 60 + p.minute;
    const minutesUntilMidnight = Math.max(1, 1440 - minuteOfDay);
    const endOfThisDayOrTo = Math.min(cur + minutesUntilMidnight * 60_000, toMs);

    if (bh.days.includes(p.weekday)) {
      const elapsedOnThisDay = (endOfThisDayOrTo - cur) / 60_000;
      const startOfInterval = minuteOfDay;
      const endOfInterval = minuteOfDay + elapsedOnThisDay;
      const overlapStart = Math.max(startOfInterval, startMin);
      const overlapEnd = Math.min(endOfInterval, endMin);
      if (overlapEnd > overlapStart) {
        total += (overlapEnd - overlapStart);
      }
    }
    cur = endOfThisDayOrTo;
  }

  return Math.round(total * 100) / 100;
}

async function classifyStagesWithLLM(
  messages: { id: string; role: string; text: string }[],
): Promise<Map<string, { stage: Stage; confidence: number }>> {
  const result = new Map<string, { stage: Stage; confidence: number }>();
  // Only seller text-bearing messages need classification.
  const subject = messages.filter((m) => m.role === "seller" && m.text && m.text.length > 1).slice(0, 80);
  if (subject.length === 0) return result;

  // Provider OpenAI BYOK (prioritário) > Lovable AI (Gemini). Se nenhum estiver
  // configurado, chatCompletion lança e a gente retorna vazio (best-effort).
  let resolved;
  try {
    resolved = await resolveChatProvider();
  } catch {
    return result;
  }
  // Custo aproximado plano de $0.001/chamada pra manter a matemática do cap simples.
  await chargeLlmCost({ provider: resolved.provider, model: resolved.model, costUsd: 0.001, source: "analyze" });

  const numbered = subject.map((m, i) => `[${i}] ${m.text.slice(0, 400)}`).join("\n");
  const prompt = `Classifique cada mensagem do vendedor abaixo em uma destas etapas de venda: abertura, qualificacao, valor, objecao, fechamento. Retorne APENAS JSON no formato {"items":[{"i":0,"stage":"abertura","confidence":0.0}]}.\n\n${numbered}`;

  let raw: string;
  try {
    const out = await chatCompletion({
      resolved,
      systemPrompt: "Você classifica mensagens de vendedores em etapas. Responda só JSON válido.",
      userPrompt: prompt,
      responseFormat: "json",
    });
    raw = out.text || "{}";
  } catch (e) {
    console.warn("[analyze] LLM stage classify falhou:", (e as Error).message);
    return result;
  }
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { return result; }
      } else {
        return result;
      }
    }
  }
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  for (const it of items) {
    const idx = Number(it.i);
    const stage = String(it.stage);
    const conf = Number(it.confidence ?? 0.7);
    if (Number.isFinite(idx) && STAGES.includes(stage as Stage) && subject[idx]) {
      result.set(subject[idx]!.id, { stage: stage as Stage, confidence: Math.max(0, Math.min(1, conf)) });
    }
  }
  return result;
}

export async function analyzeConversation(conversationId: string): Promise<void> {
  const { data: msgs, error } = await supabaseAdmin
    .from("messages")
    .select("id, sender_role, ts, media_type, text, audio_transcript, stage, stage_manual")
    .eq("conversation_id", conversationId)
    .order("ts", { ascending: true });
  if (error) throw new Error(error.message);
  if (!msgs || msgs.length === 0) return;

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("business_hours")
    .eq("id", true)
    .maybeSingle();
  const bh = (settings?.business_hours as any) ?? { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] };

  // ===== Cadence =====
  let firstResponse: number | null = null;
  const responseDeltas: number[] = [];
  let lastLeadTs: string | null = null;
  for (const m of msgs) {
    if (m.sender_role === "lead") {
      lastLeadTs = m.ts;
    } else if (m.sender_role === "seller" && lastLeadTs) {
      const delta = minutesRespectingBizHours(lastLeadTs, m.ts, bh);
      if (firstResponse === null) firstResponse = delta;
      responseDeltas.push(delta);
      lastLeadTs = null;
    }
  }
  const avgResponse =
    responseDeltas.length > 0
      ? responseDeltas.reduce((a, b) => a + b, 0) / responseDeltas.length
      : null;

  // ===== Audio % =====
  const total = msgs.length;
  const audioCount = msgs.filter((m) => m.media_type === "audio").length;
  const audioPct = total > 0 ? (audioCount / total) * 100 : 0;

  // ===== Vocabulary (top 20 non-stopwords) =====
  const freq = new Map<string, number>();
  for (const m of msgs) {
    const t = (m.text ?? "") + " " + (m.audio_transcript ?? "");
    for (const tok of tokenize(t)) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }
  const topVocab = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w, c]) => ({ word: w, count: c }));

  // ===== Objections =====
  await supabaseAdmin.from("objections").delete().eq("conversation_id", conversationId);
  const objRows: any[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]!;
    if (m.sender_role !== "lead" || !m.text) continue;
    for (const { category, re } of OBJECTION_PATTERNS) {
      if (re.test(m.text)) {
        const next = msgs.slice(i + 1).find((x) => x.sender_role === "seller");
        objRows.push({
          conversation_id: conversationId,
          lead_msg_id: m.id,
          seller_msg_id: next?.id ?? null,
          category,
          lead_excerpt: m.text.slice(0, 280),
          seller_response: next?.text?.slice(0, 500) ?? next?.audio_transcript?.slice(0, 500) ?? null,
        });
        break;
      }
    }
  }
  if (objRows.length) await supabaseAdmin.from("objections").insert(objRows);

  // ===== Stage classification (LLM, skip manual overrides) =====
  const subj = msgs
    .filter((m) => !m.stage_manual)
    .map((m) => ({ id: m.id, role: m.sender_role, text: m.text ?? m.audio_transcript ?? "" }));
  try {
    const stageMap = await classifyStagesWithLLM(subj);
    for (const [id, info] of stageMap) {
      await supabaseAdmin
        .from("messages")
        .update({ stage: info.stage, stage_confidence: info.confidence })
        .eq("id", id);
    }
  } catch (e) {
    console.warn("[analyze] stage classification failed:", (e as Error).message);
    // Carry on with metrics; stages will retry next analysis.
  }

  await supabaseAdmin
    .from("conversations")
    .update({
      first_response_minutes: firstResponse,
      avg_response_minutes: avgResponse,
      audio_pct: audioPct,
      vocabulary: topVocab as any,
      analysis_status: "done",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

/** Process up to N pending jobs com claim atômico (anti-race). */
export async function processPendingJobs(limit: number = 5): Promise<number> {
  const { data: claimed, error } = await supabaseAdmin.rpc("claim_pending_jobs", {
    _table: "analysis_jobs",
    _batch_size: limit,
  });
  if (error) {
    console.error("[analyze] claim failed", error.message);
    return 0;
  }
  const jobIds = (claimed as unknown as string[]) ?? [];
  if (jobIds.length === 0) return 0;

  // Re-buscar jobs com conversation_id (claim só retorna ids)
  const { data: jobs } = await supabaseAdmin
    .from("analysis_jobs")
    .select("id, conversation_id, attempt_count")
    .in("id", jobIds);
  if (!jobs || jobs.length === 0) return 0;

  let processed = 0;
  for (const job of jobs) {
    try {
      await analyzeConversation(job.conversation_id);
      await supabaseAdmin
        .from("analysis_jobs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", job.id);
      processed++;
    } catch (e) {
      const attempt = (job.attempt_count ?? 1);
      const giveUp = attempt >= 3;
      await supabaseAdmin
        .from("analysis_jobs")
        .update({
          status: giveUp ? "failed" : "pending",
          locked_at: null,
          finished_at: giveUp ? new Date().toISOString() : null,
          error_text: (e as Error).message.slice(0, 500),
        })
        .eq("id", job.id);
    }
  }
  return processed;
}

/** Enqueue an analysis job (idempotent: skip if pending/running exists). */
export async function enqueueAnalysis(conversationId: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("analysis_jobs")
    .select("id")
    .eq("conversation_id", conversationId)
    .in("status", ["pending", "running"])
    .limit(1);
  if (existing && existing.length > 0) return;
  await supabaseAdmin.from("analysis_jobs").insert({ conversation_id: conversationId });
}