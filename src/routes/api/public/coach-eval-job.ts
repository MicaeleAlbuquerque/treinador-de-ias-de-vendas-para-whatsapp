import { createFileRoute } from "@tanstack/react-router";
import { processCoachQueue } from "@/lib/coach.server";
import { isCronAuthorized } from "@/lib/cron-auth.server";

async function handle(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
  const result = await processCoachQueue(10);
  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/coach-eval-job")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
