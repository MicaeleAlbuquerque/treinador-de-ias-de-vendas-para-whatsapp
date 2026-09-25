import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TeamMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url?: string | null;
  role: "admin" | "member";
  created_at?: string;
  last_sign_in_at?: string | null;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: "admin" | "member";
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at?: string;
};

/**
 * Valida se o usuário autenticado atual é um administrador ativo.
 */
async function assertAdmin(userId: string) {
  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) throw new Error("Erro ao verificar permissões de usuário.");
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) {
    throw new Error("Acesso negado: apenas administradores podem realizar esta ação.");
  }
}

/**
 * Lista os membros da equipe unindo auth.users, profiles e user_roles
 */
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
    } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

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
    const members: TeamMember[] = (users ?? []).map((u) => {
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

    members.sort((a, b) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (a.role !== "admin" && b.role === "admin") return 1;
      const nameA = a.display_name || a.email;
      const nameB = b.display_name || b.email;
      return nameA.localeCompare(nameB);
    });

    return members;
  });

/**
 * Retorna todos os membros do time (compatibilidade com chamadas getTeamMembers).
 */
export const getTeamMembers = listTeamMembers;

/**
 * Lista os convites pendentes incluindo a função atribuída.
 */
export const getTeamInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamInvite[]> => {
    const { data, error } = await supabaseAdmin
      .from("invites")
      .select("id, email, role, token, expires_at, accepted_at, created_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((inv) => ({
      ...inv,
      role: (inv.role as "admin" | "member") || "member",
    }));
  });

/**
 * Cria convite com função customizável (admin ou member). Apenas admins.
 */
export const createTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; role?: "admin" | "member" }) =>
    z
      .object({
        email: z.string().email(),
        role: z.enum(["admin", "member"]).default("member"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const emailClean = data.email.toLowerCase().trim();
    const role = data.role ?? "member";

    const { data: inserted, error } = await supabaseAdmin
      .from("invites")
      .insert({
        email: emailClean,
        role,
        created_by: context.userId,
      })
      .select("token, id, role")
      .single();

    if (error || !inserted) {
      throw new Error(error?.message ?? "Falha ao criar convite.");
    }
    return { token: inserted.token, id: inserted.id, role: inserted.role };
  });

/**
 * Revoga convite pendente. Apenas admins.
 */
export const revokeTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("invites")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Atualiza a função do usuário (Promover a Admin ou Rebaixar a Membro).
 * Aplica regra de proteção de lockout para impedir que o último admin seja rebaixado.
 */
export const updateTeamMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; role: "admin" | "member" }) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "member"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Se estiver tentando rebaixar para "member", checa se o alvo é admin atualmente
    if (data.role === "member") {
      const { data: targetRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .eq("role", "admin");

      const isTargetAdmin = (targetRoles ?? []).length > 0;

      if (isTargetAdmin) {
        // Conta quantos admins ativos existem
        const { count: adminCount, error: countErr } = await supabaseAdmin
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin");

        if (countErr) throw new Error("Erro ao validar administradores ativos.");

        if ((adminCount ?? 0) <= 1) {
          throw new Error(
            "Não é possível rebaixar o último admin ativo da instância. Para rebaixar este admin, promova outro usuário antes para evitar o bloqueio (lockout) do sistema.",
          );
        }
      }
    }

    // 1. Atualiza user_roles
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);

    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: data.userId,
        role: data.role,
      });

    if (insErr) throw new Error(`Falha ao atualizar papel do usuário: ${insErr.message}`);

    // 2. Sincroniza tabela profiles
    await (supabaseAdmin.from("profiles") as any)
      .update({ role: data.role === "admin" ? "admin" : "user" })
      .eq("id", data.userId);

    return { ok: true, role: data.role };
  });

/**
 * Remove usuário e revoga o acesso permanentemente (exclui de auth.users).
 * Aplica regra de proteção de lockout para impedir a remoção do último admin ativo.
 */
export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!context.userId) {
      throw new Error("Não autenticado.");
    }

    await assertAdmin(context.userId);

    if (data.userId === context.userId) {
      throw new Error("Você não pode remover seu próprio usuário da equipe.");
    }

    // Checa se o usuário a ser removido é um admin ativo
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId)
      .eq("role", "admin");

    const isTargetAdmin = (targetRoles ?? []).length > 0;

    if (isTargetAdmin) {
      const { count: adminCount, error: countErr } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if (countErr) throw new Error("Erro ao validar administradores ativos.");

      if ((adminCount ?? 0) <= 1) {
        throw new Error(
          "Não é possível remover o último admin ativo da instância. Para remover este admin, promova outro usuário antes para evitar o bloqueio (lockout) do sistema.",
        );
      }
    }

    // 1. Remove papéis
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);

    // 2. Remove perfil
    await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", data.userId);

    // 3. Deleta da autenticação do Supabase (revoga tokens e impede login definitivamente)
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
      if (error) {
        console.error("[removeTeamMember] Erro ao deletar auth user:", error);
        throw new Error(error.message);
      }
    } catch (authErr: any) {
      console.warn("[removeTeamMember] Erro ao deletar auth user:", authErr);
      throw new Error(authErr?.message || "Falha ao remover usuário de autenticação.");
    }

    return { ok: true };
  });

/**
 * Cria convite de equipe e dispara o e-mail pelo Supabase Auth (usando o SMTP configurado no Supabase)
 */
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; origin?: string }) =>
    z
      .object({
        email: z.string().email(),
        origin: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!context.userId) {
      throw new Error("Não autenticado.");
    }

    await assertAdmin(context.userId);

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
          authInviteError.message,
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
