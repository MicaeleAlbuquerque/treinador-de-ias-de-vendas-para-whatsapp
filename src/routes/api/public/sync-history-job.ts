import { isCronAuthorized } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processSyncHistoryJob } from "@/lib/whatsapp.functions";

async function handle(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Claim atômico: pega até 1 job pending (single-tenant não precisa concorrência alta).
  const { data: claimed, error } = await supabaseAdmin.rpc("claim_pending_jobs", {
    _table: "sync_jobs",
    _batch_size: 1,
  });
  if (error) {
    console.error("[sync-history-job] claim failed", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const jobIds = (claimed as unknown as string[]) ?? [];
  if (jobIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];
  for (const jobId of jobIds) {
    try {
      await processSyncHistoryJob(jobId);
      results.push({ jobId, ok: true });
    } catch (e) {
      results.push({ jobId, ok: false, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: jobIds.length, results }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/sync-history-job")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
