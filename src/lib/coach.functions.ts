import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { coachEvaluateMessage, processCoachQueue, getCoachQueueStats } from "./coach.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(_supabase: any, userId: string) {
  if (!userId) throw new Error("Não autenticado.");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (data && data.length > 0 && !data.some((r: any) => r.role === "admin")) {
    throw new Error("Apenas administradores.");
  }
}

export const evaluateMessageCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => coachEvaluateMessage(data.messageId));

export const setCoachThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threshold: z.number().int().min(0).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    await supabaseAdmin
      .from("app_settings")
      .update({ coach_alert_threshold: data.threshold, updated_at: new Date().toISOString() } as any)
      .eq("id", true);
    return { ok: true };
  });

// Roda a Coach sobre o histórico já importado (retroativo), em lotes.
export const runCoachBacklog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ batch: z.number().int().min(1).max(50).default(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return await processCoachQueue(data.batch);
  });

// Status da Coach pra UI: qual base está em uso (dna/playbook/none) e progresso
// de avaliação das mensagens de vendedor.
export const getCoachStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("current_dna_snapshot_id, current_playbook_snapshot_id, coach_alert_threshold")
      .eq("id", true)
      .maybeSingle();
    const hasDna = !!(settings as any)?.current_dna_snapshot_id;
    const hasPlaybook = !!(settings as any)?.current_playbook_snapshot_id;
    const baseMode: "dna" | "playbook" | "none" = hasDna ? "dna" : hasPlaybook ? "playbook" : "none";

    const stats = await getCoachQueueStats();

    return {
      baseMode,
      threshold: (settings as any)?.coach_alert_threshold ?? 60,
      sellerMessages: stats.sellerMessages,
      evaluated: stats.evaluated,
      pending: stats.pending,
    };
  });

/**
 * Aderência por vendedor nos últimos 7 dias via backend com supabaseAdmin.
 */
export const getCoachPerSellerMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: evals } = await supabaseAdmin
      .from("coach_evaluations")
      .select("score, message_id, conversation_id, created_at")
      .gte("created_at", sevenDaysAgo)
      .limit(3000);

    const convIds = [...new Set((evals ?? []).map((e) => e.conversation_id))];
    if (!convIds.length) return [];

    const { data: convs } = await supabaseAdmin
      .from("conversations")
      .select("id, seller_id, sellers ( id, name )")
      .in("id", convIds);

    const convToSeller = new Map<string, { id: string; name: string } | null>();
    for (const c of (convs ?? []) as any[]) {
      convToSeller.set(c.id, c.sellers ?? null);
    }

    const agg = new Map<string, { name: string; n: number; total: number }>();
    for (const e of evals ?? []) {
      const s = convToSeller.get(e.conversation_id);
      const key = s?.id ?? "unassigned";
      const name = s?.name ?? "— não atribuído";
      const cur = agg.get(key) ?? { name, n: 0, total: 0 };
      cur.n++;
      cur.total += Number(e.score);
      agg.set(key, cur);
    }

    return [...agg.entries()]
      .map(([id, v]) => ({ id, name: v.name, count: v.n, avg: v.total / v.n }))
      .sort((a, b) => b.avg - a.avg);
  });

/**
 * Últimas saídas do padrão abaixo do threshold via backend com supabaseAdmin.
 */
export const getCoachDeviations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("coach_alert_threshold")
      .eq("id", true)
      .maybeSingle();

    const threshold = (settings as any)?.coach_alert_threshold ?? 60;

    const { data } = await supabaseAdmin
      .from("coach_evaluations")
      .select("id, score, suggestion, conversation_id, message_id, created_at")
      .lt("score", threshold)
      .order("created_at", { ascending: false })
      .limit(30);

    return data ?? [];
  });

/**
 * Notificações recentes do Coach via backend com supabaseAdmin.
 */
export const getCoachNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("notifications")
      .select("id, title, body, payload, created_at")
      .eq("type", "coach_deviation")
      .order("created_at", { ascending: false })
      .limit(30);

    // Se ainda não houver notificações criadas, popula a partir das saídas de padrão existentes
    if (!data || data.length === 0) {
      const { data: devs } = await supabaseAdmin
        .from("coach_evaluations")
        .select("id, score, suggestion, conversation_id, message_id, created_at")
        .lt("score", 60)
        .order("created_at", { ascending: false })
        .limit(10);

      if (devs && devs.length > 0) {
        await supabaseAdmin.from("notifications").insert(
          devs.map((d) => ({
            type: "coach_deviation",
            title: `Saída do padrão detectada (${Math.round(Number(d.score))} pts)`,
            body: d.suggestion || "O vendedor se desviou do padrão de atendimento.",
            payload: {
              conversation_id: d.conversation_id,
              message_id: d.message_id,
              score: d.score,
            },
            created_at: d.created_at,
          }))
        );

        const { data: fresh } = await supabaseAdmin
          .from("notifications")
          .select("id, title, body, payload, created_at")
          .eq("type", "coach_deviation")
          .order("created_at", { ascending: false })
          .limit(30);

        return fresh ?? [];
      }
    }

    return data ?? [];
  });