import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cache do secret do banco (evita 1 query por request de cron).
let cache: { secret: string | null; at: number } | null = null;

// Autoriza chamadas de cron/worker. Aceita o CRON_SECRET (env var) OU o secret
// guardado em app_secrets.cron_secret. O segundo permite agendar via pg_cron
// sem depender de env var (o secret é gerenciado no próprio banco).
export async function isCronAuthorized(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-cron-secret");
  if (!provided) return false;

  const env = process.env.CRON_SECRET;
  if (env && provided === env) return true;

  const now = Date.now();
  // Usa cache só se já tiver um secret válido (não envenena com null de uma
  // leitura que falhou antes do schema recarregar).
  if (!cache || !cache.secret || now - cache.at > 60_000) {
    const { data, error } = await supabaseAdmin
      .from("app_secrets")
      .select("cron_secret")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      console.warn("[cron-auth] leitura de cron_secret falhou:", error.message);
      return false;
    }
    const secret = (data as { cron_secret?: string | null } | null)?.cron_secret ?? null;
    if (secret) cache = { secret, at: now };
    else return false;
  }
  return !!cache.secret && provided === cache.secret;
}
