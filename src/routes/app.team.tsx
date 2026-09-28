import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  listTeamMembers,
  removeTeamMember,
  inviteTeamMember,
  getNetworkOrigin,
  createTeamMemberDirectly,
  activateInviteDirectly,
  type TeamMember,
} from "@/lib/team.functions";
import { toast } from "sonner";
import {
  Copy,
  Trash2,
  Mail,
  ShieldCheck,
  UserCheck,
  RefreshCw,
  Globe,
  KeyRound,
  UserPlus,
  Check,
} from "lucide-react";
import { Field } from "./auth.sign-in";

export const Route = createFileRoute("/app/team")({
  component: TeamPage,
});

type Invite = {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
};

function inviteUrl(token: string, baseOrigin?: string) {
  const origin = baseOrigin || window.location.origin;
  return `${origin}/accept-invite/${token}`;
}

function TeamPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const listMembersFn = useServerFn(listTeamMembers);
  const removeMemberFn = useServerFn(removeTeamMember);
  const getNetworkOriginFn = useServerFn(getNetworkOrigin);

  const networkOriginQ = useQuery({
    queryKey: ["network-origin"],
    queryFn: async () => {
      try {
        const res = await getNetworkOriginFn({});
        return res || window.location.origin;
      } catch {
        return window.location.origin;
      }
    },
    staleTime: 60000,
  });

  const membersQuery = useQuery({
    queryKey: ["members"],
    queryFn: async (): Promise<TeamMember[]> => {
      try {
        // Tenta buscar via server function (retorna e-mails reais do Supabase Auth e papéis)
        const serverMembers = await listMembersFn({});
        if (serverMembers && serverMembers.length > 0) {
          return serverMembers;
        }
      } catch (err) {
        console.warn("[TeamPage] Fallback para consulta direta de profiles:", err);
      }

      // Fallback resiliente no cliente: consulta profiles diretamente (onde RLS permite SELECT)
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, created_at");

      if (error) throw error;

      return (profiles ?? []).map((p: any) => {
        const isSelf = p.id === currentUser?.id;
        return {
          user_id: p.id,
          email: isSelf ? (currentUser?.email ?? "") : "",
          display_name:
            p.display_name ||
            (isSelf ? currentUser?.email?.split("@")[0] : null) ||
            "Sem nome",
          avatar_url: p.avatar_url ?? null,
          role: (p.role === "admin" ? "admin" : "member") as "admin" | "member",
          created_at: p.created_at || new Date().toISOString(),
          last_sign_in_at: null,
        };
      });
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, token, expires_at, accepted_at")
        .is("accepted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data ?? [];
    },
  });

  async function removeUser(userId: string, memberName: string) {
    if (userId === currentUser?.id) {
      toast.error("Você não pode remover a si mesmo da equipe.");
      return;
    }

    if (
      !confirm(
        `Remover "${memberName}" da equipe? Esta ação revogará todo o acesso ao sistema.`
      )
    ) {
      return;
    }

    try {
      await removeMemberFn({ data: { userId } });
      toast.success("Usuário removido da equipe.");
      qc.invalidateQueries({ queryKey: ["members"] });
    } catch (err: any) {
      console.error("Erro ao remover usuário:", err);
      toast.error(err?.message || "Erro ao remover usuário.");
    }
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase.from("invites").delete().eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Convite revogado.");
    qc.invalidateQueries({ queryKey: ["invites"] });
  }

  const activateInviteFn = useServerFn(activateInviteDirectly);
  const [activatingInviteId, setActivatingInviteId] = useState<string | null>(null);
  const [activationPassword, setActivationPassword] = useState("Senha123*");
  const [activatingBusy, setActivatingBusy] = useState(false);

  async function handleConfirmActivate(inviteId: string) {
    if (activationPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setActivatingBusy(true);
    try {
      const res = await activateInviteFn({
        data: {
          inviteId,
          password: activationPassword,
        },
      });
      toast.success(`Conta de ${res.email} ativada com sucesso! Senha configurada.`);
      setActivatingInviteId(null);
      qc.invalidateQueries({ queryKey: ["invites"] });
      qc.invalidateQueries({ queryKey: ["members"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao ativar convite.");
    } finally {
      setActivatingBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <span className="via-label">Equipe</span>
        <h1 className="mt-1 text-3xl">Usuários e Membros</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie os membros com acesso ao sistema. Todos os usuários têm
          acesso completo às instâncias e análises.
        </p>
      </header>

      <InviteForm />

      <section className="via-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">Membros da equipe</h2>
            {membersQuery.data && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-mono">
                {membersQuery.data.length}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => membersQuery.refetch()}
            disabled={membersQuery.isFetching}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw
              size={13}
              className={membersQuery.isFetching ? "animate-spin" : ""}
            />
            <span>Atualizar</span>
          </button>
        </div>

        {membersQuery.isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Carregando membros da equipe…
          </div>
        ) : !membersQuery.data?.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum usuário cadastrado.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {membersQuery.data.map((m) => {
              const isSelf = m.user_id === currentUser?.id;
              const initials = (m.display_name || m.email || "U")
                .trim()
                .slice(0, 2)
                .toUpperCase();

              return (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between py-3.5 gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar / Iniciais */}
                    <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm select-none">
                      {m.avatar_url ? (
                        <img
                          src={m.avatar_url}
                          alt={m.display_name ?? ""}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        initials
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground truncate">
                          {m.display_name ?? "Sem nome"}
                        </span>

                        {isSelf && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/15 text-primary font-medium">
                            Você
                          </span>
                        )}

                        <span
                          className={`text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1 font-semibold transition-colors ${
                            m.role === "admin"
                              ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-600/30 dark:border-amber-400/30 shadow-xs"
                              : "bg-secondary text-muted-foreground border border-border"
                          }`}
                        >
                          {m.role === "admin" ? (
                            <>
                              <ShieldCheck size={12} className="text-amber-600 dark:text-amber-400" />
                              Administrador
                            </>
                          ) : (
                            <>
                              <UserCheck size={12} />
                              Membro
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground truncate">
                        {m.email ? (
                          <span className="truncate">{m.email}</span>
                        ) : (
                          <span className="font-mono text-[11px]">
                            ID: {m.user_id.slice(0, 8)}…
                          </span>
                        )}

                        {m.created_at && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="text-[11px] opacity-75">
                              Desde{" "}
                              {new Date(m.created_at).toLocaleDateString(
                                "pt-BR"
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ação de remover */}
                  <div>
                    {isSelf ? (
                      <span className="text-xs text-muted-foreground italic px-2 py-1 select-none">
                        Sua conta
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          removeUser(m.user_id, m.display_name || m.email)
                        }
                        className="p-2 text-muted-foreground hover:text-[color:var(--via-danger)] hover:bg-[color:var(--via-danger)]/10 rounded-md transition-colors"
                        title="Remover usuário da equipe"
                        aria-label="Remover"
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

      <section className="via-card">
        <h2 className="text-lg font-medium mb-4">Convites pendentes</h2>

        {invitesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando convites…</p>
        ) : !invitesQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">
            Sem convites pendentes.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {invitesQuery.data.map((i) => (
              <li
                key={i.id}
                className="py-3"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail
                      size={14}
                      className="text-muted-foreground shrink-0"
                    />

                    <div className="min-w-0">
                      <div className="text-sm truncate font-medium">{i.email}</div>

                      <div className="text-xs text-muted-foreground">
                        Expira em{" "}
                        {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteUrl(i.token, networkOriginQ.data));
                        toast.success("Link do convite copiado!");
                      }}
                      className="via-btn via-btn-secondary via-btn-sm text-xs"
                      title="Copiar link completo de aceite"
                    >
                      <Copy size={12} /> Copiar link
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(i.token);
                        toast.success("Código do convite copiado!");
                      }}
                      className="via-btn via-btn-secondary via-btn-sm text-xs"
                      title="Copiar apenas o código do convite"
                    >
                      Código
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActivatingInviteId(activatingInviteId === i.id ? null : i.id);
                        setActivationPassword("Senha123*");
                      }}
                      className="via-btn via-btn-secondary via-btn-sm text-xs text-primary font-medium"
                      title="Ativar conta imediatamente sem depender de link de e-mail"
                    >
                      <KeyRound size={12} /> Ativar agora
                    </button>

                    <button
                      type="button"
                      onClick={() => revokeInvite(i.id)}
                      className="p-1.5 text-muted-foreground hover:text-[color:var(--via-danger)] hover:bg-[color:var(--via-danger)]/10 rounded-md transition-colors"
                      title="Revogar convite"
                      aria-label="Revogar"
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>

                {activatingInviteId === i.id && (
                  <div className="mt-3 p-3 rounded-lg bg-secondary/60 border border-border space-y-2">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <KeyRound size={13} className="text-primary" />
                      Ativação Imediata da Conta ({i.email})
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Defina uma senha de acesso. O usuário será ativado instantaneamente e poderá logar imediatamente por e-mail e senha.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 items-center pt-1">
                      <input
                        type="text"
                        value={activationPassword}
                        onChange={(e) => setActivationPassword(e.target.value)}
                        placeholder="Senha de acesso (mínimo 6 caracteres)"
                        className="via-input text-xs w-full font-mono py-1.5"
                      />
                      <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-end">
                        <button
                          type="button"
                          onClick={() => handleConfirmActivate(i.id)}
                          disabled={activatingBusy}
                          className="via-btn via-btn-primary via-btn-sm text-xs whitespace-nowrap"
                        >
                          {activatingBusy ? "Ativando…" : "Confirmar e Ativar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivatingInviteId(null)}
                          className="via-btn via-btn-secondary via-btn-sm text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InviteForm() {
  const qc = useQueryClient();
  const inviteMemberFn = useServerFn(inviteTeamMember);
  const createDirectFn = useServerFn(createTeamMemberDirectly);

  const [tab, setTab] = useState<"invite" | "direct">("invite");

  // Invite state
  const [email, setEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  // Direct state
  const [name, setName] = useState("");
  const [directEmail, setDirectEmail] = useState("");
  const [password, setPassword] = useState("Senha123*");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [directLoading, setDirectLoading] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    pass: string;
    role: string;
  } | null>(null);

  async function handleInviteSubmit(e: FormEvent) {
    e.preventDefault();
    setInviteLoading(true);

    try {
      const cleanEmail = email.toLowerCase().trim();
      const origin = window.location.origin;

      const res = await inviteMemberFn({
        data: {
          email: cleanEmail,
          origin,
        },
      });

      // Copia o link para a área de transferência por garantia
      if (res?.link) {
        try {
          await navigator.clipboard.writeText(res.link);
        } catch {
          // ignora caso o navegador bloqueie acesso ao clipboard
        }
      }

      if (res?.emailSent) {
        toast.success("Convite criado e enviado por e-mail!");
      } else if (res?.warningMessage) {
        toast.warning(
          `Convite criado! ${res.warningMessage} O link foi copiado para a área de transferência.`
        );
      } else {
        toast.success(
          "Convite criado! O link de acesso foi copiado para a área de transferência."
        );
      }

      setEmail("");
      qc.invalidateQueries({ queryKey: ["invites"] });
    } catch (error: any) {
      console.error("Erro inesperado:", error);
      toast.error(error?.message || "Ocorreu um erro inesperado ao processar convite.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleDirectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!directEmail || !name || !password) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setDirectLoading(true);

    try {
      await createDirectFn({
        data: {
          name: name.trim(),
          email: directEmail.toLowerCase().trim(),
          password,
          role,
        },
      });

      setCreatedCredentials({
        email: directEmail.toLowerCase().trim(),
        pass: password,
        role: role === "admin" ? "Administrador" : "Membro",
      });

      toast.success("Membro cadastrado e ativado com sucesso!");
      setName("");
      setDirectEmail("");
      setPassword("Senha123*");
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["invites"] });
    } catch (err: any) {
      console.error("Erro ao cadastrar membro diretamente:", err);
      toast.error(err?.message || "Erro ao cadastrar membro.");
    } finally {
      setDirectLoading(false);
    }
  }

  return (
    <div className="via-card space-y-4">
      {/* Abas */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setTab("invite")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
            tab === "invite"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          <Mail size={13} />
          Convidar por E-mail / Link
        </button>

        <button
          type="button"
          onClick={() => setTab("direct")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
            tab === "direct"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          <UserPlus size={13} />
          Cadastrar Imediatamente (Sem E-mail)
        </button>
      </div>

      {tab === "invite" ? (
        <form
          onSubmit={handleInviteSubmit}
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Field
              label="Convidar novo membro por e-mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="ex: colega@empresa.com"
              required
            />

            <p className="mt-1 text-xs text-muted-foreground">
              O convite é enviado por e-mail e o link exclusivo é copiado automaticamente para compartilhamento manual.
            </p>
          </div>

          <button
            type="submit"
            disabled={inviteLoading}
            className="via-btn via-btn-primary shrink-0"
          >
            {inviteLoading ? "Enviando…" : "Convidar"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleDirectSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Field
              label="Nome Completo"
              type="text"
              value={name}
              onChange={setName}
              placeholder="ex: João Silva"
              required
            />
            <Field
              label="E-mail de Login"
              type="email"
              value={directEmail}
              onChange={setDirectEmail}
              placeholder="ex: joao@empresa.com"
              required
            />
            <Field
              label="Senha Inicial"
              type="text"
              value={password}
              onChange={setPassword}
              placeholder="Senha de acesso"
              required
            />
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Papel na Equipe
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "member" | "admin")}
                className="via-input text-xs w-full py-2"
              >
                <option value="member">Membro</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              O membro é ativado imediatamente na base de dados, sem depender de SMTP ou validação de links por e-mail.
            </p>
            <button
              type="submit"
              disabled={directLoading}
              className="via-btn via-btn-primary shrink-0 text-xs"
            >
              {directLoading ? "Cadastrando…" : "Cadastrar Membro Agora"}
            </button>
          </div>

          {createdCredentials && (
            <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5 text-primary">
                  <Check size={14} /> Membro cadastrado com sucesso!
                </div>
                <div className="text-muted-foreground font-mono text-[11px]">
                  E-mail: <strong className="text-foreground">{createdCredentials.email}</strong> | Senha: <strong className="text-foreground">{createdCredentials.pass}</strong> ({createdCredentials.role})
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Acesso ao Treinador de Vendas:\nE-mail: ${createdCredentials.email}\nSenha: ${createdCredentials.pass}\nURL: ${window.location.origin}/auth/sign-in`
                  );
                  toast.success("Credenciais copiadas!");
                }}
                className="via-btn via-btn-secondary via-btn-sm text-xs shrink-0"
              >
                <Copy size={12} /> Copiar Credenciais
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}