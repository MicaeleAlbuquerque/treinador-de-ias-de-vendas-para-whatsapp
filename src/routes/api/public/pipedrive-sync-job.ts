import { isCronAuthorized } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";
import { syncAllPending, isConnected } from "@/lib/pipedrive.server";

async function handle(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
  if (!(await isConnected())) {
    return new Response(JSON.stringify({ ok: true, skipped: "not_connected" }), {
      headers: { "content-type": "application/json" },
    });
  }
  const r = await syncAllPending(50);
  return new Response(JSON.stringify({ ok: true, ...r }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/pipedrive-sync-job")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});