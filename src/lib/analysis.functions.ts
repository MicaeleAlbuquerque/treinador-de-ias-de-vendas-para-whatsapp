import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueAnalysis } from "./analyze.server";
import { recalculateDna } from "./dna.server";

const OUTCOMES = ["won", "lost", "in_progress", "unknown"] as const;

async function isAdmin(userId: string): Promise<boolean> {
  // Single-tenant: qualquer usuário autenticado é admin.
  // Garante a linha em user_roles para auditoria/compatibilidade.
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  return true;
}

async function bumpTaggedCounter(): Promise<void> {
  // Read current value, increment. Atomic-ish; collisions are non-critical.
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("tagged_since_snapshot")
    .eq("id", true)
    .maybeSingle();
  const cur = data?.tagged_since_snapshot ?? 0;
  const next = cur + 1;
  await supabaseAdmin
    .from("app_settings")
    .update({ tagged_since_snapshot: next, updated_at: new Date().toISOString() })
    .eq("id", true);

  // Auto-recalc trigger: every 10 new tagged convs since last snapshot.
  if (next >= 10) {
    try {
      await recalculateDna(null);
    } catch (e) {
      console.warn("[analysis] auto recalc failed:", (e as Error).message);
    }
  }
}

export const tagConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversationId: string; outcome: string; outcomeValue?: number | null; confirm?: boolean }) =>
    z
      .object({
        conversationId: z.string().uuid(),
        outcome: z.enum(OUTCOMES),
        outcomeValue: z.number().nullable().optional(),
        confirm: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.userId);
    const { data: prev } = await supabaseAdmin
      .from("conversations")
      .select("outcome, auto_marked")
      .eq("id", data.conversationId)
      .single();
    if (!prev) throw new Error("Conversa não encontrada");

    const isFinal = data.outcome === "won" || data.outcome === "lost";
    const wasFinal = prev.outcome === "won" || prev.outcome === "lost";
    const autoMarked = data.confirm ? false : !admin;

    const { error } = await supabaseAdmin
      .from("conversations")
      .update({
        outcome: data.outcome,
        outcome_value: data.outcomeValue ?? null,
        outcome_by: context.userId,
        outcome_at: data.outcome === "unknown" ? null : new Date().toISOString(),
        outcome_auto_tagged: false,
        auto_marked: autoMarked,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);

    if (isFinal && !wasFinal) {
      await enqueueAnalysis(data.conversationId);
      await bumpTaggedCounter();
    }
    return { ok: true };
  });

export const bulkTagConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[]; outcome: string }) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        outcome: z.enum(OUTCOMES),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.userId);
    const isFinal = data.outcome === "won" || data.outcome === "lost";
    const autoMarked = !admin;
    const { error } = await supabaseAdmin
      .from("conversations")
      .update({
        outcome: data.outcome,
        outcome_by: context.userId,
        outcome_at: data.outcome === "unknown" ? null : new Date().toISOString(),
        outcome_auto_tagged: false,
        auto_marked: autoMarked,
        updated_at: new Date().toISOString(),
      })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    if (isFinal) {
      for (const id of data.ids) await enqueueAnalysis(id);
      // Bump counter once per conversation tagged final
      for (let i = 0; i < data.ids.length; i++) await bumpTaggedCounter();
    }
    return { ok: true, count: data.ids.length };
  });

export const reclassifyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { messageId: string; stage: string }) =>
    z
      .object({
        messageId: z.string().uuid(),
        stage: z.enum(["abertura", "qualificacao", "valor", "objecao", "fechamento"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    void context;
    const { error } = await supabaseAdmin
      .from("messages")
      .update({ stage: data.stage as any, stage_manual: true, stage_confidence: 1 })
      .eq("id", data.messageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const triggerDnaRecalc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Apenas administradores.");
    return await recalculateDna(context.userId);
  });

export const setCurrentSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { snapshotId: string }) =>
    z.object({ snapshotId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Apenas administradores.");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({ current_dna_snapshot_id: data.snapshotId, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAnalysisSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { minWon: number; minLost: number; minSellers: number; individualMode: boolean; capUsd: number }) =>
    z
      .object({
        minWon: z.number().int().min(1).max(1000),
        minLost: z.number().int().min(1).max(1000),
        minSellers: z.number().int().min(1).max(1000),
        individualMode: z.boolean(),
        capUsd: z.number().min(0.1).max(10000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Apenas administradores.");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({
        dna_min_won: data.minWon,
        dna_min_lost: data.minLost,
        dna_min_sellers: data.minSellers,
        dna_individual_mode: data.individualMode,
        llm_cost_cap_usd_day: data.capUsd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getDnaSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    void context;
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("current_dna_snapshot_id, last_dna_snapshot_at, dna_min_won, dna_min_lost, dna_min_sellers, dna_individual_mode, dna_use_quality_score, dna_quality_min_good, dna_quality_max_bad")
      .eq("id", true)
      .maybeSingle();
    return data ?? null;
  });

export const getDnaSnapshotDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { snapshotId?: string | null }) =>
    z.object({ snapshotId: z.string().uuid().nullable().optional() }).optional().parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    void context;
    let targetSnapId = data?.snapshotId;

    if (!targetSnapId) {
      const { data: settings } = await supabaseAdmin
        .from("app_settings")
        .select("current_dna_snapshot_id")
        .eq("id", true)
        .maybeSingle();
      targetSnapId = settings?.current_dna_snapshot_id ?? null;
    }

    if (!targetSnapId) {
      return {
        snapshot: null,
        scores: [],
        objections: [],
        antipatterns: [],
      };
    }

    const { data: snap } = await supabaseAdmin
      .from("dna_snapshots")
      .select("id, created_at, total_conversations_analyzed, top_performer_seller_id")
      .eq("id", targetSnapId)
      .maybeSingle();

    if (!snap) {
      return {
        snapshot: null,
        scores: [],
        objections: [],
        antipatterns: [],
      };
    }

    const { data: rawScores } = await supabaseAdmin
      .from("seller_dna_scores")
      .select("*")
      .eq("snapshot_id", targetSnapId)
      .order("score", { ascending: false });

    const rows = rawScores ?? [];
    const sellerIds = [...new Set(rows.map((r: any) => r.seller_id).filter(Boolean))];
    const nameById = new Map<string, string>();
    if (sellerIds.length > 0) {
      const { data: ss } = await supabaseAdmin.from("sellers").select("id, name").in("id", sellerIds);
      for (const s of ss ?? []) nameById.set(s.id, s.name);
    }

    const scores = rows.map((r: any) => ({
      ...r,
      seller_name: nameById.get(r.seller_id) ?? "—",
    }));

    const { data: objections } = await supabaseAdmin
      .from("dna_objections")
      .select("*")
      .eq("snapshot_id", targetSnapId)
      .order("win_rate", { ascending: false });

    const { data: antipatterns } = await supabaseAdmin
      .from("dna_antipatterns")
      .select("*")
      .eq("snapshot_id", targetSnapId)
      .order("lift", { ascending: false })
      .limit(50);

    return {
      snapshot: snap,
      scores,
      objections: objections ?? [],
      antipatterns: antipatterns ?? [],
    };
  });

export const listDnaSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    void context;
    const { data } = await supabaseAdmin
      .from("dna_snapshots")
      .select("id, created_at, total_conversations_analyzed")
      .order("created_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });