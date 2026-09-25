import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { anonymizeText, buildSellerWhitelist, maskPhone } from "@/lib/anonymize.server";
import { coachEvaluateMessage } from "@/lib/coach.server";
import { transcribeSingleAudioMessage } from "@/lib/transcribe.server";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

async function findInstanceByToken(token: string) {
  const { data } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, instance_name, seller_id")
    .eq("webhook_token", token)
    .maybeSingle();
  return data;
}

function jidToPhone(jid: string | undefined | null): string {
  if (!jid) return "";
  return jid.split("@")[0]!.split(":")[0]!;
}

// Extrai o telefone real (PN). Prefere o alt (remoteJidAlt/participantAlt), que
// carrega o número quando o jid principal vem em @lid; senão usa o próprio jid.
function pickRealPhone(jid?: string | null, altJid?: string | null): string {
  const num = (s?: string | null) => {
    if (!s) return "";
    const local = s.split("@")[0]!.split(":")[0]!.replace(/^\+/, "");
    return /^\d{6,20}$/.test(local) ? local : "";
  };
  return num(altJid) || num(jid);
}

function isGroupJid(jid: string | undefined | null) {
  return !!jid && jid.includes("@g.us");
}

function extractText(message: any): string {
  if (!message) return "";
  const inner =
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.documentWithCaptionMessage?.message ??
    message;

  return (
    inner.conversation ??
    inner.extendedTextMessage?.text ??
    inner.imageMessage?.caption ??
    inner.videoMessage?.caption ??
    inner.documentMessage?.caption ??
    inner.interactiveResponseMessage?.body?.text ??
    inner.buttonsResponseMessage?.selectedDisplayText ??
    inner.templateButtonReplyMessage?.selectedDisplayText ??
    inner.listResponseMessage?.title ??
    (typeof message.body === "string" ? message.body : "")
  );
}

function detectMediaType(message: any): "text" | "audio" | "image" | "video" | "document" {
  if (!message) return "text";
  if (message.audioMessage || message.pttMessage) return "audio";
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.documentMessage) return "document";
  return "text";
}

