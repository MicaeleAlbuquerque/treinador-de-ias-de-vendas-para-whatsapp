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

function inviteUrl(token: string) {
  return `${window.location.origin}/accept-invite/${token}`;
}

function TeamPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const listMembersFn = useServerFn(listTeamMembers);
  const removeMemberFn = useServerFn(removeTeamMember);

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
                className="flex items-center justify-between py-3 gap-3"
              >
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl(i.token));
                      toast.success("Link do convite copiado!");
                    }}
                    className="via-btn via-btn-secondary via-btn-sm"
                  >
                    <Copy size={12} /> Copiar link
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
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

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
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="via-card flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <Field
          label="Convidar novo membro por e-mail"
          type="email"
          value={email}
          onChange={setEmail}
          required
        />

        <p className="mt-1 text-xs text-muted-foreground">
          O convidado terá acesso administrativo completo. Se o envio de e-mail falhar, o link será copiado automaticamente.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="via-btn via-btn-primary shrink-0"
      >
        {loading ? "Enviando…" : "Convidar"}
      </button>
    </form>
  );
}
