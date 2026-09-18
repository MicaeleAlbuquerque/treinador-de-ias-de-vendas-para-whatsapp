// Coach mode: avalia uma mensagem de vendedor contra a base de referência.
// Base de comparação, em ordem de preferência:
//   1. DNA snapshot (Tier 2, top performer + antipadrões) — mais preciso.
//   2. Playbook (Tier 1, system prompt + scripts) — funciona sem CRM/Won-Lost.
// Provider OpenAI BYOK (prioritário) > Lovable AI (Gemini), via chatCompletion.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertWithinCap, recordUsage, LlmCapHitError } from "./llm-cost.server";
import { chatCompletion } from "./ai-gateway.server";

const COACH_SYSTEM = `Você avalia se uma mensagem de um VENDEDOR segue o padrão de excelência da operação. Responda SOMENTE com JSON estrito: {"score": 0-100, "breakdown": {"tom": 0-100, "scripts": 0-100, "antipadrao": 0-100, "etapa": 0-100}, "suggestion": "texto curto e acionável em pt-BR (o que melhorar nesta mensagem)"}. score = média ponderada (40% tom, 30% scripts, 20% antipadrao, 10% etapa). antipadrao: 100 = não caiu em padrão ruim; 0 = caiu.`;

function parseScore(text: string): { score: number; breakdown: Record<string, number>; suggestion: string } {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    const j = JSON.parse(match[0]);
    const score = Math.max(0, Math.min(100, Number(j.score ?? 0)));
    return {
      score,
      breakdown: j.breakdown && typeof j.breakdown === "object" ? j.breakdown : {},
      suggestion: String(j.suggestion ?? "").slice(0, 600),
    };
  } catch {
    return { score: 50, breakdown: {}, suggestion: "" };
  }
}

// Mensagem "substancial" pra Coach: descarta confirmações curtas ("Blz",
// "Sim", "Ok") que só gerariam nota baixa contra um playbook de venda.
export function isSubstantialContent(t: string | null | undefined): boolean {
  const c = (t ?? "").trim();
  return c.length >= 25 && c.split(/\s+/).length >= 4;
}

type Baseline =
  | { mode: "dna"; snapshotId: string; context: string }
  | { mode: "playbook"; context: string };

// Tier 2: top performer + antipadrões + objeções vencedoras do DNA snapshot.
async function buildDnaBaseline(snapId: string): Promise<Baseline | null> {
  const { data: top } = await supabaseAdmin
    .from("seller_dna_scores")
    .select("stage_distribution, win_rate")
    .eq("snapshot_id", snapId)
    .eq("is_top_performer", true)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: antis } = await supabaseAdmin
    .from("dna_antipatterns")
    .select("ngram")
    .eq("snapshot_id", snapId)
    .order("lift", { ascending: false })
    .limit(20);
  const { data: objs } = await supabaseAdmin
    .from("dna_objections")
    .select("category, seller_response")
    .eq("snapshot_id", snapId)
    .order("win_rate", { ascending: false })
    .limit(10);

  const context = `BASE: DNA do top performer da operação.
Antipadrões a evitar (aparecem mais em conversas perdidas): ${(antis ?? []).map((a) => a.ngram).slice(0, 10).join(", ") || "(nenhum)"}.
Padrões vencedores para objeções: ${(objs ?? []).map((o) => `[${o.category}] ${(o.seller_response ?? "").slice(0, 80)}`).slice(0, 5).join(" | ") || "(nenhum)"}.
Top performer: win_rate=${top?.win_rate ?? "?"}, distribuição de etapas=${JSON.stringify(top?.stage_distribution ?? {})}.`;
  return { mode: "dna", snapshotId: snapId, context };
}

