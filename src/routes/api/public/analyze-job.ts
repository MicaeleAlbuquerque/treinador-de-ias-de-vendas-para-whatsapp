import { isCronAuthorized } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";
import { processPendingJobs } from "@/lib/analyze.server";
import { recalculateDna } from "@/lib/dna.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function handle(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
  const processed = await processPendingJobs(5);
  // Daily DNA recalc: if last snapshot > 24h ago, attempt recalc (best-effort).
  const { data } = await supabaseAdmin
    .from("app_settings").select("last_dna_snapshot_at").eq("id", true).maybeSingle();
  let daily = false;
  const last = data?.last_dna_snapshot_at ? new Date(data.last_dna_snapshot_at).getTime() : 0;
  if (Date.now() - last > 24 * 60 * 60 * 1000) {
    try { await recalculateDna(null); daily = true; } catch { /* ignore */ }
  }
  return new Response(JSON.stringify({ ok: true, processed, dailyRecalc: daily }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/analyze-job")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});