import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createInstanceIdempotent,
  getConnectionState,
  fetchQr,
  logoutInstance,
  deleteInstance,
  diagnoseInstance,
  fetchChatsForImport,
  fetchMessagesForChat,
  evoFetch,
  type EvolutionConfig,
} from "./evolution.server";
import { anonymizeText, buildSellerWhitelist, maskPhone, isValidPhone } from "./anonymize.server";
import { parseWhatsAppExport } from "./whatsapp-parser";
import { DEMO_SELLERS, DEMO_CONVERSATIONS } from "./demo-seed-data";
import { analyzeConversation } from "./analyze.server";

const PROJECT_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  "https://project--c0a2752e-b465-4795-87cb-f4692ec431c8.lovable.app";

// Single-tenant interno: qualquer usuário autenticado = admin.
// Mantida a função pra preservar pontos de extensão futuros.
async function assertAdmin(_supabase: unknown, userId: string) {
  if (!userId) throw new Error("Não autenticado.");
}

async function loadInstanceWithToken(instanceId: string): Promise<{ config: EvolutionConfig; name: string; id: string } | null> {
  const { data: inst } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, instance_name, evolution_url")
    .eq("id", instanceId)
    .maybeSingle();
  if (!inst) return null;
  const { data: secret } = await supabaseAdmin
    .from("whatsapp_secrets")
    .select("evolution_token")
    .eq("instance_id", inst.id)
    .maybeSingle();
  if (!secret) return null;
  return {
    id: inst.id,
    name: inst.instance_name,
    config: { baseUrl: inst.evolution_url, token: secret.evolution_token },
  };
}

// ============ WhatsApp Instance ============

export const getWhatsAppInstance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, instance_name, evolution_url, status, qr_code_url, last_sync_at, last_error, seller_id, webhook_token")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const createWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { instanceName: string; evolutionUrl: string; evolutionToken: string; sellerId?: string | null }) =>
      z
        .object({
          instanceName: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
          evolutionUrl: z.string().url().max(255),
          evolutionToken: z.string().min(1).max(512),
          sellerId: z.string().uuid().nullable().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Se já existe uma instância com esse nome, atualiza ao invés de duplicar linha
    const { data: existingInst } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, webhook_token")
      .eq("instance_name", data.instanceName)
      .maybeSingle();

    let targetId: string;
    let webhookToken: string;

    if (existingInst) {
      targetId = existingInst.id;
      webhookToken = existingInst.webhook_token;
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({
          evolution_url: data.evolutionUrl,
          status: "connecting",
          seller_id: data.sellerId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("whatsapp_instances")
        .insert({
          instance_name: data.instanceName,
          evolution_url: data.evolutionUrl,
          status: "connecting",
          seller_id: data.sellerId ?? null,
        })
        .select("id, webhook_token")
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message ?? "Falha ao criar instância.");
      targetId = inserted.id;
      webhookToken = inserted.webhook_token;
    }

    await supabaseAdmin.from("whatsapp_secrets").upsert({
      instance_id: targetId,
      evolution_token: data.evolutionToken,
      updated_at: new Date().toISOString(),
    }, { onConflict: "instance_id" });

    const webhookUrl = `${PROJECT_BASE_URL}/api/public/whatsapp-webhook?token=${webhookToken}`;
    const cfg: EvolutionConfig = { baseUrl: data.evolutionUrl, token: data.evolutionToken };

    const result = await createInstanceIdempotent(cfg, {
      instanceName: data.instanceName,
      webhookUrl,
    });

    if (!result.ok) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "error", last_error: result.error ?? "Falha desconhecida ao criar instância." })
        .eq("id", targetId);
      throw new Error(result.error ?? "Falha ao criar instância Evolution.");
    }

    await supabaseAdmin
      .from("whatsapp_instances")
      .update({
        qr_code_url: result.qrBase64,
        status: result.qrBase64 ? "qr" : "connecting",
        last_error: result.webhookOk
          ? null
          : "Webhook não pôde ser configurado automaticamente — verifique manualmente.",
      })
      .eq("id", targetId);

    return {
      instanceId: targetId,
      qrBase64: result.qrBase64,
      alreadyExisted: result.alreadyExisted,
      webhookOk: result.webhookOk,
      webhookUrl,
    };
  });

export const refreshWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { instanceId: string }) =>
    z.object({ instanceId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const loaded = await loadInstanceWithToken(data.instanceId);
    if (!loaded) throw new Error("Instância não encontrada ou sem token configurado.");
    try {
      const conn = await getConnectionState(loaded.config, loaded.name);
      let qr: string | null = null;
      let qrCode: string | null = null;
      if (conn.state !== "connected") {
        const qrResp = await fetchQr(loaded.config, loaded.name);
        qr = qrResp.base64 ?? null;
        qrCode = qrResp.code ?? null;
      }
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({
          status: conn.state === "connected" ? "connected" : conn.state,
          qr_code_url: qr,
          last_sync_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", loaded.id);
      return { status: conn.state, rawState: conn.rawState, qrBase64: qr, qrCode };
    } catch (e) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "error", last_error: (e as Error).message })
        .eq("id", loaded.id);
      throw e;
    }
  });

export const getWhatsAppInstanceState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { instanceId: string }) =>
    z.object({ instanceId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, status, qr_code_url, last_sync_at, last_error")
      .eq("id", data.instanceId)
      .maybeSingle();
    return row;
  });

