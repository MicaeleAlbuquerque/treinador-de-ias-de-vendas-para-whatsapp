import { createFileRoute } from "@tanstack/react-router";
import { ensureQualityScoreJobs, claimQualityScoreJobs, processQualityScoreJob } from "@/lib/quality-score.server";
import { isCronAuthorized } from "@/lib/cron-auth.server";

async function handle(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  await ensureQualityScoreJobs(200);

  const claimed = await claimQualityScoreJobs(10);
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
