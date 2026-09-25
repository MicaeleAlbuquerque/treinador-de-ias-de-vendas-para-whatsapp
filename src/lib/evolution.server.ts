// Evolution API client com hardening: auth dual (apikey + bearer),
// normalização de URL, probe de instâncias, configureWebhook com fallback,
// pickQrPayload com múltiplos shapes, mensagens de erro humanas em pt-BR,
// sanitize de logs.

export type EvolutionConfig = { baseUrl: string; token: string };
export type AuthMode = "apikey" | "bearer";

export type EvoResult<T = unknown> = {
  ok: boolean;
  status: number;
  body: T | null;
  url: string;
  authMode: AuthMode;
};

export type EvolutionDiagnosis = {
  base_url_reachable: boolean;
  auth_valid: boolean;
  instance_exists_remotely: boolean;
  instance_state: string | null;
  endpoints_tried: string[];
  probes: Array<{ path: string; status: number; ok: boolean; detail: string | null }>;
};

// --- URL e logs ---

export function normalizeEvolutionBaseUrl(value: string): string {
  return (value ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/manager\/?$/i, "");
}

function maskKey(k: string | null | undefined): string {
  if (!k) return "—";
  if (k.length <= 8) return "***";
  return `${k.slice(0, 4)}…${k.slice(-2)}`;
}