export const disconnectWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { instanceId: string }) =>
    z.object({ instanceId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const loaded = await loadInstanceWithToken(data.instanceId);
    if (!loaded) return { ok: true };
    await logoutInstance(loaded.config, loaded.name).catch(() => null);
    await deleteInstance(loaded.config, loaded.name).catch(() => null);
    await supabaseAdmin.from("whatsapp_secrets").delete().eq("instance_id", loaded.id);
    await supabaseAdmin.from("whatsapp_instances").delete().eq("id", loaded.id);
    return { ok: true };
  });

// Diagnose: testa conexão sem mexer no estado
export const diagnoseWhatsAppInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { instanceId: string }) =>
    z.object({ instanceId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const loaded = await loadInstanceWithToken(data.instanceId);
    if (!loaded) throw new Error("Instância não encontrada.");
    return diagnoseInstance(loaded.config, loaded.name);
  });

// Importação de histórico — processa INLINE pra dar feedback imediato.
// Estratégia: insere o sync_job já como running (escapa do claim do cron),
// processa todos os chats, retorna o resultado. Se o serverless TTL matar
// a request, o cron worker retoma via claim_pending_jobs (locked_at > 10min).
// Decisão arquitetural: grupos NUNCA são importados (Codex audit #6).
export const importWhatsAppHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { instanceId: string; days: number; maxChats?: number }) =>
      z
        .object({
          instanceId: z.string().uuid(),
          days: z.number().int().min(1).max(365),
          // Cap em 5000. Default 50 pra caber em ~30s e evitar timeout serverless.
          // Pra volumes maiores, usuário pode subir e usar "Processar pendentes"
          // pra retomar quando o job órfão exceder o TTL.
          maxChats: z.number().int().min(1).max(5000).default(50),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const loaded = await loadInstanceWithToken(data.instanceId);
    if (!loaded) throw new Error("Instância não encontrada.");

    // Detecta jobs órfãos (running/pending > 2min sem update): assume timeout
    // serverless anterior ou request abortado e libera pra novo run.
    const staleCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("sync_jobs")
      .update({ status: "failed", error_text: "Job órfão liberado (>2min sem update).", finished_at: new Date().toISOString() })
      .eq("instance_id", loaded.id)
      .in("status", ["pending", "running"])
      .lt("locked_at", staleCutoff);

    // Bloqueia segundo enqueue só se houver job vivo recente.
    const { data: alive } = await supabaseAdmin
      .from("sync_jobs")
      .select("id, status, locked_at")
      .eq("instance_id", loaded.id)
      .in("status", ["pending", "running"])
      .gte("locked_at", staleCutoff)
      .limit(1);
    if (alive && alive.length) {
      throw new Error("Já existe uma importação em andamento (iniciada há menos de 2min). Aguarde concluir ou tente de novo em alguns instantes.");
    }

    const nowIso = new Date().toISOString();
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("sync_jobs")
      .insert({
        instance_id: loaded.id,
        type: "import_history",
        status: "running",
        started_at: nowIso,
        locked_at: nowIso,
        attempt_count: 1,
        params: { days: data.days, maxChats: data.maxChats, includeGroups: false },
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (jobErr || !job) throw new Error(jobErr?.message ?? "Falha ao registrar job.");

    // Processa inline. Se der timeout serverless, status fica "running" com
    // locked_at antigo e a próxima rodada retoma.
    try {
      const result = await processSyncHistoryJob(job.id);
      return { jobId: job.id, status: "done" as const, ...result };
    } catch (e) {
      return { jobId: job.id, status: "failed" as const, error: (e as Error).message, chatsFound: 0, chatsImported: 0, messagesImported: 0, audiosQueued: 0, errors: [] as string[] };
    }
  });

// Limpa conversas com lead_phone não-numérico (resíduo de bug de parsing
// Evolution v2 onde `id` cuid era tratado como JID). Operação destrutiva mas
// safe pra single-tenant — só remove o que claramente é lixo.
export const cleanupInvalidConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Lê todos os lead_phone e filtra os que não são numéricos ou sem mensagens
    const { data: convs } = await supabaseAdmin
      .from("conversations")
      .select("id, lead_phone, message_count");

    const invalidIds = (convs ?? [])
      .filter((c) => !isValidPhone(c.lead_phone) || (c.message_count ?? 0) === 0)
      .map((c) => c.id);

    if (invalidIds.length === 0) {
      return { deleted: 0 };
    }

    // Messages CASCADE via FK on delete cascade.
    const { error } = await supabaseAdmin
      .from("conversations")
      .delete()
      .in("id", invalidIds);
    if (error) throw new Error(error.message);
    return { deleted: invalidIds.length };
  });

// Apaga TODAS as conversas Evolution (preserva demo + upload). Destrutivo —
// pra usar quando o user quer começar do zero antes de re-importar.
export const wipeEvolutionConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Conta antes
    const { count: before } = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("source", "evolution");
    // Apaga — mensagens vão em cascade pela FK
    const { error } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("source", "evolution");
    if (error) throw new Error(error.message);
    // Cancela qualquer sync_job órfão
    await supabaseAdmin
      .from("sync_jobs")
      .update({ status: "failed", error_text: "Cancelado por wipe manual.", finished_at: new Date().toISOString() })
      .in("status", ["pending", "running"]);
    return { deleted: before ?? 0 };
  });

// Apaga TODAS as conversas vindas de upload manual (preserva demo + Evolution).
export const wipeUploadConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Conta antes
    const { count: before } = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("source", "upload");
    // Apaga — mensagens vão em cascade pela FK
    const { error } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("source", "upload");
    if (error) throw new Error(error.message);
    return { deleted: before ?? 0 };
  });

