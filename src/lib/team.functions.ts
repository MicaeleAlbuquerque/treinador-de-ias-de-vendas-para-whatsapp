import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TeamMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "member";
  created_at?: string;
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
 * Retorna todos os membros do time com e-mail, nome e função (Admin ou Membro).
 */
export const getTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamMember[]> => {
    // 1. Busca todas as funções registradas
    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    // 2. Busca todos os usuários cadastrados no auth para obter e-mails
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const authUsers = authData?.users ?? [];
    const emailById = new Map(authUsers.map((u) => [u.id, u.email ?? ""]));
    const createdAtById = new Map(authUsers.map((u) => [u.id, u.created_at]));

    // Mapeia papéis (se tiver 'admin', é 'admin'; senão 'member')
    const roleById = new Map<string, "admin" | "member">();
    for (const r of roles ?? []) {
      if (r.role === "admin") {
        roleById.set(r.user_id, "admin");
      } else if (!roleById.has(r.user_id)) {
        roleById.set(r.user_id, "member");
      }
    }

    // Coleta todos os IDs únicos (de auth e de user_roles)
    const allIds = Array.from(
      new Set([...authUsers.map((u) => u.id), ...(roles ?? []).map((r) => r.user_id)]),
    );

    // 3. Busca perfis
    const { data: profiles } = allIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", allIds)
      : { data: [] as { id: string; display_name: string | null }[] };

    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    const members: TeamMember[] = allIds.map((userId) => {
      const userObj = authUsers.find((u) => u.id === userId);
      const metaName = userObj?.user_metadata?.display_name as string | undefined;
      return {
        user_id: userId,
        email: emailById.get(userId) || userObj?.email || "",
        display_name: nameById.get(userId) || metaName || null,
        role: roleById.get(userId) ?? "member",
        created_at: createdAtById.get(userId),
      };
    });

    // Ordena: administradores primeiro, depois por nome ou e-mail
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
    await assertAdmin(context.userId);

    if (data.userId === context.userId) {
      throw new Error("Você não pode remover seu próprio usuário.");
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
      await supabaseAdmin.auth.admin.deleteUser(data.userId);
    } catch (authErr) {
      console.warn("[removeTeamMember] Aviso ao deletar auth user:", authErr);
    }

    return { ok: true };
  });
