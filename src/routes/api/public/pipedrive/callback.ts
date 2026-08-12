import { createFileRoute } from "@tanstack/react-router";
import { handleCallback, verifyOAuthState } from "@/lib/pipedrive.server";

async function handle(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return htmlResponse("Pedido inválido (sem code).", 400);

  const userId = await verifyOAuthState(state);
  if (!userId) return htmlResponse("State OAuth inválido ou expirado. Reinicie a conexão.", 400);

  try {
    await handleCallback(code, userId);
  } catch (e) {
    return htmlResponse(`Erro ao concluir OAuth: ${(e as Error).message}`, 500);
  }
  return new Response(null, {
    status: 302,
    headers: { location: "/app/settings?tab=integracoes&pipedrive=ok" },
  });
}

function htmlResponse(body: string, status: number) {
  return new Response(`<!doctype html><meta charset="utf-8"><title>Pipedrive</title>
    <body style="font:14px system-ui;padding:32px;color:#111">${body}
    <p><a href="/app/settings?tab=integracoes">Voltar</a></p></body>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/pipedrive/callback")({
  server: { handlers: { GET: ({ request }) => handle(request) } },
});