// Apaga uma conversa individualmente (mensagens, objeções etc vão em cascata via FK)
export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Apaga múltiplas conversas selecionadas por ID
export const deleteMultipleConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversationIds: string[] }) =>
    z.object({ conversationIds: z.array(z.string().uuid()).min(1).max(5000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { count: before } = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .in("id", data.conversationIds);
    const { error } = await supabaseAdmin
      .from("conversations")
      .delete()
      .in("id", data.conversationIds);
    if (error) throw new Error(error.message);
    return { deleted: before ?? data.conversationIds.length };
  });


// Apaga TODAS as conversas de demonstração (preserva Evolution + upload).
export const wipeDemoConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { count: before } = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("source", "demo");
    const { error } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("source", "demo");
    if (error) throw new Error(error.message);
    return { deleted: before ?? 0 };
  });

// DEBUG: sonda crua da Evolution. Chama findChats e findMessages e devolve o
// JSON LITERAL (truncado) de cada tentativa — pra diagnosticar o shape real da
// resposta sem ficar adivinhando payloads. Não persiste nada.
export const probeEvolutionApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { instanceId: string; jid?: string }) =>
    z.object({ instanceId: z.string().uuid(), jid: z.string().max(64).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const loaded = await loadInstanceWithToken(data.instanceId);
    if (!loaded) throw new Error("Instância não encontrada.");
    const inst = encodeURIComponent(loaded.name);
    const trunc = (v: unknown, n = 1800): string => {
      try {
        return JSON.stringify(v).slice(0, n);
      } catch {
        return String(v).slice(0, n);
      }
    };
    const keysOf = (b: unknown): string[] | string =>
      b && typeof b === "object" && !Array.isArray(b) ? Object.keys(b as object) : "(array ou primitivo)";

    // Marcador de versão do código: se aparecer no JSON, o build com o fix @lid
    // está no runtime. Se sumir, o Lovable está rodando código antigo.
    const out: Record<string, any> = { instanceName: loaded.name, codeVersion: "lid-fix-v2" };

    // 1) findChats — tenta os dois shapes mais comuns da v2.
    const chatAttempts: Array<{ tag: string; payload: Record<string, unknown> }> = [
      { tag: "findChats-empty", payload: {} },
      { tag: "findChats-where-empty", payload: { where: {} } },
    ];
    const findChats: any[] = [];
    let firstChatArr: unknown[] = [];
    for (const a of chatAttempts) {
      const r = await evoFetch(loaded.config, "POST", `/chat/findChats/${inst}`, a.payload);
      const b = r.body as Record<string, unknown> | unknown[] | null;
      const arr = Array.isArray(b)
        ? b
        : ((b as any)?.data ?? (b as any)?.records ?? (b as any)?.chats ?? (b as any)?.result ?? []);
      if (Array.isArray(arr) && arr.length && !firstChatArr.length) firstChatArr = arr;
      findChats.push({
        tag: a.tag,
        status: r.status,
        topLevelKeys: keysOf(b),
        count: Array.isArray(arr) ? arr.length : 0,
        firstItemKeys: Array.isArray(arr) && arr[0] ? keysOf(arr[0]) : [],
        sample: trunc(Array.isArray(arr) ? arr.slice(0, 2) : b),
      });
    }
    out.findChats = findChats;

    // Conta grupos vs individuais e isola o PRIMEIRO chat individual (não-grupo)
    // — é o caminho real do import (grupos são pulados). O probe anterior pegava
    // um grupo e mascarava o problema.
    const isGroupJid = (j: unknown) => typeof j === "string" && j.endsWith("@g.us");
    let groups = 0;
    let individuals = 0;
    let firstIndividual: any = null;
    for (const c of firstChatArr) {
      const rj = (c as any)?.remoteJid;
      if (isGroupJid(rj)) groups++;
      else {
        individuals++;
        if (!firstIndividual) firstIndividual = c;
      }
    }
    out.chatBreakdown = { total: firstChatArr.length, groups, individuals };

    // Mostra o chat individual escolhido + a key da última mensagem dele.
    // CRÍTICO: se chat.remoteJid for número@s.whatsapp.net mas a msg vier com
    // key.remoteJid em @lid, descobrimos aqui o porquê do findMessages dar 0.
    out.individualChat = firstIndividual
      ? {
          remoteJid: firstIndividual.remoteJid,
          pushName: firstIndividual.pushName,
          lastMessageKey: firstIndividual.lastMessage?.key ?? null,
        }
      : null;

    // Monta lista de candidatos de JID pra testar contra findMessages.
    const explicit = data.jid?.trim();
    const chatJid: string | undefined = firstIndividual?.remoteJid;
    const lastKey = firstIndividual?.lastMessage?.key ?? {};
    const candidates: Array<{ label: string; jid: string }> = [];
    const pushCand = (label: string, j: unknown) => {
      if (typeof j === "string" && j && !candidates.some((c) => c.jid === j)) {
        candidates.push({ label, jid: j });
      }
    };
    if (explicit) pushCand("explicit", explicit);
    pushCand("chat.remoteJid", chatJid);
    pushCand("lastMessage.key.remoteJid", lastKey.remoteJid);
    pushCand("lastMessage.key.participantAlt", lastKey.participantAlt);
    pushCand("lastMessage.key.participant", lastKey.participant);
    out.candidates = candidates.map((c) => c.label + "=" + c.jid);

    // 2) findMessages — pra CADA candidato de JID, testa where.key.remoteJid.
    const findMessages: any[] = [];
    for (const cand of candidates) {
      const r = await evoFetch(loaded.config, "POST", `/chat/findMessages/${inst}`, {
        where: { key: { remoteJid: cand.jid } },
        page: 1,
        offset: 20,
      });
      const b = r.body as any;
      const arr = Array.isArray(b)
        ? b
        : (b?.messages?.records ?? b?.messages ?? b?.records ?? b?.data?.records ?? b?.data ?? []);
      findMessages.push({
        candidate: cand.label,
        jid: cand.jid,
        status: r.status,
        total: b?.messages?.total ?? null,
        count: Array.isArray(arr) ? arr.length : 0,
        firstMsgKey: Array.isArray(arr) && arr[0] ? (arr[0] as any).key : null,
        firstMsgText:
          Array.isArray(arr) && arr[0]
            ? (arr[0] as any).message?.conversation ??
              (arr[0] as any).message?.extendedTextMessage?.text ??
              "(sem texto)"
            : null,
      });
    }
    out.findMessages = findMessages;

    // 3) ANÁLISE DE FUNIL: distribuição de domínios de JID + quantos chats
    // sobrevivem cada etapa de filtro. Diz EXATAMENTE onde os chats somem
    // (domínio rejeitado? filtro de data? grupo?).
    const dayMs = 86400 * 1000;
    const now = Date.now();
    const domainCount: Record<string, number> = {};
    let individualNonGroup = 0;
    let survives7d = 0;
    let survives30d = 0;
    let survives90d = 0;
    let noTimestamp = 0;
    for (const c of firstChatArr) {
      const rj = (c as any)?.remoteJid;
      const dom = typeof rj === "string" && rj.includes("@") ? rj.split("@")[1] : "(sem-@)";
      domainCount[dom] = (domainCount[dom] ?? 0) + 1;
      if (isGroupJid(rj)) continue;
      individualNonGroup++;
      // readChatLastInteractionMs equivalente (inline, simplificado).
      const lm = (c as any)?.lastMessage ?? {};
      const tsCandidates = [
        (c as any)?.updatedAt,
        (c as any)?.lastMessageTimestamp,
        lm?.messageTimestamp,
        lm?.timestamp,
      ];
      let bestMs = 0;
      for (const t of tsCandidates) {
        let ms = 0;
        if (typeof t === "number") ms = t < 1e12 ? t * 1000 : t;
        else if (typeof t === "string") {
          const n = Number(t);
          ms = Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : Date.parse(t) || 0;
        }
        if (ms > bestMs) bestMs = ms;
      }
      if (!bestMs) { noTimestamp++; continue; }
      if (bestMs >= now - 7 * dayMs) survives7d++;
      if (bestMs >= now - 30 * dayMs) survives30d++;
      if (bestMs >= now - 90 * dayMs) survives90d++;
    }
    out.funnel = {
      totalChats: firstChatArr.length,
      domainBreakdown: domainCount,
      individualNonGroup,
      individualSemTimestamp: noTimestamp,
      individualAtivos7d: survives7d,
      individualAtivos30d: survives30d,
      individualAtivos90d: survives90d,
    };

    // 4) CAMINHO REAL DO IMPORT (sem persistir): roda fetchChatsForImport.
    try {
      const sinceUnix = Math.floor((now - 30 * dayMs) / 1000);
      const real = await fetchChatsForImport(loaded.config, loaded.name, {
        includeGroups: false,
        maxChats: 50,
        sinceUnix,
      });
      out.importWouldFind = {
        ok: real.ok,
        count: real.chats.length,
        diagnostic: real.diagnostic ?? null,
        error: real.error ?? null,
        sample: real.chats.slice(0, 8).map((c) => ({
          remote_jid: c.remote_jid,
          lead_phone: c.lead_phone,
          display_name: c.display_name,
        })),
      };
    } catch (e) {
      out.importWouldFind = { error: (e as Error).message };
    }

    return out;
  });

