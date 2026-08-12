import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getAuthorizationUrl,
  syncAllPending,
  syncConversationOutcome,
  disconnect as pipedriveDisconnect,
  pipedriveRedirectUri,
} from "./pipedrive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Single-tenant: qualquer authed = admin.
async function assertAdmin(_supabase: unknown, userId: string) {
  if (!userId) throw new Error("Não autenticado.");
}

export const getPipedriveAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return { url: await getAuthorizationUrl(context.userId) };
  });

// Status + redirect URI (pra UI saber se tá configurado e o que registrar no Pipedrive).
export const getPipedriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: secrets } = await supabaseAdmin
      .from("app_secrets")
      .select("pipedrive_client_id, pipedrive_client_secret")
      .maybeSingle();
    const dbId = (secrets as { pipedrive_client_id?: string | null } | null)?.pipedrive_client_id ?? null;
    const dbSecret = (secrets as { pipedrive_client_secret?: string | null } | null)?.pipedrive_client_secret ?? null;
    return {
      hasCredsInDb: !!(dbId && dbSecret),
      hasCredsInEnv: !!(process.env.PIPEDRIVE_CLIENT_ID && process.env.PIPEDRIVE_CLIENT_SECRET),
      clientIdMasked: dbId ? `${dbId.slice(0, 6)}…${dbId.slice(-4)}` : null,
      redirectUri: pipedriveRedirectUri(),
    };
  });

// Salva credenciais Pipedrive. Strings vazias = limpar.
export const savePipedriveCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      clientId: z.string().trim().max(200),
      clientSecret: z.string().trim().max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const cleanId = data.clientId || null;
    const cleanSecret = data.clientSecret || null;
    await supabaseAdmin
      .from("app_secrets")
      .upsert({
        id: true,
        pipedrive_client_id: cleanId,
        pipedrive_client_secret: cleanSecret,
      } as never, { onConflict: "id" });
    await supabaseAdmin
      .from("app_settings")
      .upsert({
        id: true,
        has_pipedrive_creds: !!(cleanId && cleanSecret),
      } as never, { onConflict: "id" });
    return { ok: true, hasCredsInDb: !!(cleanId && cleanSecret) };
  });

export const disconnectPipedrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    await pipedriveDisconnect();
    return { ok: true };
  });

export const syncPipedriveNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return await syncAllPending(100);
  });

export const syncConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return await syncConversationOutcome(data.conversationId);
  });

export const overrideOutcomeManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      conversationId: z.string().uuid(),
      outcome: z.enum(["won", "lost", "in_progress", "unknown"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    await supabaseAdmin
      .from("conversations")
      .update({
        outcome: data.outcome,
        outcome_source: "manual",
        outcome_at: new Date().toISOString(),
        outcome_by: context.userId,
        auto_marked: false,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", data.conversationId);
    return { ok: true };
  });