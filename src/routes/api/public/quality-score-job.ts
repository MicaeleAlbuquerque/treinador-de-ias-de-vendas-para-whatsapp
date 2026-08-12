import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureQualityScoreJobs, processQualityScoreJob } from "@/lib/quality-score.server";
import { isCronAuthorized } from "@/lib/cron-auth.server";

async function handle(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  await ensureQualityScoreJobs(200);

  const { data, error } = await supabaseAdmin.rpc("claim_pending_jobs", {
    _table: "quality_score_jobs",
    _batch_size: 10,
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const claimed = (data as unknown as string[]) ?? [];
  if (claimed.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

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

  return new Response(JSON.stringify({ ok: true, processed, failed }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/quality-score-job")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
