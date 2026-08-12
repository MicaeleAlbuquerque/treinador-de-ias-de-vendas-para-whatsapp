import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generatePlaybook } from "./playbook.server";
import { searchWithOpenAI, chatCompletion } from "./ai-gateway.server";
import { chargeLlmCost } from "./llm-cost.server";

const SNAPSHOT_FIELDS =
  "id, generated_at, conversations_analyzed, good_samples, bad_samples, system_prompt, winning_scripts, losing_scripts, training_tips, vocabulary, voice_tone, summary, model, provider";

async function assertAdmin(_supabase: unknown, userId: string) {
  if (!userId) throw new Error("Não autenticado.");
}

// Gera novo snapshot do playbook (síncrono, ~10-30s).
export const triggerPlaybookGenerate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return await generatePlaybook(context.userId);
  });

// Retorna snapshot atual (apontado por app_settings.current_playbook_snapshot_id).
export const getCurrentPlaybook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("current_playbook_snapshot_id")
      .maybeSingle();
    const snapId = (settings as { current_playbook_snapshot_id?: string | null } | null)?.current_playbook_snapshot_id ?? null;
    if (!snapId) return null;
    const { data: snap } = await supabaseAdmin
      .from("playbook_snapshots")
      .select(SNAPSHOT_FIELDS)
      .eq("id", snapId)
      .maybeSingle();
    // Anexa o id ativo pra UI marcar "Ativa".
    return snap ? { ...snap, is_active: true } : null;
  });

// Busca um snapshot específico do histórico (pra visualizar uma versão antiga).
export const getPlaybookSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { snapshotId: string }) =>
    z.object({ snapshotId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: snap } = await supabaseAdmin
      .from("playbook_snapshots")
      .select(SNAPSHOT_FIELDS)
      .eq("id", data.snapshotId)
      .maybeSingle();
    return snap;
  });

// Histórico de snapshots + qual está ativo (pra versionamento/rollback).
export const listPlaybookHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("current_playbook_snapshot_id")
      .maybeSingle();
    const activeId =
      (settings as { current_playbook_snapshot_id?: string | null } | null)?.current_playbook_snapshot_id ?? null;
    const { data } = await supabaseAdmin
      .from("playbook_snapshots")
      .select("id, generated_at, conversations_analyzed, good_samples, bad_samples, summary, model, provider")
      .order("generated_at", { ascending: false })
      .limit(20);
    return { items: data ?? [], activeId };
  });

// Salva uma edição manual do system_prompt como NOVA versão (snapshot), copiando
// o resto do conteúdo da versão base, e ativa ela.
export const savePlaybookEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { systemPrompt: string; baseSnapshotId: string }) =>
    z.object({
      systemPrompt: z.string().min(1).max(40000),
      baseSnapshotId: z.string().uuid(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: base } = await supabaseAdmin
      .from("playbook_snapshots")
      .select(SNAPSHOT_FIELDS)
      .eq("id", data.baseSnapshotId)
      .maybeSingle();
    if (!base) throw new Error("Versão base não encontrada.");
    const b = base as Record<string, any>;
    const { data: snap, error } = await supabaseAdmin
      .from("playbook_snapshots")
      .insert({
        generated_by: context.userId,
        conversations_analyzed: b.conversations_analyzed ?? 0,
        good_samples: b.good_samples ?? 0,
        bad_samples: b.bad_samples ?? 0,
        system_prompt: data.systemPrompt,
        winning_scripts: (b.winning_scripts ?? []) as never,
        losing_scripts: (b.losing_scripts ?? []) as never,
        training_tips: (b.training_tips ?? []) as never,
        vocabulary: (b.vocabulary ?? {}) as never,
        voice_tone: (b.voice_tone ?? {}) as never,
        summary: b.summary ?? null,
        model: `${b.model ?? "manual"} · editado`,
        provider: b.provider ?? "manual",
        cost_usd: 0,
      })
      .select("id")
      .single();
    if (error || !snap) throw new Error(error?.message ?? "Falha ao salvar edição.");
    await supabaseAdmin
      .from("app_settings")
      .upsert({ id: true, current_playbook_snapshot_id: snap.id } as never, { onConflict: "id" });
    return { ok: true, snapshotId: snap.id };
  });