// Botão "Processar pendentes" — claima jobs pendentes/órfãos sem criar novo.
// Permite ao admin destravar sem depender de cron.
export const processSyncQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { instanceId: string }) =>
      z.object({ instanceId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Libera órfãos primeiro pra poderem ser pegos novamente.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("sync_jobs")
      .update({ status: "pending", locked_at: null })
      .eq("instance_id", data.instanceId)
      .eq("status", "running")
      .lt("locked_at", tenMinutesAgo);

    const { data: pending } = await supabaseAdmin
      .from("sync_jobs")
      .select("id")
      .eq("instance_id", data.instanceId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5);

    if (!pending || pending.length === 0) {
      return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;
    for (const job of pending) {
      // Marca como running (mini-claim manual, scope da instância — sem corrida com cron).
      const nowIso = new Date().toISOString();
      const { data: claimed } = await supabaseAdmin
        .from("sync_jobs")
        .update({ status: "running", started_at: nowIso, locked_at: nowIso })
        .eq("id", job.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;
      try {
        await processSyncHistoryJob(job.id);
        processed++;
      } catch {
        failed++;
      }
    }
    return { processed, failed };
  });

// Worker payload: processa UM job inteiro (chamado pelo route /api/public/sync-history-job).
// Idempotente: usa unique parcial em messages(conversation_id, external_msg_id).
export async function processSyncHistoryJob(jobId: string): Promise<{
  chatsFound: number;
  chatsImported: number;
  messagesImported: number;
  audiosQueued: number;
  errors: string[];
}> {
  const { data: job } = await supabaseAdmin
    .from("sync_jobs")
    .select("id, instance_id, params")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) throw new Error("Job não encontrado.");

  const loaded = await loadInstanceWithToken(job.instance_id);
  if (!loaded) throw new Error("Instância do job não encontrada.");

  const params = (job.params ?? {}) as { days?: number; maxChats?: number };
  const days = Math.max(1, Math.min(365, Number(params.days ?? 30)));
  const maxChats = Math.max(1, Math.min(5000, Number(params.maxChats ?? 200)));
  const sinceUnix = Math.floor((Date.now() - days * 86400 * 1000) / 1000);

  try {
    const chatsRes = await fetchChatsForImport(loaded.config, loaded.name, {
      includeGroups: false,
      maxChats,
      sinceUnix,
    });
    if (!chatsRes.ok) {
      await supabaseAdmin
        .from("sync_jobs")
        .update({
          status: "failed",
          error_text: chatsRes.error ?? `HTTP ${chatsRes.status}`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      throw new Error(chatsRes.error ?? "Falha ao listar conversas.");
    }

    const { data: instWithSeller } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("seller_id")
      .eq("id", loaded.id)
      .maybeSingle();
    const instanceSellerId: string | null = instWithSeller?.seller_id ?? null;

    const { data: sellersRaw } = await supabaseAdmin
      .from("sellers")
      .select("id, name, phone, active");
    const activeSellers = (sellersRaw ?? []).filter((s) => s.active);
    const whitelist = buildSellerWhitelist(activeSellers);

    await supabaseAdmin
      .from("sync_jobs")
      .update({ chats_found: chatsRes.chats.length })
      .eq("id", jobId);

    // Caso especial: Evolution não retornou nenhum chat com JID válido.
    // Propaga o diagnóstico bruto pra o usuário entender qual endpoint falhou.
    if (chatsRes.chats.length === 0) {
      const errMsg = chatsRes.error
        ? chatsRes.error
        : `Nenhum chat com JID válido retornado pela Evolution.${chatsRes.diagnostic ? ` Diagnóstico: ${chatsRes.diagnostic}` : ""}`;
      await supabaseAdmin
        .from("sync_jobs")
        .update({
          status: "done",
          finished_at: new Date().toISOString(),
          error_text: errMsg,
        })
        .eq("id", jobId);
      return {
        chatsFound: 0,
        chatsImported: 0,
        messagesImported: 0,
        audiosQueued: 0,
        errors: [errMsg],
      };
    }

    let chatsImported = 0;
    let messagesImported = 0;
    let audiosQueued = 0;
    const errors: string[] = [];

    for (const chat of chatsRes.chats) {
      if (chat.is_group) continue; // garantia extra
      // Evolution v2 nova: chat.remote_jid pode ser @lid (interno). O número
      // real (PN) vem em chat.lead_phone, extraído de remoteJidAlt. As MENSAGENS
      // são buscadas pelo remote_jid exato (@lid), não pelo número.
      const leadPhone = chat.lead_phone ?? chat.remote_jid.split("@")[0]!.split(":")[0]!;
      if (!isValidPhone(leadPhone)) {
        errors.push(`${chat.remote_jid}: sem telefone real ('${leadPhone}'), pulando`);
        continue;
      }

      // Usa nome real do contato (pushName) quando disponível, fallback pro mask.
      const incomingName = chat.display_name?.trim()
        ? chat.display_name.trim().slice(0, 100)
        : null;
      const leadName = incomingName ?? `Lead ${maskPhone(leadPhone)}`;
      // Nome "de verdade" = não é número puro nem placeholder "Lead ***".
      const isRealName = (n: string | null | undefined) =>
        !!n && !/^\+?\d{6,20}$/.test(n) && !n.startsWith("Lead ");

      let conversationId: string | null = null;
      // DEDUP por lead_phone (une PN + @lid do MESMO contato numa conversa).
      // Evolution v2 nova lista o mesmo contato 2x: número@s.whatsapp.net (com
      // histórico antigo) e xxx@lid (mensagens recentes). Ambos têm o mesmo
      // lead_phone, então convergem aqui. CRÍTICO: quando seller_id é null,
      // usar .is() — .eq(null) nunca casa no PostgREST e duplicaria a conversa.
      let dedupQuery = supabaseAdmin
        .from("conversations")
        .select("id, lead_name_anon")
        .eq("lead_phone", leadPhone)
        .eq("source", "evolution");
      dedupQuery = instanceSellerId
        ? dedupQuery.eq("seller_id", instanceSellerId)
        : dedupQuery.is("seller_id", null);
      const { data: existingRows } = await dedupQuery.limit(1);
      const existing = existingRows?.[0] ?? null;

      if (existing) {
        conversationId = existing.id;
        // Promove pro nome real quando o existente é placeholder OU número puro
        // (ex: conversa criada pelo chat PN sem pushName ganha o nome do @lid).
        if (isRealName(incomingName) && !isRealName(existing.lead_name_anon)) {
          await supabaseAdmin
            .from("conversations")
            .update({ lead_name_anon: incomingName })
            .eq("id", existing.id);
        }
      } else {
        const { data: created, error: ce } = await supabaseAdmin
          .from("conversations")
          .insert({
            seller_id: instanceSellerId,
            lead_phone: leadPhone,
            lead_name_anon: leadName,
            source: "evolution",
            external_chat_id: chat.remote_jid,
            first_msg_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (ce || !created) {
          errors.push(`${chat.remote_jid}: conv ${ce?.message}`);
          continue;
        }
        conversationId = created.id;
      }

      const msgsRes = await fetchMessagesForChat(
        loaded.config,
        loaded.name,
        chat.remote_jid,
        sinceUnix,
      );
      if (!msgsRes.ok) {
        errors.push(`${chat.remote_jid}: msgs HTTP ${msgsRes.status}${msgsRes.diagnostic ? ` | ${msgsRes.diagnostic}` : ""}`);
        continue;
      }
      // Diagnóstico: se chat tem mensagens segundo o webhook mas findMessages
      // devolve 0 em todos os payloads, registra pro user ver no error_text.
      if (msgsRes.messages.length === 0 && msgsRes.diagnostic && errors.length < 3) {
        errors.push(`${chat.remote_jid}: 0 msgs | tentativas: ${msgsRes.diagnostic}`);
      }

      const rows = msgsRes.messages.map((m) => {
        const anon = m.text ? anonymizeText(m.text, whitelist).anonymized : null;
        const audioUrl = m.audio_base64
          ? `data:audio/ogg;base64,${m.audio_base64}`
          : null;
        if (m.media_type === "audio" && audioUrl) audiosQueued++;
        return {
          conversation_id: conversationId,
          sender_role: m.from_me ? "seller" : "lead",
          ts: m.ts,
          media_type: m.media_type,
          text: anon,
          external_msg_id: m.external_msg_id,
          audio_url: audioUrl,
          audio_transcript: null,
          raw: m.raw as never,
        };
      });

      if (rows.length > 0) {
        const chunk = 500;
        for (let i = 0; i < rows.length; i += chunk) {
          const slice = rows.slice(i, i + chunk);
          // Previne duplicados por external_msg_id sem depender de constraint ON CONFLICT que pode não existir no postgres
          const incomingWithId = slice.filter((r) => r.external_msg_id);
          let existingIds = new Set<string>();
          if (incomingWithId.length > 0) {
            const { data: existingRows } = await supabaseAdmin
              .from("messages")
              .select("external_msg_id")
              .eq("conversation_id", conversationId)
              .in("external_msg_id", incomingWithId.map((r) => r.external_msg_id!));
            if (existingRows) {
              existingIds = new Set(existingRows.map((r) => r.external_msg_id).filter((id): id is string => Boolean(id)));
            }
          }
          const toInsert = slice.filter((r) => !r.external_msg_id || !existingIds.has(r.external_msg_id));
          if (toInsert.length > 0) {
            const { error: insErr } = await supabaseAdmin
              .from("messages")
              .insert(toInsert);
            if (insErr) errors.push(`${chat.remote_jid}: insert ${insErr.message}`);
            else messagesImported += toInsert.length;
          }
        }
      }

      // Atualiza os agregados da conversa (message_count/last_msg_at/first_msg_at)
      // — TODOS os gates do pipeline (quality_score, playbook, DNA) filtram por
      // message_count, então sem isso a conversa fica invisível ao sistema.
      if (conversationId) {
        const { count: realCount } = await supabaseAdmin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId);
        const tsList = msgsRes.messages.map((m) => m.ts).filter(Boolean).sort();
        await supabaseAdmin
          .from("conversations")
          .update({
            message_count: realCount ?? msgsRes.messages.length,
            last_msg_at: tsList[tsList.length - 1] ?? null,
            first_msg_at: tsList[0] ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }
      chatsImported++;

      if (chatsImported % 5 === 0) {
        await supabaseAdmin
          .from("sync_jobs")
          .update({
            chats_imported: chatsImported,
            messages_imported: messagesImported,
            audios_queued: audiosQueued,
            errors: errors.slice(0, 20) as never,
          })
          .eq("id", jobId);
      }
    }

    await supabaseAdmin
      .from("sync_jobs")
      .update({
        status: "done",
        chats_imported: chatsImported,
        messages_imported: messagesImported,
        audios_queued: audiosQueued,
        errors: errors.slice(0, 20) as never,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return {
      chatsFound: chatsRes.chats.length,
      chatsImported,
      messagesImported,
      audiosQueued,
      errors: errors.slice(0, 5),
    };
  } catch (e) {
    await supabaseAdmin
      .from("sync_jobs")
      .update({
        status: "failed",
        error_text: (e as Error).message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    throw e;
  }
}

// ============ Sellers CRUD ============

export const upsertSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id?: string | null;
      name: string;
      phone: string;
      email?: string | null;
      active?: boolean;
    }) =>
      z
        .object({
          id: z.string().uuid().nullable().optional(),
          name: z.string().min(1).max(120),
          phone: z.string().min(8).max(32),
          email: z.string().email().max(255).nullable().optional(),
          active: z.boolean().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = {
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      active: data.active ?? true,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("sellers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("sellers").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("sellers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ App settings ============

export const saveBusinessHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { start: string; end: string; days: number[] }) =>
      z
        .object({
          start: z.string().regex(/^\d{2}:\d{2}$/),
          end: z.string().regex(/^\d{2}:\d{2}$/),
          days: z.array(z.number().min(0).max(6)).min(1).max(7),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({
        business_hours: { start: data.start, end: data.end, days: data.days },
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveOpenAIByok = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { apiKey: string | null }) =>
      // Aceita null (desativar), string vazia (= "manter atual"), ou key válida ≥20 chars.
      z
        .object({
          apiKey: z
            .string()
            .max(512)
            .nullable()
            .refine(
              (v) => v === null || v === "" || v.length >= 20,
              "Chave inválida (mínimo 20 caracteres).",
            ),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Vazio ou null: não muda a key gravada (apenas o toggle has_openai_byok).
    const desired = data.apiKey;
    if (desired === null) {
      // Desativar BYOK: limpa key e toggle.
      await supabaseAdmin
        .from("app_secrets")
        .upsert({ id: true, openai_api_key: null, updated_at: new Date().toISOString() });
      await supabaseAdmin
        .from("app_settings")
        .update({ has_openai_byok: false, updated_at: new Date().toISOString() })
        .eq("id", true);
    } else if (desired === "") {
      // "Manter atual": não toca em app_secrets, garante toggle ligado.
      await supabaseAdmin
        .from("app_settings")
        .update({ has_openai_byok: true, updated_at: new Date().toISOString() })
        .eq("id", true);
    } else {
      // Nova key.
      await supabaseAdmin
        .from("app_secrets")
        .upsert({ id: true, openai_api_key: desired, updated_at: new Date().toISOString() });
      await supabaseAdmin
        .from("app_settings")
        .update({ has_openai_byok: true, updated_at: new Date().toISOString() })
        .eq("id", true);
    }
    return { ok: true };
  });

// ============ Assign seller to conversation ============

export const assignSellerToConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { conversationId: string; sellerId: string }) =>
      z
        .object({
          conversationId: z.string().uuid(),
          sellerId: z.string().uuid(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Any authenticated user can assign (UX requirement).
    void context;
    const { error } = await supabaseAdmin
      .from("conversations")
      .update({ seller_id: data.sellerId, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Upload manual ============

export const uploadWhatsAppExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { sellerId: string; fileText: string; fileName?: string; leadPhone?: string }) =>
      z
        .object({
          sellerId: z.string().uuid(),
          fileText: z.string().min(1).max(5_000_000),
          fileName: z.string().max(255).optional(),
          leadPhone: z.string().max(30).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    void context;
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, name, phone")
      .eq("id", data.sellerId)
      .single();
    if (!seller) throw new Error("Vendedor não encontrado");

    const { data: sellers } = await supabaseAdmin.from("sellers").select("name, phone");
    const whitelist = buildSellerWhitelist(sellers ?? []);
    const sellerNameLower = seller.name.toLowerCase().trim();

    const parsed = parseWhatsAppExport(data.fileText);
    if (parsed.length === 0) throw new Error("Não foi possível interpretar o arquivo.");

    // Lead identification: first non-seller author
    const leadName =
      parsed.find((p) => p.authorName.toLowerCase().trim() !== sellerNameLower && !p.isSystem)
        ?.authorName ?? "Lead";

    const digitsOnly = leadName.replace(/\D/g, "");
    let leadPhone: string;
    if (data.leadPhone && isValidPhone(data.leadPhone.trim())) {
      leadPhone = data.leadPhone.trim();
    } else if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
      leadPhone = leadName.trim().startsWith("+") ? `+${digitsOnly}` : digitsOnly;
    } else {
      leadPhone = `+5500${Date.now().toString().slice(-8)}${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const leadNameAnon = digitsOnly.length >= 8 ? `Lead ${maskPhone(leadName)}` : `Lead ${leadName}`;

    const firstTs = parsed[0]!.ts;
    const lastTs = parsed[parsed.length - 1]!.ts;

    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .insert({
        seller_id: seller.id,
        lead_phone: leadPhone,
        lead_name_anon: leadNameAnon,
        source: "upload",
        first_msg_at: firstTs,
        last_msg_at: lastTs,
        message_count: parsed.length,
      })
      .select("id")
      .single();
    if (convErr || !conv) throw new Error(convErr?.message ?? "Falha ao criar conversa");

    const messages = parsed.map((p) => {
      const isSeller = p.authorName.toLowerCase().trim() === sellerNameLower;
      const role: "seller" | "lead" | "system" = p.isSystem ? "system" : isSeller ? "seller" : "lead";
      const anon = anonymizeText(p.text, whitelist);
      const isAudio = /<.*udio.*omitido>/i.test(p.text) || /audio omitted/i.test(p.text);
      return {
        conversation_id: conv.id,
        sender_role: role,
        ts: p.ts,
        media_type: p.isSystem ? "system" : isAudio ? "audio" : "text",
        text: anon.anonymized,
        audio_url: null as string | null,
        audio_transcript: null as string | null,
        raw: { authorName: p.authorName } as any,
      };
    });
    const audioCount = messages.filter((m) => m.media_type === "audio").length;

    // Insert in chunks
    const chunk = 500;
    for (let i = 0; i < messages.length; i += chunk) {
      const slice = messages.slice(i, i + chunk);
      const { error } = await supabaseAdmin.from("messages").insert(slice);
      if (error) throw new Error(error.message);
    }

    // Auto-analisa etapas e objeções da conversa importada em background imediato
    analyzeConversation(conv.id).catch((e) =>
      console.warn(`[uploadWhatsAppExport] Auto-analyze falhou para ${conv.id}:`, (e as Error).message)
    );

    return { conversationId: conv.id, messageCount: messages.length, audioCount };
  });

export const uploadMultipleWhatsAppExports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      sellerId: string;
      items: Array<{
        fileName: string;
        fileText: string;
        leadPhone?: string;
      }>;
    }) =>
      z
        .object({
          sellerId: z.string().uuid(),
          items: z
            .array(
              z.object({
                fileName: z.string().max(255),
                fileText: z.string().min(1).max(10_000_000),
                leadPhone: z.string().max(30).optional(),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    void context;
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, name, phone")
      .eq("id", data.sellerId)
      .single();
    if (!seller) throw new Error("Vendedor não encontrado");

    const { data: sellers } = await supabaseAdmin.from("sellers").select("name, phone");
    const whitelist = buildSellerWhitelist(sellers ?? []);
    const sellerNameLower = seller.name.toLowerCase().trim();

    const results = [];

    for (const item of data.items) {
      const parsed = parseWhatsAppExport(item.fileText);
      if (parsed.length === 0) continue;

      const leadName =
        parsed.find((p) => p.authorName.toLowerCase().trim() !== sellerNameLower && !p.isSystem)
          ?.authorName ?? "Lead";

      const digitsOnly = leadName.replace(/\D/g, "");
      let leadPhone: string;
      if (item.leadPhone && isValidPhone(item.leadPhone.trim())) {
        leadPhone = item.leadPhone.trim();
      } else if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
        leadPhone = leadName.trim().startsWith("+") ? `+${digitsOnly}` : digitsOnly;
      } else {
        leadPhone = `+5500${Date.now().toString().slice(-8)}${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const leadNameAnon = digitsOnly.length >= 8 ? `Lead ${maskPhone(leadName)}` : `Lead ${leadName}`;

      const firstTs = parsed[0]!.ts;
      const lastTs = parsed[parsed.length - 1]!.ts;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .insert({
          seller_id: seller.id,
          lead_phone: leadPhone,
          lead_name_anon: leadNameAnon,
          source: "upload",
          first_msg_at: firstTs,
          last_msg_at: lastTs,
          message_count: parsed.length,
        })
        .select("id")
        .single();
      if (convErr || !conv) throw new Error(convErr?.message ?? "Falha ao criar conversa");

      const messages = parsed.map((p) => {
        const isSeller = p.authorName.toLowerCase().trim() === sellerNameLower;
        const role: "seller" | "lead" | "system" = p.isSystem ? "system" : isSeller ? "seller" : "lead";
        const anon = anonymizeText(p.text, whitelist);
        const isAudio = /<.*udio.*omitido>/i.test(p.text) || /audio omitted/i.test(p.text);
        return {
          conversation_id: conv.id,
          sender_role: role,
          ts: p.ts,
          media_type: p.isSystem ? "system" : isAudio ? "audio" : "text",
          text: anon.anonymized,
          audio_url: null as string | null,
          audio_transcript: null as string | null,
          raw: { authorName: p.authorName } as any,
        };
      });
      const audioCount = messages.filter((m) => m.media_type === "audio").length;

      const chunk = 500;
      for (let i = 0; i < messages.length; i += chunk) {
        const slice = messages.slice(i, i + chunk);
        const { error } = await supabaseAdmin.from("messages").insert(slice);
        if (error) throw new Error(error.message);
      }

      // Auto-analisa etapas e objeções da conversa importada
      analyzeConversation(conv.id).catch((e) =>
        console.warn(`[uploadMultiple] Auto-analyze falhou para ${conv.id}:`, (e as Error).message)
      );

      results.push({
        conversationId: conv.id,
        fileName: item.fileName,
        leadPhone,
        leadNameAnon,
        sellerName: seller.name,
        messageCount: messages.length,
        audioCount,
        firstMsgAt: firstTs,
        lastMsgAt: lastTs,
        messages: messages.map((m) => ({
          sender_role: m.sender_role,
          ts: m.ts,
          text: m.text,
          media_type: m.media_type,
        })),
      });
    }

    return { total: results.length, items: results };
  });


// ============ Demo seed ============

export const ensureDemoSeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Only admins seed.
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) return { seeded: false, reason: "not_admin" };

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("demo_seeded")
      .eq("id", true)
      .maybeSingle();
    if (settings?.demo_seeded) return { seeded: false, reason: "already_seeded" };

    // Insert sellers (idempotent on unique phone)
    const sellerIdByName: Record<string, string> = {};
    for (const s of DEMO_SELLERS) {
      const { data: existing } = await supabaseAdmin
        .from("sellers")
        .select("id")
        .eq("phone", s.phone)
        .maybeSingle();
      if (existing) {
        sellerIdByName[s.name] = existing.id;
        continue;
      }
      const { data: ins, error } = await supabaseAdmin
        .from("sellers")
        .insert({ name: s.name, phone: s.phone, email: s.email })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      sellerIdByName[s.name] = ins!.id;
    }

    const { data: allSellers } = await supabaseAdmin.from("sellers").select("name, phone");
    const whitelist = buildSellerWhitelist(allSellers ?? []);

    for (const conv of DEMO_CONVERSATIONS) {
      const sellerId = sellerIdByName[conv.seller_name]!;
      const { data: existingConv } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("seller_id", sellerId)
        .eq("lead_phone", conv.lead_phone)
        .maybeSingle();
      if (existingConv) continue;
      const { data: createdConv, error: cErr } = await supabaseAdmin
        .from("conversations")
        .insert({
          seller_id: sellerId,
          lead_phone: conv.lead_phone,
          lead_name_anon: conv.lead_name_anon,
          source: "demo",
          outcome: conv.outcome,
          outcome_value: conv.outcome_value ?? null,
          outcome_at: conv.outcome_at ?? null,
          first_msg_at: conv.first_msg_at,
          last_msg_at: conv.last_msg_at,
          message_count: conv.messages.length,
        })
        .select("id")
        .single();
      if (cErr || !createdConv) throw new Error(cErr?.message ?? "Falha demo conv");

      const rows = conv.messages.map((m) => ({
        conversation_id: createdConv.id,
        sender_role: m.sender_role,
        ts: m.ts,
        media_type: m.media_type,
        text: m.text ? anonymizeText(m.text, whitelist).anonymized : null,
        audio_url: m.audio_url ?? null,
        audio_transcript: m.audio_transcript ?? null,
        raw: { demo: true } as any,
      }));
      const { error: mErr } = await supabaseAdmin.from("messages").insert(rows);
      if (mErr) throw new Error(mErr.message);
    }

    await supabaseAdmin
      .from("app_settings")
      .update({ demo_seeded: true, updated_at: new Date().toISOString() })
      .eq("id", true);
    return { seeded: true };
  });

export const transcribeAudioMessageNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { messageId: string }) =>
    z.object({ messageId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { transcribeSingleAudioMessage } = await import("@/lib/transcribe.server");
    const result = await transcribeSingleAudioMessage(data.messageId);
    return { ok: !!result, transcript: result };
  });

export const processPendingTranscriptionsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { processAllPendingTranscriptions } = await import("@/lib/transcribe.server");
    return await processAllPendingTranscriptions(30);
  });