// Tier 1: system prompt + scripts vencedores/a evitar do Playbook.
async function buildPlaybookBaseline(playbookId: string): Promise<Baseline | null> {
  const { data: pb } = await supabaseAdmin
    .from("playbook_snapshots")
    .select("system_prompt, winning_scripts, losing_scripts")
    .eq("id", playbookId)
    .maybeSingle();
  if (!pb) return null;
  const win = (pb.winning_scripts as any[] | null) ?? [];
  const lose = (pb.losing_scripts as any[] | null) ?? [];
  const context = `BASE: Playbook do atendimento (extraído das conversas reais do time).
Como o atendimento ideal funciona (resumo): ${String(pb.system_prompt ?? "").slice(0, 900)}
Scripts VENCEDORES (seguir o espírito): ${win.map((s) => `[${s.category}] ${String(s.script ?? "").slice(0, 80)}`).slice(0, 8).join(" | ") || "(nenhum)"}.
Padrões a EVITAR: ${lose.map((s) => `[${s.category}] ${String(s.script ?? "").slice(0, 80)}`).slice(0, 8).join(" | ") || "(nenhum)"}.`;
  return { mode: "playbook", context };
}

export async function coachEvaluateMessage(messageId: string): Promise<{ skipped?: string; score?: number }> {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("current_dna_snapshot_id, current_playbook_snapshot_id")
    .eq("id", true)
    .maybeSingle();

  // already evaluated?
  const { data: existing } = await supabaseAdmin
    .from("coach_evaluations").select("id").eq("message_id", messageId).maybeSingle();
  if (existing) return { skipped: "already" };

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id, conversation_id, sender_role, text, audio_transcript, stage")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.sender_role !== "seller") return { skipped: "not_seller" };

  const content = (msg.text ?? msg.audio_transcript ?? "").trim();
  if (!content) return { skipped: "empty" };
  // Pula mensagens triviais (confirmações curtas tipo "Blz", "Sim", "Ok"):
  // avaliá-las contra um playbook de venda só gera nota baixa e ruído.
  if (content.length < 25 || content.split(/\s+/).length < 4) return { skipped: "trivial" };

  // Decide a base: DNA (Tier 2) tem prioridade; senão Playbook (Tier 1).
  let baseline: Baseline | null = null;
  const snapId = (settings as any)?.current_dna_snapshot_id as string | null;
  const playbookId = (settings as any)?.current_playbook_snapshot_id as string | null;
  if (snapId) baseline = await buildDnaBaseline(snapId);
  if (!baseline && playbookId) baseline = await buildPlaybookBaseline(playbookId);
  if (!baseline) return { skipped: "no_baseline" };

  try {
    await assertWithinCap(0.001);
  } catch (e) {
    if (e instanceof LlmCapHitError) return { skipped: "budget" };
    throw e;
  }

  const user = `Mensagem do vendedor (etapa declarada: ${msg.stage ?? "?"}):
"""${content.slice(0, 800)}"""

${baseline.context}

Avalie a mensagem contra essa base (tom, uso de scripts vencedores, ausência de antipadrões, coerência com a etapa) e devolva o JSON.`;

  let text: string;
  let provider: string;
  let model: string;
  try {
    const out = await chatCompletion({
      systemPrompt: COACH_SYSTEM,
      userPrompt: user,
      responseFormat: "json",
      temperature: 0.2,
    });
    text = out.text;
    provider = out.provider;
    model = out.model;
  } catch {
    return { skipped: "llm_error" };
  }

  await recordUsage({
    provider,
    model,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0.0008,
    source: "other",
  });
  const parsed = parseScore(text);

  // Upsert por message_id (unique) — evita duplicata em corrida cron x backlog.
  await supabaseAdmin.from("coach_evaluations").upsert({
    message_id: messageId,
    conversation_id: msg.conversation_id,
    dna_snapshot_id: baseline.mode === "dna" ? baseline.snapshotId : null,
    score: parsed.score,
    adherence_breakdown: parsed.breakdown as any,
    suggestion: parsed.suggestion,
  }, { onConflict: "message_id", ignoreDuplicates: true });

  // NÃO notifica por mensagem (gerava flood de centenas de avisos). Os desvios
  // já aparecem no painel "Últimas saídas do padrão" da tela Coach, lendo
  // coach_evaluations direto. Alertas, se voltarem, devem ser agregados.

  return { score: parsed.score };
}

