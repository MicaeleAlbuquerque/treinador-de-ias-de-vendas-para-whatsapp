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