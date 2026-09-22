import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  Trash2,
  Mail,
  ShieldCheck,
  ShieldAlert,
  User,
  AlertTriangle,
  Info,
  Check,
} from "lucide-react";
import { Field } from "./auth.sign-in";
import { useAuth } from "@/lib/auth-context";
import { useMyRole } from "@/lib/user-role";
import {
  getTeamMembers,
  getTeamInvites,
  createTeamInvite,
  revokeTeamInvite,
  removeTeamMember,
  updateTeamMemberRole,
  type TeamMember,
  type TeamInvite,
} from "@/lib/team.functions";

export const Route = createFileRoute("/app/team")({ component: TeamPage });

function inviteUrl(token: string) {
  return `${window.location.origin}/accept-invite/${token}`;
}

function TeamPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { role: myRole, loading: roleLoading } = useMyRole();
  const isAdmin = myRole === "admin";
  const currentUserId = user?.id;

  const getMembersFn = useServerFn(getTeamMembers);
  const getInvitesFn = useServerFn(getTeamInvites);
  const revokeInviteFn = useServerFn(revokeTeamInvite);
  const removeUserFn = useServerFn(removeTeamMember);
  const updateRoleFn = useServerFn(updateTeamMemberRole);

  const [actingUserId, setActingUserId] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ["members"],
    queryFn: async (): Promise<TeamMember[]> => {
      const data = await getMembersFn({});
      return data ?? [];
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: async (): Promise<TeamInvite[]> => {
      const data = await getInvitesFn({});
      return data ?? [];
    },
  });

  const members = membersQuery.data ?? [];
  const activeAdminsCount = members.filter((m) => m.role === "admin").length;

  async function handleUpdateRole(userId: string, newRole: "admin" | "member", userName: string) {
    if (newRole === "member" && activeAdminsCount <= 1) {
      toast.error(
        "Não é possível rebaixar o último admin ativo da instância. Promova outro membro antes para evitar lockout.",
      );
      return;
    }

    const actionText =
      newRole === "admin"
        ? `Promover "${userName}" a Administrador? Ele terá acesso total às configurações e gestão de equipe.`
        : `Rebaixar "${userName}" a Membro? Ele perderá as permissões administrativas e acesso a configurações.`;

    if (!confirm(actionText)) return;

    setActingUserId(userId);
    try {
      await updateRoleFn({ data: { userId, role: newRole } });
      toast.success(
        newRole === "admin"
          ? `"${userName}" agora é Administrador.`
          : `"${userName}" rebaixado para Membro.`,
      );
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["my-role"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActingUserId(null);
    }
  }

  async function handleRemoveUser(userId: string, userName: string, isTargetAdmin: boolean) {
    if (userId === currentUserId) {
      toast.error("Você não pode remover seu próprio usuário.");
      return;
    }

    if (isTargetAdmin && activeAdminsCount <= 1) {
      toast.error(
        "Não é possível remover o último admin ativo da instância. Promova outro usuário antes para evitar lockout.",
      );
      return;
    }

    const confirmed = confirm(
      `Tem certeza que deseja remover o usuário "${userName}" da equipe?\n\nO acesso será revogado permanentemente e ele não conseguirá mais entrar no sistema.`,
    );
    if (!confirmed) return;

    setActingUserId(userId);
    try {
      await removeUserFn({ data: { userId } });
      toast.success(`Usuário "${userName}" removido com sucesso.`);
      qc.invalidateQueries({ queryKey: ["members"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActingUserId(null);
    }
  }

  async function revokeInvite(id: string, email: string) {
    if (!confirm(`Revogar o convite para "${email}"?`)) return;
    try {
      await revokeInviteFn({ data: { id } });
      toast.success("Convite revogado.");
      qc.invalidateQueries({ queryKey: ["invites"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Cabeçalho */}
      <header className="space-y-1">
        <span className="via-label">Equipe e Permissões</span>
        <h1 className="text-3xl font-bold tracking-tight">Usuários e Acessos</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Gerencie os membros da equipe e atribua as funções adequadas. Administradores têm controle total sobre
          configurações e convites, enquanto membros utilizam os módulos de vendas, DNA e conversas.
        </p>
      </header>

      {/* Formulário de convite (Apenas Admins) */}
      {isAdmin ? (
        <InviteForm />
      ) : (
        <div className="via-card border-dashed flex items-center gap-3 text-sm text-muted-foreground py-4">
          <Info size={18} className="text-muted-foreground shrink-0" />
          <span>Apenas administradores podem enviar convites para novos membros da equipe.</span>
        </div>
      )}

      {/* Alerta de Proteção contra Lockout */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-50/60 dark:bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 text-amber-900 dark:text-amber-200">
          <div className="font-semibold">Regra de Proteção contra Lockout</div>
          <p className="text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
            O sistema bloqueia expressamente a remoção ou o rebaixamento do{" "}
            <strong>último admin ativo ({activeAdminsCount} admin{activeAdminsCount === 1 ? "" : "s"} no momento)</strong>.
            Isso garante que a instância nunca fique órfã ou inacessível. Para rebaixar um admin único, promova outro membro antes.
          </p>
        </div>
      </div>

      {/* Seção de Membros */}
      <section className="via-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Membros da Equipe</h2>
            <p className="text-xs text-muted-foreground">
              {members.length} {members.length === 1 ? "usuário cadastrado" : "usuários cadastrados"} (
              {activeAdminsCount} admin{activeAdminsCount === 1 ? "" : "s"} e {members.length - activeAdminsCount} membro{members.length - activeAdminsCount === 1 ? "" : "s"})
            </p>
          </div>
        </div>

        {membersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando membros…</p>
        ) : !members.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum usuário cadastrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const isMe = m.user_id === currentUserId;
              const isThisAdmin = m.role === "admin";
              const isLastAdmin = isThisAdmin && activeAdminsCount <= 1;
              const isActing = actingUserId === m.user_id;

              return (
                <li
                  key={m.user_id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-3"
                >
                  {/* Informações do usuário */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ${
                        isThisAdmin
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                          : "bg-secondary text-secondary-foreground border border-border"
                      }`}
                    >
                      {isThisAdmin ? (
                        <ShieldCheck size={18} />
                      ) : (
                        <User size={18} className="text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">
                          {m.display_name || m.email || "Sem nome"}
                        </span>

                        {/* Badge de Função */}
                        {isThisAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-100/80 px-2 py-0.5 text-[11px] font-semibold text-purple-800 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                            <ShieldCheck size={12} /> Administrador
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <User size={12} /> Membro
                          </span>
                        )}

                        {isMe && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
                            Você
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground truncate mt-0.5">
                        <span className="truncate">{m.email}</span>
                        {m.display_name && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[11px] opacity-75">{m.user_id.slice(0, 8)}…</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações administrativas */}
                  {isAdmin && (
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {/* Promover ou Rebaixar */}
                      {m.role === "member" ? (
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() =>
                            handleUpdateRole(
                              m.user_id,
                              "admin",
                              m.display_name || m.email || "Membro",
                            )
                          }
                          className="via-btn via-btn-secondary via-btn-sm inline-flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 hover:border-purple-300"
                          title="Conceder permissões administrativas completas"
                        >
                          <ShieldCheck size={13} className="text-purple-600 dark:text-purple-400" />
                          Promover a Admin
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isActing || isLastAdmin}
                          onClick={() =>
                            handleUpdateRole(
                              m.user_id,
                              "member",
                              m.display_name || m.email || "Administrador",
                            )
                          }
                          className={`via-btn via-btn-secondary via-btn-sm inline-flex items-center gap-1.5 text-xs ${
                            isLastAdmin ? "opacity-50 cursor-not-allowed" : "hover:text-foreground"
                          }`}
                          title={
                            isLastAdmin
                              ? "Bloqueado: este é o único admin ativo. Promova outro antes de rebaixar."
                              : "Remover permissões administrativas e tornar membro regular"
                          }
                        >
                          <ShieldAlert size={13} className="text-amber-600" />
                          Rebaixar a Membro
                        </button>
                      )}

                      {/* Remover usuário */}
                      <button
                        type="button"
                        disabled={isActing || isMe || isLastAdmin}
                        onClick={() =>
                          handleRemoveUser(
                            m.user_id,
                            m.display_name || m.email || "Usuário",
                            isThisAdmin,
                          )
                        }
                        className={`p-1.5 rounded text-muted-foreground transition-colors ${
                          isMe || isLastAdmin
                            ? "opacity-30 cursor-not-allowed"
                            : "hover:text-[color:var(--via-danger)] hover:bg-destructive/10"
                        }`}
                        title={
                          isMe
                            ? "Você não pode remover seu próprio usuário."
                            : isLastAdmin
                            ? "Bloqueado: não é possível remover o último admin ativo."
                            : "Revogar acesso e remover usuário definitivamente"
                        }
                        aria-label="Remover usuário"
                      >
                        <Trash2 size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Seção de Convites Pendentes */}
      <section className="via-card">
        <h2 className="text-lg font-semibold mb-1">Convites Pendentes</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Convites gerados para novos membros. O acesso é criado assim que o convidado aceitar o link.
        </p>

        {invitesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando convites…</p>
        ) : !invitesQuery.data?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum convite pendente no momento.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invitesQuery.data.map((i) => {
              const isInvAdmin = i.role === "admin";
              return (
                <li
                  key={i.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Mail size={16} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{i.email}</span>
                        {isInvAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-100/70 px-2 py-0.2 text-[10px] font-semibold text-purple-800 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300">
                            <ShieldCheck size={11} /> Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.2 text-[10px] font-medium text-muted-foreground">
                            <User size={11} /> Membro
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Expira em {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteUrl(i.token));
                        toast.success("Link de convite copiado para a área de transferência!");
                      }}
                      className="via-btn via-btn-secondary via-btn-sm inline-flex items-center gap-1.5"
                    >
                      <Copy size={12} /> Copiar link
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => revokeInvite(i.id, i.email)}
                        className="p-1.5 rounded text-muted-foreground hover:text-[color:var(--via-danger)] hover:bg-destructive/10 transition-colors"
                        title="Revogar convite"
                        aria-label="Revogar convite"
                      >
                        <Trash2 size={16} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function InviteForm() {
  const qc = useQueryClient();
  const createInviteFn = useServerFn(createTeamInvite);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const data = await createInviteFn({
        data: {
          email: email.toLowerCase().trim(),
          role,
        },
      });
      setEmail("");
      await navigator.clipboard.writeText(inviteUrl(data.token));
      toast.success(
        `Convite criado com sucesso para papel ${
          role === "admin" ? "Administrador" : "Membro"
        }! Link copiado.`,
      );
      qc.invalidateQueries({ queryKey: ["invites"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="via-card space-y-4">
      <div>
        <h2 className="text-base font-semibold">Convidar Novo Usuário</h2>
        <p className="text-xs text-muted-foreground">
          Envie o link de convite para que novos integrantes criem conta com a função designada.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
        {/* E-mail */}
        <div className="sm:col-span-6">
          <Field
            label="E-mail do convidado"
            type="email"
            value={email}
            onChange={setEmail}
            required
          />
        </div>

        {/* Seletor de Função */}
        <div className="sm:col-span-4 space-y-1">
          <label className="text-xs font-medium text-foreground">Função de acesso</label>
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg border border-border bg-secondary/50">
            <button
              type="button"
              onClick={() => setRole("member")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                role === "member"
                  ? "bg-card text-foreground shadow-sm font-semibold border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User size={13} />
              Membro
            </button>
            <button
              type="button"
              onClick={() => setRole("admin")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                role === "admin"
                  ? "bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 shadow-sm font-semibold border border-purple-200 dark:border-purple-800"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldCheck size={13} className={role === "admin" ? "text-purple-600 dark:text-purple-400" : ""} />
              Admin
            </button>
          </div>
        </div>

        {/* Botão de Envio */}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="via-btn via-btn-primary w-full h-[38px] justify-center"
          >
            {loading ? "Criando…" : "Convidar"}
          </button>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        {role === "admin" ? (
          <span className="text-purple-700 dark:text-purple-300 font-medium">
            ★ Administrador: Acesso total a convites, remoção de membros e configurações da empresa.
          </span>
        ) : (
          <span>
            • Membro: Acesso para operar conversas, visualizar análises de IA, coaching e prompts.
          </span>
        )}
      </div>
    </form>
  );
}