// Recomendação de modelo de LLM, gerada por IA e ATUALIZADA NA DATA. Tenta
// pesquisa web real (OpenAI Responses) pra capturar modelos recém-lançados;
// se não houver BYOK OpenAI, cai num LLM com a data no prompt (com ressalva).
export const recommendLlmModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const hoje = new Date().toISOString().slice(0, 10);
    const prompt = `Hoje é ${hoje}. Pesquise os modelos de LLM disponíveis ATUALMENTE e recomende os melhores pra alimentar um agente de VENDAS consultivas via WhatsApp em português brasileiro. Critérios: qualidade de conversa natural em PT-BR, fidelidade a system prompt longo e estruturado, latência e CUSTO por mensagem (alto volume). Considere lançamentos recentes — não se limite a modelos antigos.

Responda em PT-BR, markdown enxuto, assim:
- 3 a 4 modelos ATUAIS (nome + versão exata), cada um com: 1 linha do ponto forte, custo relativo (baixo/médio/alto) e "use quando".
- Uma linha final "Recomendação padrão:" com a melhor escolha geral e o porquê.
Não invente modelos nem versões; se não tiver certeza de um lançamento, omita.`;

    await chargeLlmCost({ provider: "openai", model: "gpt-4o (web_search)", costUsd: 0.02, source: "other" });

    const search = await searchWithOpenAI(prompt);
    if (search.ok) {
      return { ok: true as const, recommendation: search.text, searched: true, date: hoje };
    }
    // Fallback: sem BYOK OpenAI ou API indisponível — usa o LLM padrão com ressalva.
    const { text } = await chatCompletion({
      systemPrompt: "Você é um especialista em modelos de LLM e os recomenda por caso de uso, com honestidade sobre limites do seu conhecimento.",
      userPrompt: prompt + "\n\nIMPORTANTE: se a sua base de conhecimento tiver data de corte anterior a hoje, AVISE numa linha que pode haver modelos mais novos e que vale confirmar os lançamentos recentes.",
    });
    return { ok: true as const, recommendation: text, searched: false, date: hoje };
  });

// Dataset few-shot (Tier 1): as melhores conversas por quality_score viram
// exemplos de diálogo pra reforçar o estilo do time num agente IA.
export const generateFewShotExamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { topN?: number }) =>
    z.object({ topN: z.number().int().min(1).max(20).default(5) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Só conversas BOAS viram exemplo — piso = dna_quality_min_good (default 75).
    const { data: cfg } = await supabaseAdmin
      .from("app_settings").select("dna_quality_min_good").eq("id", true).maybeSingle();
    const minGood = (cfg as { dna_quality_min_good?: number } | null)?.dna_quality_min_good ?? 75;
    const { data: convs } = await supabaseAdmin
      .from("conversations")
      .select("id, quality_score")
      .gte("quality_score", minGood)
      .gte("message_count", 4)
      .order("quality_score", { ascending: false })
      .limit(data.topN);
    if (!convs || convs.length === 0) {
      return { ok: false as const, reason: "no_scored" as const, examples: [] as any[] };
    }
    const ids = convs.map((c) => c.id);
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("conversation_id, sender_role, text, audio_transcript, ts")
      .in("conversation_id", ids)
      .order("ts", { ascending: true });
    const byConv = new Map<string, Array<{ role: string; text: string }>>();
    for (const m of msgs ?? []) {
      const txt = (m.text ?? m.audio_transcript ?? "").trim();
      if (!txt) continue;
      const list = byConv.get(m.conversation_id) ?? [];
      list.push({ role: m.sender_role === "seller" ? "vendedor" : "lead", text: txt });
      byConv.set(m.conversation_id, list);
    }
    const examples = convs
      .map((c) => ({ score: c.quality_score, turns: byConv.get(c.id) ?? [] }))
      .filter((e) => e.turns.length >= 2);
    return { ok: true as const, examples };
  });

// Restaura (ativa) um snapshot do histórico como o playbook atual.
export const setActivePlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { snapshotId: string }) =>
    z.object({ snapshotId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: snap } = await supabaseAdmin
      .from("playbook_snapshots")
      .select("id")
      .eq("id", data.snapshotId)
      .maybeSingle();
    if (!snap) throw new Error("Versão não encontrada.");
    await supabaseAdmin
      .from("app_settings")
      .upsert({ id: true, current_playbook_snapshot_id: data.snapshotId } as never, { onConflict: "id" });
    return { ok: true };
  });
