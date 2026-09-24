import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TeamMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
  created_at: string;
  last_sign_in_at: string | null;
};

// Lista os membros da equipe unindo auth.users, profiles e user_roles
export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamMember[]> => {
    if (!context.userId) {
      throw new Error("Não autenticado.");
    }

    // 1. Busca usuários no auth.admin (permite acessar o e-mail real)
    const {
      data: { users },
      error: authError,
    } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error("[listTeamMembers] Erro ao listar auth.users:", authError);
      throw new Error(authError.message);
    }

    // 2. Busca os perfis cadastrados
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url, created_at");

    if (profilesError) {
      console.warn("[listTeamMembers] Aviso ao consultar perfis:", profilesError);
    }

    // 3. Busca os papéis atribuídos
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");

    if (rolesError) {
      console.warn("[listTeamMembers] Aviso ao consultar user_roles:", rolesError);
    }

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rolesByUserId = new Map<string, string[]>();

    for (const r of roles ?? []) {
      const list = rolesByUserId.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUserId.set(r.user_id, list);
    }

    // Combina as informações
    return (users ?? []).map((u) => {
      const prof = profileById.get(u.id);
      const userRoles = rolesByUserId.get(u.id) ?? [];

      const isAdmin =
        userRoles.includes("admin") ||
        u.app_metadata?.role === "admin";

      const fallbackName =
        (u.user_metadata as any)?.display_name ||
        (u.user_metadata as any)?.name ||
        (u.email ? u.email.split("@")[0] : null);

      return {
        user_id: u.id,
        email: u.email ?? "",
        display_name: prof?.display_name || fallbackName || "Sem nome",
        avatar_url: prof?.avatar_url ?? null,
        role: isAdmin ? "admin" : "member",
        created_at: prof?.created_at || u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    });
  });

// Remove um membro da equipe com segurança
export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ userId: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    if (!context.userId) {
      throw new Error("Não autenticado.");
    }

    if (data.userId === context.userId) {
      throw new Error("Você não pode remover a si mesmo da equipe.");
    }

    // Remove do Supabase Auth - o CASCADE no banco remove perfis e roles automaticamente
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);

    if (error) {
      console.error("[removeTeamMember] Erro ao deletar usuário:", error);
      throw new Error(error.message);
    }

    return { ok: true };
  });

// Cria convite de equipe e dispara o e-mail pelo Supabase Auth (usando o SMTP configurado no Supabase)
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email(),
        origin: z.string().url().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    if (!context.userId) {
      throw new Error("Não autenticado.");
    }

    const cleanEmail = data.email.toLowerCase().trim();

    // 1. Remove convites anteriores pendentes para o mesmo e-mail para evitar duplicidade
    await supabaseAdmin
      .from("invites")
      .delete()
      .eq("email", cleanEmail)
      .is("accepted_at", null);

    // 2. Cria o convite com token único
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("invites")
      .insert({
        email: cleanEmail,
        role: "admin",
        created_by: context.userId,
      })
      .select("token")
      .single();

    if (inviteError || !invite) {
      console.error("[inviteTeamMember] Erro ao criar convite:", inviteError);
      throw new Error(inviteError?.message || "Erro ao registrar convite.");
    }

    const baseUrl =
      data.origin || process.env.PUBLIC_BASE_URL || "http://localhost:8080";
    const link = `${baseUrl}/accept-invite/${invite.token}`;

    // 3. Dispara o envio de e-mail usando o Supabase Auth (utiliza o SMTP configurado no Supabase)
    let emailSent = false;
    let warningMessage: string | null = null;

    try {
      const { error: authInviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
          redirectTo: link,
          data: {
            invite_token: invite.token,
          },
        });

      if (authInviteError) {
        console.warn(
          "[inviteTeamMember] Aviso ao enviar convite via Supabase Auth:",
          authInviteError.message
        );
        if (
          authInviteError.message.toLowerCase().includes("already") &&
          authInviteError.message.toLowerCase().includes("registered")
        ) {
          warningMessage = "Este usuário já possui conta cadastrada.";
        } else {
          warningMessage = authInviteError.message;
        }
      } else {
        emailSent = true;
      }
    } catch (err: any) {
      console.warn("[inviteTeamMember] Falha no disparo de e-mail via Supabase:", err);
      warningMessage = err?.message || "Erro ao disparar e-mail.";
    }

    return {
      ok: true,
      emailSent,
      warningMessage,
      link,
    };
  });