async function handleMessagesUpsert(instanceId: string, instanceSellerId: string | null, payload: any) {
  const items: any[] = Array.isArray(payload?.data)
    ? payload.data
    : payload?.messages ?? (payload?.key ? [payload] : []);

  const { data: sellers } = await supabaseAdmin
    .from("sellers")
    .select("id, name, phone, active");
  const activeSellers = (sellers ?? []).filter((s) => s.active);
  const whitelist = buildSellerWhitelist(activeSellers);

  for (const it of items) {
    const key = it.key ?? it.message?.key;
    const message = it.message ?? it;
    const jid = key?.remoteJid as string | undefined;
    if (isGroupJid(jid)) {
      console.log(`[webhook] ignoring group message ${key?.id}`);
      continue;
    }
    const fromMe = !!key?.fromMe;
    // Deriva o telefone real (PN). Na Evolution v2 nova o jid pode ser @lid; o
    // número de verdade vem em remoteJidAlt/participantAlt — mesma lógica do
    // import, pra webhook e import convergirem na MESMA conversa.
    const altJid = key?.remoteJidAlt ?? key?.participantAlt ?? null;
    const leadPhone = pickRealPhone(jid, altJid);
    if (!leadPhone || !/^\+?\d{6,20}$/.test(leadPhone)) {
      console.warn(`[webhook] skipping non-numeric lead_phone '${leadPhone}' from jid '${jid}'`);
      continue;
    }

    const convSellerId = instanceSellerId;

    // Upsert conversation. CRÍTICO: quando convSellerId é null, usar .is() —
    // .eq(col, null) nunca casa NULL no PostgREST e duplicaria a conversa a
    // cada mensagem recebida.
    let conversationId: string;
    let convQuery = supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("lead_phone", leadPhone)
      .eq("source", "evolution");
    convQuery = convSellerId
      ? convQuery.eq("seller_id", convSellerId)
      : convQuery.is("seller_id", null);
    const { data: existingConv } = await convQuery.limit(1).maybeSingle();
    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv, error: ce } = await supabaseAdmin
        .from("conversations")
        .insert({
          seller_id: convSellerId,
          lead_phone: leadPhone,
          lead_name_anon: `Lead ${maskPhone(leadPhone)}`,
          source: "evolution",
          external_chat_id: jid ?? null,
          first_msg_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (ce || !newConv) {
        console.error("[webhook] conv insert failed", ce?.message);
        continue;
      }
      conversationId = newConv.id;
    }

    const text = extractText(message?.message ?? message);
    const mediaType = detectMediaType(message?.message ?? message);

    // Se for texto mas não tem nenhum conteúdo real (stubs de criptografia, eventos Baileys, etc.), ignora
    if (mediaType === "text" && !text.trim()) {
      continue;
    }

    // Previne inserção duplicada se a mensagem já foi salva (re-entrega de webhook)
    if (key?.id) {
      const { data: existingMsg } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("external_msg_id", key.id)
        .maybeSingle();
      if (existingMsg) continue;
    }

    const anon = text ? anonymizeText(text, whitelist) : { anonymized: "", replacements: [] };
    const ts = it.messageTimestamp
      ? new Date(Number(it.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    const audioInner = (message?.message ?? message)?.audioMessage ?? (message?.message ?? message)?.pttMessage;
    const audioBase64 = audioInner?.base64 ?? message?.base64 ?? null;
    const audioMime = audioInner?.mimetype ?? "audio/ogg";

    const { data: inserted, error: mErr } = await supabaseAdmin.from("messages").insert({
      conversation_id: conversationId,
      sender_role: fromMe ? "seller" : "lead",
      ts,
      media_type: mediaType,
      text: anon.anonymized || null,
      external_msg_id: key?.id ?? null,
      audio_url: audioBase64 ? `data:${audioMime};base64,${audioBase64}` : null,
      audio_transcript: null,
      raw: it as any,
    }).select("id").maybeSingle();
    if (mErr) {
      console.error("[webhook] msg insert failed", mErr.message);
      continue;
    }

    if (mediaType === "audio" && inserted?.id && audioBase64) {
      // Dispara transcrição de áudio em background
      transcribeSingleAudioMessage(inserted.id).catch((e) =>
        console.error("[webhook transcribe async]", e.message),
      );
    } else if (fromMe && inserted?.id) {
      coachEvaluateMessage(inserted.id).catch((e) => console.error("[coach]", e.message));
    }
    // Update conversation aggregates
    await supabaseAdmin
      .from("conversations")
      .update({
        last_msg_at: ts,
        message_count: (await supabaseAdmin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .then((r) => r.count ?? 0)) as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }
}

async function handleConnectionUpdate(instanceId: string, payload: any) {
  const state = payload?.state ?? payload?.data?.state;
  const qr = payload?.qrcode?.base64 ?? payload?.data?.qrcode?.base64 ?? null;
  await supabaseAdmin
    .from("whatsapp_instances")
    .update({
      status: state === "open" ? "connected" : state ?? "unknown",
      qr_code_url: qr,
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", instanceId);
}

async function handleQrUpdated(instanceId: string, payload: any) {
  const qr = payload?.qrcode?.base64 ?? payload?.base64 ?? null;
  await supabaseAdmin
    .from("whatsapp_instances")
    .update({ qr_code_url: qr, status: "qr", last_sync_at: new Date().toISOString() })
    .eq("id", instanceId);
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return unauthorized();
  const instance = await findInstanceByToken(token);
  if (!instance) return unauthorized();

  if (request.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const event = (body?.event ?? body?.type ?? "").toString().toLowerCase().replace(/\./g, "_");

  try {
    if (event.includes("messages_upsert")) {
      await handleMessagesUpsert(instance.id, instance.seller_id, body);
    } else if (event.includes("connection_update")) {
      await handleConnectionUpdate(instance.id, body);
    } else if (event.includes("qrcode_updated")) {
      await handleQrUpdated(instance.id, body);
    } else {
      console.log(`[webhook] event '${event}' ignored`);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[webhook] handler error", (e as Error).message);
    await supabaseAdmin
      .from("whatsapp_instances")
      .update({ last_error: (e as Error).message })
      .eq("id", instance.id);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200, // ack to prevent retries storm
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
