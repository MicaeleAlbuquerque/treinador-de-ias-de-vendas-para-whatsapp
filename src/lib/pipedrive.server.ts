// Pipedrive OAuth + sync helpers. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PIPEDRIVE_OAUTH_BASE = "https://oauth.pipedrive.com/oauth";
const SCOPES = ["deals:read", "deals:full", "users:read"];

function projectBaseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    "https://project--c0a2752e-b465-4795-87cb-f4692ec431c8.lovable.app"
  );
}

export function pipedriveRedirectUri(): string {
  return `${projectBaseUrl()}/api/public/pipedrive/callback`;
}

// Credenciais Pipedrive: lê do app_secrets primeiro (UI-managed), fallback env.
// Single-tenant: admin configura via /app/settings sem precisar mexer em env.
export async function loadPipedriveCreds(): Promise<{ clientId: string; clientSecret: string } | null> {
  const { data } = await supabaseAdmin
    .from("app_secrets")
    .select("pipedrive_client_id, pipedrive_client_secret")
    .maybeSingle();
  const dbId = (data as { pipedrive_client_id?: string | null } | null)?.pipedrive_client_id ?? null;
  const dbSecret = (data as { pipedrive_client_secret?: string | null } | null)?.pipedrive_client_secret ?? null;
  const clientId = dbId || process.env.PIPEDRIVE_CLIENT_ID || "";
  const clientSecret = dbSecret || process.env.PIPEDRIVE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function signState(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stateSecret(): string {
  return (
    process.env.OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "fallback-state-secret-please-set-env"
  );
}

export async function buildOAuthState(userId: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const payload = `${userId}.${Date.now()}.${nonce}`;
  const sig = await signState(payload, stateSecret());
  return `${btoa(payload)}.${sig}`;
}

export async function verifyOAuthState(state: string | null): Promise<string | null> {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  let payload = "";
  try { payload = atob(b64!); } catch { return null; }
  const expected = await signState(payload, stateSecret());
  if (expected !== sig) return null;
  const [userId, tsStr] = payload.split(".");
  const ts = Number(tsStr);
  // expira em 10 minutos
  if (!ts || Date.now() - ts > 10 * 60 * 1000) return null;
  return userId ?? null;
}

export async function getAuthorizationUrl(userId: string): Promise<string> {
  const creds = await loadPipedriveCreds();
  if (!creds) {
    throw new Error(
      "Pipedrive não configurado. Configure CLIENT_ID e CLIENT_SECRET em Configurações → Integrações → Pipedrive.",
    );
  }
  const state = await buildOAuthState(userId);
  const u = new URL(`${PIPEDRIVE_OAUTH_BASE}/authorize`);
  u.searchParams.set("client_id", creds.clientId);
  u.searchParams.set("redirect_uri", pipedriveRedirectUri());
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  api_domain: string;
  scope?: string;
};

async function exchangeCode(code: string): Promise<TokenResponse> {
  const creds = await loadPipedriveCreds();
  if (!creds) throw new Error("Pipedrive não configurado.");
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetch(`${PIPEDRIVE_OAUTH_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pipedriveRedirectUri(),
    }).toString(),
  });
  if (!res.ok) throw new Error(`Pipedrive token exchange falhou (${res.status}): ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

async function refreshToken(refresh: string): Promise<TokenResponse> {
  const creds = await loadPipedriveCreds();
  if (!creds) throw new Error("Pipedrive não configurado.");
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetch(`${PIPEDRIVE_OAUTH_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }).toString(),
  });
  if (!res.ok) throw new Error(`Pipedrive refresh falhou (${res.status}): ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function handleCallback(code: string, userId: string | null): Promise<void> {
  const tok = await exchangeCode(code);
  // Get company info
  let companyId: string | null = null;
  try {
    const userRes = await fetch(`${tok.api_domain}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (userRes.ok) {
      const j: any = await userRes.json();
      companyId = j?.data?.company_id ? String(j.data.company_id) : null;
    }
  } catch { /* ignore */ }

  await supabaseAdmin.from("pipedrive_connections").delete().not("id", "is", null);
  await supabaseAdmin.from("pipedrive_connections").insert({
    company_id: companyId,
    api_domain: tok.api_domain,
    oauth_access_token: tok.access_token,
    oauth_refresh_token: tok.refresh_token,
    token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    scopes: (tok.scope ?? SCOPES.join(" ")).split(/\s+/),
    connected_by: userId,
  });
}

async function getActiveConnection() {
  const { data } = await supabaseAdmin
    .from("pipedrive_connections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as any | null;
}

async function ensureFreshToken(conn: any): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return conn.oauth_access_token;
  const tok = await refreshToken(conn.oauth_refresh_token);
  await supabaseAdmin
    .from("pipedrive_connections")
    .update({
      oauth_access_token: tok.access_token,
      oauth_refresh_token: tok.refresh_token,
      token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);
  return tok.access_token;
}

function normalizePhone(p: string): string {
  return (p ?? "").replace(/\D/g, "").slice(-10);
}

export type PipedriveSyncResult = {
  changed: boolean;
  outcome?: "won" | "lost" | "in_progress";
  dealId?: string;
  reason?: string;
};

export async function findDealByPhone(phone: string): Promise<{ id: string; status: string; value?: number } | null> {
  const conn = await getActiveConnection();
  if (!conn) throw new Error("Pipedrive não conectado.");
  const token = await ensureFreshToken(conn);
  const base = conn.api_domain;
  // 1) search persons by phone
  const pRes = await fetch(
    `${base}/api/v1/persons/search?term=${encodeURIComponent(normalizePhone(phone))}&fields=phone&exact_match=false&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!pRes.ok) return null;
  const pJson: any = await pRes.json();
  const personId = pJson?.data?.items?.[0]?.item?.id;
  if (!personId) return null;
  // 2) deals for person
  const dRes = await fetch(`${base}/api/v1/persons/${personId}/deals?status=all_not_deleted&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!dRes.ok) return null;
  const dJson: any = await dRes.json();
  const deals = (dJson?.data ?? []) as any[];
  if (!deals.length) return null;
  deals.sort((a, b) => new Date(b.update_time ?? b.add_time).getTime() - new Date(a.update_time ?? a.add_time).getTime());
  const d = deals[0];
  return { id: String(d.id), status: String(d.status), value: d.value ? Number(d.value) : undefined };
}

function mapDealStatus(s: string): "won" | "lost" | "in_progress" {
  if (s === "won") return "won";
  if (s === "lost") return "lost";
  return "in_progress";
}

export async function syncConversationOutcome(conversationId: string): Promise<PipedriveSyncResult> {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id, lead_phone, outcome, outcome_source, pipedrive_deal_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { changed: false, reason: "conv not found" };
  if (!conv.lead_phone) return { changed: false, reason: "no phone" };
  if ((conv as any).outcome_source === "manual" && conv.outcome === "won") return { changed: false, reason: "manual won" };
  const deal = await findDealByPhone(conv.lead_phone);
  if (!deal) return { changed: false, reason: "no deal" };
  const newOutcome = mapDealStatus(deal.status);
  if (newOutcome === conv.outcome && (conv as any).pipedrive_deal_id === deal.id) {
    return { changed: false, dealId: deal.id, outcome: newOutcome };
  }
  await supabaseAdmin
    .from("conversations")
    .update({
      outcome: newOutcome,
      outcome_source: "pipedrive",
      outcome_at: new Date().toISOString(),
      pipedrive_deal_id: deal.id,
      outcome_value: deal.value ?? null,
      auto_marked: true,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", conversationId);
  // queue analysis
  await supabaseAdmin.from("analysis_jobs").insert({ conversation_id: conversationId, status: "pending" } as any);
  return { changed: true, outcome: newOutcome, dealId: deal.id };
}

export async function syncAllPending(limit = 50): Promise<{ processed: number; changed: number }> {
  const { data } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .in("outcome", ["unknown", "in_progress"])
    .not("lead_phone", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  let changed = 0;
  for (const c of data ?? []) {
    try {
      const r = await syncConversationOutcome(c.id);
      if (r.changed) changed++;
    } catch { /* ignore individual */ }
  }
  return { processed: (data ?? []).length, changed };
}

export async function isConnected(): Promise<boolean> {
  const c = await getActiveConnection();
  return !!c;
}

export async function disconnect(): Promise<void> {
  await supabaseAdmin.from("pipedrive_connections").delete().not("id", "is", null);
}