// Processa mensagens de vendedor sem avaliação Coach (retroativo + cron worker).
// Considera só mensagens com CONTEÚDO textual (text ou transcrição) — mídia/áudio
// sem texto seria "skipped" e ficaria re-tentada a cada lote, travando o avanço.
export async function processCoachQueue(limit = 20): Promise<{ processed: number; skipped: number; remaining: number }> {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("current_dna_snapshot_id, current_playbook_snapshot_id")
    .eq("id", true)
    .maybeSingle();
  const snapId = (settings as any)?.current_dna_snapshot_id as string | null;
  const playbookId = (settings as any)?.current_playbook_snapshot_id as string | null;
  if (!snapId && !playbookId) {
    throw new Error("A Coach precisa de uma base de comparação. Gere um Playbook ou DNA primeiro na aba DNA.");
  }

  const { data } = await supabaseAdmin
    .from("messages")
    .select("id, text, audio_transcript")
    .eq("sender_role", "seller")
    .order("created_at", { ascending: false })
    .limit(6000);
  // Só mensagens SUBSTANCIAIS — alinhado ao skip "trivial" do coachEvaluateMessage.
  const withContent = (data ?? []).filter((m) => isSubstantialContent(m.text) || isSubstantialContent(m.audio_transcript));
  if (!withContent.length) return { processed: 0, skipped: 0, remaining: 0 };
  const ids = withContent.map((m) => m.id);
  // Filtro reverso: busca os message_id JÁ avaliados (mais recentes) SEM usar
  // .in() com a lista gigante de candidatos — esse .in() estoura o limite de
  // URL do PostgREST e voltava vazio, fazendo o lote re-processar mensagens já
  // avaliadas ("already") e nunca avançar.
  const { data: existing } = await supabaseAdmin
    .from("coach_evaluations")
    .select("message_id")
    .order("created_at", { ascending: false })
    .limit(5000);
  const done = new Set((existing ?? []).map((e) => e.message_id));
  const todo = ids.filter((i) => !done.has(i));
  const batch = todo.slice(0, limit);
  let processed = 0;
  let skipped = 0;
  for (const id of batch) {
    try {
      const r = await coachEvaluateMessage(id);
      if (r.score != null) processed++;
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { processed, skipped, remaining: Math.max(0, todo.length - batch.length) };
}

// Stats da fila da Coach — pending conta só mensagens SUBSTANCIAIS sem avaliação
// (não confirmações triviais), pra o contador da UI bater com o que roda e zerar.
export async function getCoachQueueStats(): Promise<{ sellerMessages: number; evaluated: number; pending: number }> {
  const { count: sellerMessages } = await supabaseAdmin
    .from("messages").select("id", { count: "exact", head: true }).eq("sender_role", "seller");
  const { count: evaluated } = await supabaseAdmin
    .from("coach_evaluations").select("id", { count: "exact", head: true });
  const { data } = await supabaseAdmin
    .from("messages").select("id, text, audio_transcript")
    .eq("sender_role", "seller").order("created_at", { ascending: false }).limit(6000);
  const substantial = (data ?? []).filter((m) => isSubstantialContent(m.text) || isSubstantialContent(m.audio_transcript));
  const { data: evals } = await supabaseAdmin
    .from("coach_evaluations").select("message_id").order("created_at", { ascending: false }).limit(8000);
  const done = new Set((evals ?? []).map((e) => e.message_id));
  const pending = substantial.filter((m) => !done.has(m.id)).length;
  return { sellerMessages: sellerMessages ?? 0, evaluated: evaluated ?? 0, pending };
}