function sanitize(str: string, secrets: Array<string | null | undefined>): string {
  let out = str;
  for (const s of secrets) {
    if (s && s.length > 4) out = out.split(s).join("***");
  }
  // Mascara tokens em querystring (?token=XYZ, &apikey=XYZ, etc).
  out = out.replace(/(\?|&)(token|apikey|api_key|key|secret)=[^&"\s]+/gi, "$1$2=***");
  // Mascara Bearer tokens.
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***");
  return out;
}

// --- Mensagens humanas ---

export function detailForEvolutionFailure(status: number): string {
  if (status === 0)
    return "Não consegui acessar a URL da Evolution. Verifique se o endereço está correto e público.";
  if (status === 404)
    return "Endpoint não encontrado nessa URL. Verifique a base URL — pode estar com prefixo extra (ex: /api, /manager), ou a versão da Evolution não suporta esse path.";
  if (status === 401 || status === 403)
    return "API Key inválida. Confira no painel da Evolution.";
  if (status === 409)
    return "Instância já existe no servidor Evolution. Tentando reaproveitar.";
  if (status >= 500)
    return "Servidor Evolution com problema (5xx). Tente de novo em alguns segundos.";
  return `Evolution retornou HTTP ${status}. Confira a base URL, API Key e versão da Evolution.`;
}

// --- Fetch com auth dual ---

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

export async function evoFetch<T = unknown>(
  cfg: EvolutionConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<EvoResult<T>> {
  const base = normalizeEvolutionBaseUrl(cfg.baseUrl);
  const url = joinUrl(base, path);

  const tryAuth = async (authMode: AuthMode): Promise<EvoResult<T>> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authMode === "apikey") headers.apikey = cfg.token;
    else headers.Authorization = `Bearer ${cfg.token}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const msg = sanitize((e as Error).message ?? String(e), [cfg.token]);
      console.error(`[evo] network ${method} ${url} auth=${authMode}: ${msg}`);
      return { ok: false, status: 0, body: null, url, authMode };
    }

    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }
    const snippet = sanitize(
      typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200),
      [cfg.token],
    );
    console.log(`[evo] ${method} ${path} → ${res.status} auth=${authMode} body=${snippet}`);
    return { ok: res.ok, status: res.status, body: parsed as T, url, authMode };
  };

  const first = await tryAuth("apikey");
  if (first.status === 401 || first.status === 403) {
    console.warn(`[evo] retrying with bearer auth (apikey ${first.status})`);
    return tryAuth("bearer");
  }
  return first;
}

// --- QR extraction ---

export function pickQrPayload(body: unknown): { base64: string | null; code: string | null } {
  if (!body) return { base64: null, code: null };
  // deno-lint-ignore no-explicit-any
  const b: any = body;
  let base64: string | null = null;
  let code: string | null = null;

  if (typeof b === "string" && b.startsWith("data:image")) base64 = b;
  if (typeof b?.base64 === "string") base64 = b.base64;
  if (typeof b?.qrcode === "string" && b.qrcode.startsWith("data:image")) base64 = b.qrcode;
  if (typeof b?.qrcode?.base64 === "string") base64 = b.qrcode.base64;
  if (typeof b?.qr === "string" && b.qr.startsWith("data:image")) base64 = b.qr;
  if (typeof b?.instance?.qrcode?.base64 === "string") base64 = b.instance.qrcode.base64;

  if (typeof b?.code === "string") code = b.code;
  if (typeof b?.qrcode?.code === "string") code = b.qrcode.code;
  if (typeof b?.pairingCode === "string") code = b.pairingCode;
  if (typeof b?.qrcode?.pairingCode === "string") code = b.qrcode.pairingCode;
  if (typeof b?.instance?.qrcode?.code === "string") code = b.instance.qrcode.code;

  if (base64 && !base64.startsWith("data:image")) {
    base64 = `data:image/png;base64,${base64}`;
  }
  return { base64, code };
}

// --- State mapping ---

export function mapState(state: string | null | undefined): "connected" | "connecting" | "disconnected" {
  const s = (state ?? "").toLowerCase();
  if (s === "open") return "connected";
  if (s === "connecting" || s === "qr" || s === "pairing") return "connecting";
  return "disconnected";
}

// --- Probe (descoberta de instâncias existentes) ---

// deno-lint-ignore no-explicit-any
function readInstancesList(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.instances)) return body.instances;
  if (Array.isArray(body?.instance)) return body.instance;
  if (Array.isArray(body?.response)) return body.response;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

// deno-lint-ignore no-explicit-any
function instanceMatches(item: any, name: string): boolean {
  const candidates = [
    item?.name,
    item?.instanceName,
    item?.instance?.instanceName,
    item?.instance?.name,
  ];
  return candidates.some((v) => typeof v === "string" && v.toLowerCase() === name.toLowerCase());
}

// deno-lint-ignore no-explicit-any
function readInstanceState(item: any): string | null {
  return (
    item?.connectionStatus ??
    item?.state ??
    item?.instance?.state ??
    item?.instance?.connectionStatus ??
    null
  );
}

export async function probeInstances(cfg: EvolutionConfig): Promise<EvoResult[]> {
  const endpoints = ["/instance/fetchInstances", "/instance/list"];
  const attempts: EvoResult[] = [];
  for (const path of endpoints) {
    const r = await evoFetch(cfg, "GET", path);
    attempts.push(r);
    if (r.ok || r.status === 401 || r.status === 403) break;
  }
  return attempts;
}

// --- Webhook config com fallback de 3 paths/formatos ---

export async function configureWebhook(
  cfg: EvolutionConfig,
  instanceName: string,
  webhookUrl: string,
  events: string[] = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
): Promise<boolean> {
  const body = {
    url: webhookUrl,
    enabled: true,
    webhookByEvents: false,
    webhookBase64: true,
    events,
  };
  const wrapped = { webhook: body };

  const tries: Array<{ method: string; path: string; payload: unknown }> = [
    { method: "POST", path: `/webhook/set/${encodeURIComponent(instanceName)}`, payload: wrapped },
    { method: "POST", path: `/webhook/set/${encodeURIComponent(instanceName)}`, payload: body },
    { method: "PUT", path: `/webhook/${encodeURIComponent(instanceName)}`, payload: body },
  ];

  for (const t of tries) {
    const r = await evoFetch(cfg, t.method, t.path, t.payload);
    if (r.ok) return true;
  }
  console.warn(`[evo] webhook config failed for ${instanceName} after 3 attempts`);
  return false;
}

// --- Create com idempotência ---

export type CreateInstanceResult = {
  ok: boolean;
  qrBase64: string | null;
  qrCode: string | null;
  alreadyExisted: boolean;
  webhookOk: boolean;
  error?: string;
  status?: number;
};

export async function createInstanceIdempotent(
  cfg: EvolutionConfig,
  params: { instanceName: string; webhookUrl: string },
): Promise<CreateInstanceResult> {
  // 1) Verifica se já existe
  const probes = await probeInstances(cfg);
  const usable = probes.find((p) => p.ok);
  const authFailure = probes.find((p) => p.status === 401 || p.status === 403);

  if (authFailure) {
    return {
      ok: false,
      qrBase64: null,
      qrCode: null,
      alreadyExisted: false,
      webhookOk: false,
      status: authFailure.status,
      error: detailForEvolutionFailure(authFailure.status),
    };
  }

  const existing = usable
    ? readInstancesList(usable.body).find((it) => instanceMatches(it, params.instanceName))
    : null;

  if (existing) {
    // Reconfigura webhook e busca QR/estado atual.
    const webhookOk = await configureWebhook(cfg, params.instanceName, params.webhookUrl);
    const qrResp = await evoFetch(cfg, "GET", `/instance/connect/${encodeURIComponent(params.instanceName)}`);
    const qr = pickQrPayload(qrResp.body);
    return {
      ok: true,
      qrBase64: qr.base64,
      qrCode: qr.code,
      alreadyExisted: true,
      webhookOk,
    };
  }

  // 2) Cria nova
  const createRes = await evoFetch(cfg, "POST", "/instance/create", {
    instanceName: params.instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    syncFullHistory: true,
  });

  const isConflict =
    createRes.status === 409 ||
    (typeof createRes.body === "object" &&
      JSON.stringify(createRes.body ?? "").toLowerCase().includes("already"));

  if (!createRes.ok && !isConflict) {
    return {
      ok: false,
      qrBase64: null,
      qrCode: null,
      alreadyExisted: false,
      webhookOk: false,
      status: createRes.status,
      error: detailForEvolutionFailure(createRes.status),
    };
  }

  const webhookOk = await configureWebhook(cfg, params.instanceName, params.webhookUrl);
  const qr = pickQrPayload(createRes.body);

  return {
    ok: true,
    qrBase64: qr.base64,
    qrCode: qr.code,
    alreadyExisted: isConflict,
    webhookOk,
  };
}

// --- Estado / QR / logout / delete ---

export async function getConnectionState(cfg: EvolutionConfig, instanceName: string) {
  const r = await evoFetch(cfg, "GET", `/instance/connectionState/${encodeURIComponent(instanceName)}`);
  // deno-lint-ignore no-explicit-any
  const b = r.body as any;
  const raw = b?.instance?.state ?? b?.state ?? null;
  return { ok: r.ok, status: r.status, state: mapState(raw), rawState: raw };
}

export async function fetchQr(cfg: EvolutionConfig, instanceName: string) {
  const r = await evoFetch(cfg, "GET", `/instance/connect/${encodeURIComponent(instanceName)}`);
  return { ok: r.ok, ...pickQrPayload(r.body) };
}

export async function logoutInstance(cfg: EvolutionConfig, instanceName: string) {
  return evoFetch(cfg, "DELETE", `/instance/logout/${encodeURIComponent(instanceName)}`);
}

export async function deleteInstance(cfg: EvolutionConfig, instanceName: string) {
  return evoFetch(cfg, "DELETE", `/instance/delete/${encodeURIComponent(instanceName)}`);
}

// --- Diagnose ---

export async function diagnoseInstance(
  cfg: EvolutionConfig,
  instanceName: string,
): Promise<EvolutionDiagnosis> {
  const endpointsTried: string[] = [];
  const probes = await probeInstances(cfg);
  for (const p of probes) {
    try { endpointsTried.push(new URL(p.url).pathname); } catch { /* ignore */ }
  }

  const usable = probes.find((p) => p.ok);
  const authFailure = probes.find((p) => p.status === 401 || p.status === 403);
  const list = usable ? readInstancesList(usable.body) : [];
  const existing = list.find((it) => instanceMatches(it, instanceName));
  let state: string | null = existing ? readInstanceState(existing) : null;

  if (existing && !state) {
    const r = await evoFetch(cfg, "GET", `/instance/connectionState/${encodeURIComponent(instanceName)}`);
    try { endpointsTried.push(new URL(r.url).pathname); } catch { /* ignore */ }
    // deno-lint-ignore no-explicit-any
    const b = r.body as any;
    state = b?.instance?.state ?? b?.state ?? null;
  }

  return {
    base_url_reachable: probes.some((p) => p.status !== 0 && p.status < 500),
    auth_valid: !!usable && !authFailure,
    instance_exists_remotely: !!existing,
    instance_state: state,
    endpoints_tried: endpointsTried,
    probes: probes.map((p) => {
      let pathname = p.url;
      try { pathname = new URL(p.url).pathname; } catch { /* ignore */ }
      return {
        path: pathname,
        status: p.status,
        ok: p.ok,
        detail: p.ok ? null : detailForEvolutionFailure(p.status),
      };
    }),
  };
}

// --- Import histórico via findChats + findMessages ---

export type ImportHistoryProgress = {
  chats_found: number;
  chats_imported: number;
  messages_imported: number;
  errors: string[];
};

export type ImportedMessage = {
  external_msg_id: string | null;
  remote_jid: string;
  ts: string; // ISO
  from_me: boolean;
  push_name: string | null;
  media_type: "text" | "audio" | "image" | "video" | "document";
  text: string;
  audio_base64: string | null;
  raw: unknown;
};

export type ImportedChat = {
  // JID EXATO usado pra buscar mensagens. Na Evolution v2 nova, chats 1-on-1
  // vêm em formato @lid (ex: "207992582574252@lid"), não @s.whatsapp.net.
  // Esse é o valor que casa com key.remoteJid na tabela Message.
  remote_jid: string;
  // Número real (PN) do contato pra exibição/dedup/anonimização. Vem de
  // remoteJidAlt/participantAlt quando remote_jid é @lid. Fallback: parte
  // numérica do próprio JID.
  lead_phone: string | null;
  display_name: string | null;
  is_group: boolean;
};

function extractRawChats(b: unknown): unknown[] {
  // deno-lint-ignore no-explicit-any
  const any = b as any;
  if (Array.isArray(any)) return any;
  return (
    any?.chats ??
    any?.contacts ??
    any?.data ??
    any?.records ??
    any?.results ??
    any?.result ??
    []
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Domínios de JID que a Evolution usa. @lid (LinkedID) é o novo padrão da v2
// pra conversas 1-on-1; @s.whatsapp.net é o PN clássico; @g.us é grupo;
// @c.us aparece em forks antigos.
const JID_DOMAINS = new Set(["s.whatsapp.net", "lid", "g.us", "c.us"]);

// Normaliza um JID de BUSCA preservando o domínio (incl. @lid). Aceita número
// puro (vira @s.whatsapp.net) e descarta cuids internos (sem @) e lixo.
function normalizeRemoteJid(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) return null;

  // Número puro → assume PN.
  if (/^\+?\d{6,20}$/.test(candidate)) {
    return `${candidate.replace(/^\+/, "")}@s.whatsapp.net`;
  }

  const [localRaw, domain] = candidate.split("@");
  if (!localRaw || !domain) return null; // sem @ = cuid interno ou lixo
  if (!JID_DOMAINS.has(domain)) return null;
  const local = localRaw.split(":")[0]!.replace(/^\+/, "");
  if (domain === "g.us") return `${localRaw}@${domain}`;
  // PN e LID: parte local deve ser numérica (descarta cuid@s.whatsapp.net).
  if (!/^\d{6,20}$/.test(local)) return null;
  return `${local}@${domain}`;
}

function readChatRemoteJid(c: unknown): string | null {
  const x = asObject(c);
  const key = asObject(x.key);
  const lastMessage = asObject(x.lastMessage);
  const lastMessageKey = asObject(lastMessage.key);

  const candidates = [
    x.remoteJid,
    key.remoteJid,
    lastMessageKey.remoteJid,
    lastMessage.remoteJid,
    x.jid,
    x.wid,
    x.id,
    x.number,
  ];

  for (const candidate of candidates) {
    const jid = normalizeRemoteJid(candidate);
    if (jid) return jid;
  }
  return null;
}

// Extrai o número real (PN) do contato. Quando o chat é @lid, o número fica em
// remoteJidAlt/participantAlt da key da última mensagem. Fallback: parte
// numérica do próprio JID (serve de identificador estável mesmo sem PN).
function readChatLeadPhone(c: unknown, remoteJid: string): string | null {
  const x = asObject(c);
  const lastMessage = asObject(x.lastMessage);
  const lastKey = asObject(lastMessage.key);

  const altCandidates = [
    lastKey.remoteJidAlt,
    lastKey.participantAlt,
    x.remoteJidAlt,
    x.participantAlt,
  ];
  for (const cand of altCandidates) {
    const s = readString(cand);
    if (!s) continue;
    const local = s.split("@")[0]!.split(":")[0]!.replace(/^\+/, "");
    if (/^\d{6,20}$/.test(local)) return local;
  }

  // remoteJid já é PN?
  const [local, domain] = remoteJid.split("@");
  const n = (local ?? "").split(":")[0]!.replace(/^\+/, "");
  if (domain === "s.whatsapp.net" && /^\d{6,20}$/.test(n)) return n;
  // Só temos @lid sem alt: usa o número do lid como identificador estável.
  if (domain === "lid" && /^\d{6,20}$/.test(n)) return n;
  return null;
}

function toEpochMs(value: unknown): number {
  if (typeof value === "object" && value !== null) {
    const low = (value as any).low;
    if (typeof low === "number" && Number.isFinite(low)) {
      return low < 1_000_000_000_000 ? low * 1000 : low;
    }
  }
  if (typeof value === "bigint") {
    const num = Number(value);
    if (Number.isFinite(num)) return num < 1_000_000_000_000 ? num * 1000 : num;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readChatLastInteractionMs(c: unknown): number {
  const x = asObject(c);
  const lastMessage = asObject(x.lastMessage);
  return Math.max(
    toEpochMs(x.lastInteraction),
    toEpochMs(x.lastMessageTimestamp),
    toEpochMs(x.messageTimestamp),
    toEpochMs(x.updatedAt),
    toEpochMs(x.lastMessageAt),
    toEpochMs(x.last_message_at),
    toEpochMs(lastMessage.messageTimestamp),
    toEpochMs(lastMessage.timestamp),
  );
}

// Normaliza um item de chat/contato Evolution num ImportedChat. Aceita várias
// variantes de campo e nunca usa cuid interno como JID. Exportada pra teste.
export function normalizeChat(c: unknown): ImportedChat | null {
  // deno-lint-ignore no-explicit-any
  const x = c as any;
  const remoteJid = readChatRemoteJid(c);
  if (!remoteJid) return null;
  const isGroup = remoteJid.endsWith("@g.us");

  return {
    remote_jid: remoteJid,
    lead_phone: isGroup ? null : readChatLeadPhone(c, remoteJid),
    display_name: x.name ?? x.pushName ?? x.notify ?? x.verifiedName ?? x.lastMessage?.pushName ?? null,
    is_group: isGroup,
  };
}

export async function fetchChatsForImport(
  cfg: EvolutionConfig,
  instanceName: string,
  opts: { maxChats?: number; includeGroups?: boolean; sinceUnix?: number } = {},
): Promise<{ ok: boolean; chats: ImportedChat[]; status: number; error?: string; diagnostic?: string }> {
  const maxChats = opts.maxChats ?? 200;
  const inst = encodeURIComponent(instanceName);
  const sinceMs = opts.sinceUnix ? opts.sinceUnix * 1000 : 0;

  // Evolution v2 findChats retorna chats com histórico real (tabela Message),
  // ordenados por última mensagem desc. A janela temporal é aplicada no cliente
  // (filtro lastInteractionMs) — não no body, pois messageTimestamp é Int e
  // filtrar com ISO string falha silenciosamente.
  const attempts: Array<{ tag: string; method: "POST" | "GET"; path: string; payload?: Record<string, unknown> }> = [
    { tag: "post-chat-findChats",        method: "POST", path: `/chat/findChats/${inst}`, payload: {} },
    { tag: "get-chat-findChats",         method: "GET",  path: `/chat/findChats/${inst}` },
  ];

  const diagnostics: string[] = [];
  let bestResult: { ok: true; status: number; chats: ImportedChat[]; tag: string } | null = null;
  let lastErrStatus = 0;

  for (const attempt of attempts) {
    const r = await evoFetch(cfg, attempt.method, attempt.path, attempt.payload);
    if (!r.ok) {
      lastErrStatus = r.status;
      diagnostics.push(`${attempt.tag}=HTTP${r.status}`);
      continue;
    }
    const raw = extractRawChats(r.body);
    if (raw.length === 0) {
      diagnostics.push(`${attempt.tag}=0items`);
      continue;
    }
    // Log do shape pra debug
    const first = raw[0];
    const keys = first && typeof first === "object" ? Object.keys(first).join(",") : "(?)";
    console.log(`[evo] ${attempt.tag} returned ${raw.length} items | keys: ${keys} | sample: ${JSON.stringify(first).slice(0, 200)}`);

    const normalized = raw
      .map((item) => {
        const chat = normalizeChat(item);
        if (!chat) return null;
        return { chat, lastInteractionMs: readChatLastInteractionMs(item) };
      })
      .filter((item): item is { chat: ImportedChat; lastInteractionMs: number } => item !== null)
      .filter((item) => item.lastInteractionMs > 0)
      .filter((item) => sinceMs ? item.lastInteractionMs >= sinceMs : true)
      .filter((item) => (opts.includeGroups ?? false) ? true : !item.chat.is_group)
      .sort((a, b) => b.lastInteractionMs - a.lastInteractionMs)
      .map((item) => item.chat);

    diagnostics.push(`${attempt.tag}=${raw.length}raw/${normalized.length}valid`);

    if (normalized.length > 0) {
      // Boa fonte! Usa essa e para de tentar.
      return {
        ok: true,
        chats: normalized.slice(0, maxChats),
        status: r.status,
        diagnostic: `via ${attempt.tag} | ${diagnostics.join(" | ")}`,
      };
    }
    // Mesmo se 0 válidos, guarda o melhor pra reportar
    if (!bestResult || raw.length > 0) {
      bestResult = { ok: true, status: r.status, chats: [], tag: attempt.tag };
    }
  }

  const diag = diagnostics.join(" | ");
  if (bestResult) {
    return {
      ok: true, chats: [], status: bestResult.status,
      error: `Evolution retornou ${bestResult.tag} mas nenhum JID válido. Pode estar expondo só cuids internos. Tentativas: ${diag}`,
      diagnostic: diag,
    };
  }
  return {
    ok: false, chats: [], status: lastErrStatus,
    error: detailForEvolutionFailure(lastErrStatus),
    diagnostic: diag,
  };
}

// Tenta múltiplos endpoints+payloads de findMessages — Evolution v1, v2,
// Codechat fork e v2 oficial diferem bastante. Retorna primeira tentativa
// que devolve >0 mensagens. Quando todas dão 0, devolve diagnóstico do
// que cada uma retornou pra debug em produção.
async function tryFindMessages(
  cfg: EvolutionConfig,
  instanceName: string,
  method: "POST" | "GET",
  path: string,
  payload?: Record<string, unknown>,
): Promise<{ ok: boolean; body: unknown; status: number }> {
  const r = await evoFetch(cfg, method, path, payload);
  return { ok: r.ok, body: r.body, status: r.status };
}

function extractRawMessages(b: unknown): unknown[] {
  // deno-lint-ignore no-explicit-any
  const any = b as any;
  if (Array.isArray(any)) return any;
  if (Array.isArray(any?.messages?.records)) return any.messages.records;
  if (Array.isArray(any?.data?.messages?.records)) return any.data.messages.records;
  if (Array.isArray(any?.messages)) return any.messages;
  if (Array.isArray(any?.records)) return any.records;
  if (Array.isArray(any?.data?.records)) return any.data.records;
  if (Array.isArray(any?.data)) return any.data;
  if (Array.isArray(any?.result)) return any.result;
  if (Array.isArray(any?.results)) return any.results;
  return (
    []
  );
}

function summarizeBody(b: unknown): string {
  try {
    const s = typeof b === "string" ? b : JSON.stringify(b);
    return s.slice(0, 200);
  } catch {
    return "[unserializable]";
  }
}

// Lê total de páginas do envelope v2 ({ messages: { pages } }).
function readTotalPages(b: unknown): number | null {
  const p = (b as any)?.messages?.pages ?? (b as any)?.pages;
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}

export async function fetchMessagesForChat(
  cfg: EvolutionConfig,
  instanceName: string,
  remoteJid: string,
  sinceUnix: number,
  // Teto de segurança alto: o limitador REAL é a janela temporal (sinceUnix /
  // reachedWindowFloor). Assim conversas normais param sozinhas na janela e só
  // contatos com volume absurdo (>3000 msgs no período) batem nesse teto.
  limit = 3000,
): Promise<{ ok: boolean; messages: ImportedMessage[]; status: number; error?: string; diagnostic?: string }> {
  const inst = encodeURIComponent(instanceName);
  // CRÍTICO: usa o JID EXATO do chat (pode ser @lid). NÃO força @s.whatsapp.net
  // — na Evolution v2 nova as mensagens 1-on-1 são indexadas por @lid e buscar
  // pelo número PN retorna 0.
  const jid = normalizeRemoteJid(remoteJid);
  if (!jid || jid.endsWith("@g.us")) {
    return {
      ok: false,
      messages: [],
      status: 0,
      error: `remoteJid inválido para findMessages: ${remoteJid}`,
    };
  }

  // Evolution v2: findMessages pagina com { where, page, offset } onde offset é
  // o tamanho da página (take) e a resposta é { messages: { total, pages,
  // currentPage, records } }, ordenada por messageTimestamp desc. Paginamos do
  // mais recente até cobrir `limit` ou cruzar a janela `sinceUnix`.
  const PAGE_SIZE = 100;
  const maxPages = Math.max(1, Math.ceil(limit / PAGE_SIZE));
  const diagnostics: string[] = [];
  const collected: unknown[] = [];
  let lastStatus = 0;
  let lastErrStatus = 0;
  let reachedWindowFloor = false;

  // Shapes de body aceitos — primário (v2 oficial) + fallback remoteJid + fallback keyRemoteJid (forks).
  const buildPayload = (page: number, shape: "key" | "remoteJid" | "keyRemoteJid"): Record<string, unknown> => {
    if (shape === "keyRemoteJid") return { where: { keyRemoteJid: jid }, page, offset: PAGE_SIZE };
    if (shape === "remoteJid") return { where: { remoteJid: jid }, page, offset: PAGE_SIZE };
    return { where: { key: { remoteJid: jid } }, page, offset: PAGE_SIZE };
  };

  let activeShape: "key" | "remoteJid" | "keyRemoteJid" = "key";
  for (let page = 1; page <= maxPages; page++) {
    const r = await tryFindMessages(
      cfg, instanceName, "POST", `/chat/findMessages/${inst}`, buildPayload(page, activeShape),
    );
    if (!r.ok) {
      lastErrStatus = r.status;
      diagnostics.push(`p${page}=HTTP${r.status}`);
      break;
    }
    lastStatus = r.status;
    let raw = extractRawMessages(r.body);
    // Fallback de shape: se a 1ª página vier vazia no shape primário, tenta
    // remoteJid e keyRemoteJid antes de desistir.
    if (raw.length === 0 && page === 1 && activeShape === "key") {
      activeShape = "remoteJid";
      const r2 = await tryFindMessages(
        cfg, instanceName, "POST", `/chat/findMessages/${inst}`, buildPayload(1, activeShape),
      );
      if (r2.ok) {
        const raw2 = extractRawMessages(r2.body);
        if (raw2.length > 0) {
          raw = raw2;
          lastStatus = r2.status;
          diagnostics.push(`p1-remoteJid=${raw.length}`);
        }
      }
      if (raw.length === 0) {
        activeShape = "keyRemoteJid";
        const r3 = await tryFindMessages(
          cfg, instanceName, "POST", `/chat/findMessages/${inst}`, buildPayload(1, activeShape),
        );
        if (r3.ok) {
          const raw3 = extractRawMessages(r3.body);
          if (raw3.length > 0) {
            raw = raw3;
            lastStatus = r3.status;
            diagnostics.push(`p1-keyRemoteJid=${raw.length}`);
          }
        }
      }
      if (raw.length === 0) {
        diagnostics.push("p1=0");
        break;
      }
    }
    diagnostics.push(`p${page}=${raw.length}`);
    if (raw.length === 0) break;

    // Para de paginar quando cruzar o piso da janela temporal (msgs desc).
    for (const m of raw) {
      const tsMs = toEpochMs((m as any)?.messageTimestamp ?? (m as any)?.timestamp ?? (m as any)?.message?.messageTimestamp ?? (m as any)?.createdAt);
      if (tsMs && sinceUnix && tsMs < sinceUnix * 1000) {
        reachedWindowFloor = true;
      }
      collected.push(m);
    }

    const totalPages = readTotalPages(r.body);
    if (collected.length >= limit) break;
    if (reachedWindowFloor) break;
    if (raw.length < PAGE_SIZE) break;
    if (totalPages && page >= totalPages) break;
  }

  const diag = diagnostics.join(" | ");
  if (collected.length === 0) {
    if (lastErrStatus) {
      return { ok: false, messages: [], status: lastErrStatus, error: detailForEvolutionFailure(lastErrStatus), diagnostic: diag };
    }
    console.log(`[evo] findMessages 0 msgs for ${jid.slice(0, 36)} | ${diag}`);
    return { ok: true, messages: [], status: lastStatus, diagnostic: diag };
  }

  console.log(`[evo] findMessages got ${collected.length} raw msgs for ${jid.slice(0, 36)} | ${diag}`);
  const parsed = parseMessages(collected.slice(0, limit), jid, lastStatus);
  return { ...parsed, diagnostic: diag };
}

function parseMessages(
  raw: unknown[],
  remoteJid: string,
  status: number,
): { ok: boolean; messages: ImportedMessage[]; status: number } {
  const messages: ImportedMessage[] = raw
    // deno-lint-ignore no-explicit-any
    .map((m: any): ImportedMessage | null => {
      const tsMs = toEpochMs(m.messageTimestamp ?? m.timestamp ?? m.message?.messageTimestamp ?? m.createdAt);
      if (!tsMs) return null;

      // Descarta mensagens de protocolo interno, distribuição de chaves ou reações sem conteúdo útil
      if (m.messageType === "protocolMessage" || m.messageType === "senderKeyDistributionMessage") {
        return null;
      }

      const msg = m.message ?? {};
      if (msg.protocolMessage || msg.senderKeyDistributionMessage) {
        return null;
      }

      // Desempacota mensagens efêmeras, viewOnce, documentos com legenda etc.
      const inner =
        msg.ephemeralMessage?.message ??
        msg.viewOnceMessage?.message ??
        msg.viewOnceMessageV2?.message ??
        msg.documentWithCaptionMessage?.message ??
        msg;

      let mediaType: ImportedMessage["media_type"] = "text";
      let text = "";
      let audioBase64: string | null = null;

      if (inner.conversation) {
        text = inner.conversation;
      } else if (inner.extendedTextMessage?.text) {
        text = inner.extendedTextMessage.text;
      } else if (inner.audioMessage || inner.pttMessage) {
        mediaType = "audio";
        const a = inner.audioMessage ?? inner.pttMessage;
        audioBase64 = a?.base64 ?? m.base64 ?? null;
      } else if (inner.imageMessage) {
        mediaType = "image";
        text = inner.imageMessage.caption ?? "[Imagem]";
      } else if (inner.videoMessage) {
        mediaType = "video";
        text = inner.videoMessage.caption ?? "[Vídeo]";
      } else if (inner.documentMessage) {
        mediaType = "document";
        text = inner.documentMessage.caption ?? (inner.documentMessage.fileName ? `[Documento: ${inner.documentMessage.fileName}]` : "[Documento]");
      } else if (inner.stickerMessage) {
        mediaType = "image";
        text = "[Figurinha]";
      } else if (inner.contactMessage || inner.contactsArrayMessage) {
        text = "[Contato]";
      } else if (inner.locationMessage || inner.liveLocationMessage) {
        text = "[Localização]";
      } else if (inner.interactiveResponseMessage?.body?.text) {
        text = inner.interactiveResponseMessage.body.text;
      } else if (inner.buttonsResponseMessage?.selectedDisplayText) {
        text = inner.buttonsResponseMessage.selectedDisplayText;
      } else if (inner.templateButtonReplyMessage?.selectedDisplayText) {
        text = inner.templateButtonReplyMessage.selectedDisplayText;
      } else if (inner.listResponseMessage?.title) {
        text = inner.listResponseMessage.title;
      } else if (typeof m.body === "string" && m.body.trim()) {
        text = m.body.trim();
      }

      // Se for apenas texto mas sem nenhum conteúdo, descarta stubs vazios
      if (mediaType === "text" && !text.trim()) {
        return null;
      }

      return {
        external_msg_id: m.key?.id ?? null,
        remote_jid: m.key?.remoteJid ?? remoteJid,
        ts: new Date(tsMs).toISOString(),
        from_me: !!m.key?.fromMe,
        push_name: m.pushName ?? null,
        media_type: mediaType,
        text,
        audio_base64: audioBase64,
        raw: m,
      };
    })
    .filter((x: ImportedMessage | null): x is ImportedMessage => x !== null);

  return { ok: true, messages, status };
}
