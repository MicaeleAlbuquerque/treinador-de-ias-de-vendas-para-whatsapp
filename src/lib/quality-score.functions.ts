import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scoreAndPersistQuality, ensureQualityScoreJobs, processQualityScoreJob } from "./quality-score.server";

async function assertAdmin(_supabase: unknown, userId: string) {
  if (!userId) throw new Error("Não autenticado.");
}

// On-demand: avalia uma conversa específica AGORA (síncrono).
export const scoreQualityNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const r = await scoreAndPersistQuality(data.conversationId);
    if (!r) throw new Error("Conversa não encontrada.");
    return r;
  });

// Em lote: enfileira jobs pra todas as conversas sem score e processa N inline.
export const scoreAllPendingQuality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ batch: z.number().int().min(1).max(50).default(10) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const enqueued = await ensureQualityScoreJobs(500);

    // Libera órfãos antes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("quality_score_jobs")
      .update({ status: "pending", locked_at: null })
      .eq("status", "running")
      .lt("locked_at", tenMinutesAgo);

    // Claim atômico via RPC
    const { data: claimedRaw, error } = await supabaseAdmin.rpc("claim_pending_jobs", {
      _table: "quality_score_jobs",
      _batch_size: data.batch,
    });
    if (error) throw new Error(error.message);
    const claimed = (claimedRaw as unknown as string[]) ?? [];

    let processed = 0;
    let failed = 0;
    for (const jobId of claimed) {
      try {
        await processQualityScoreJob(jobId);
        processed++;
      } catch {
        failed++;
      }
    }

    return { enqueued, claimed: claimed.length, processed, failed };
  });

export const getQualityScoreStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const total = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .gte("message_count", 2);
    const evaluated = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .not("quality_score", "is", null);
    const good = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .gte("quality_score", 75);
    const bad = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .lte("quality_score", 40)
      .not("quality_score", "is", null);
    const pendingJobs = await supabaseAdmin
      .from("quality_score_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "running"]);
    const failedJobs = await supabaseAdmin
      .from("quality_score_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");

    return {
      total: total.count ?? 0,
      evaluated: evaluated.count ?? 0,
      good: good.count ?? 0,
      bad: bad.count ?? 0,
      pendingJobs: pendingJobs.count ?? 0,
      failedJobs: failedJobs.count ?? 0,
    };
  });

// Salvar config DNA: thresholds e toggle uso de quality
export const saveDnaQualityConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      dnaUseQualityScore: z.boolean(),
      dnaQualityMinGood: z.number().int().min(0).max(100),
      dnaQualityMaxBad: z.number().int().min(0).max(100),
    })
      .refine((x) => x.dnaQualityMaxBad < x.dnaQualityMinGood, {
        message: "max_bad deve ser menor que min_good",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    await supabaseAdmin
      .from("app_settings")
      .upsert({
        id: true,
        dna_use_quality_score: data.dnaUseQualityScore,
        dna_quality_min_good: data.dnaQualityMinGood,
        dna_quality_max_bad: data.dnaQualityMaxBad,
      } as never, { onConflict: "id" });
    return { ok: true };
  });
