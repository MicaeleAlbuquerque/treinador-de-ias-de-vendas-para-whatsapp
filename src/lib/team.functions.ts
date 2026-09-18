import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as { id: string; display_name: string | null }[] };

    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    return ids.map((user_id) => ({
      user_id,
      display_name: nameById.get(user_id) ?? null,
    }));
  });

export const getTeamInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("invites")
      .select("id, email, token, expires_at, accepted_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string }) =>
    z.object({ email: z.string().email() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const emailClean = data.email.toLowerCase().trim();
    const { data: inserted, error } = await supabaseAdmin
      .from("invites")
      .insert({
        email: emailClean,
        role: "admin",
        created_by: context.userId,
      })
      .select("token, id")
      .single();

    if (error || !inserted) {
      throw new Error(error?.message ?? "Falha ao criar convite.");
    }
    return { token: inserted.token, id: inserted.id };
  });

export const revokeTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("invites")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      throw new Error("Você não pode remover seu próprio usuário.");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
