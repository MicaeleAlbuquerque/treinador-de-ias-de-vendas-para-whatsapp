import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Trash2, Mail } from "lucide-react";
import { Field } from "./auth.sign-in";
import {
  getTeamMembers,
  getTeamInvites,
  createTeamInvite,
  revokeTeamInvite,
  removeTeamMember,
} from "@/lib/team.functions";

export const Route = createFileRoute("/app/team")({ component: TeamPage });

type Member = { user_id: string; display_name: string | null };
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
  const getMembersFn = useServerFn(getTeamMembers);
  const getInvitesFn = useServerFn(getTeamInvites);
  const revokeInviteFn = useServerFn(revokeTeamInvite);
  const removeUserFn = useServerFn(removeTeamMember);

  const membersQuery = useQuery({
    queryKey: ["members"],
    queryFn: async (): Promise<Member[]> => {
      const data = await getMembersFn({});
      return data ?? [];
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: async (): Promise<Invite[]> => {
      const data = await getInvitesFn({});
      return data ?? [];
    },
  });

  async function removeUser(userId: string) {
    if (!confirm("Remover este usuário do sistema?")) return;
    try {
      await removeUserFn({ data: { userId } });
      toast.success("Usuário removido.");
      qc.invalidateQueries({ queryKey: ["members"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function revokeInvite(id: string) {
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
      <header>
        <span className="via-label">Equipe</span>
        <h1 className="mt-1 text-3xl">Usuários</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todos os usuários cadastrados têm acesso completo ao sistema. Esta é uma ferramenta interna single-tenant.
        </p>
      </header>

      <InviteForm />

      <section className="via-card">
        <h2 className="text-lg mb-4">Membros</h2>
        {membersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !membersQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {membersQuery.data.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-bold text-sm">{m.display_name ?? "Sem nome"}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {m.user_id.slice(0, 8)}…
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeUser(m.user_id)}
                  className="text-muted-foreground hover:text-[color:var(--via-danger)]"
                  aria-label="Remover"
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="via-card">
        <h2 className="text-lg mb-4">Convites pendentes</h2>
        {invitesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !invitesQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">Sem convites pendentes.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invitesQuery.data.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-3 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Mail size={14} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm truncate">{i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      expira {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl(i.token));
                      toast.success("Link copiado.");
                    }}
                    className="via-btn via-btn-secondary via-btn-sm"
                  >
                    <Copy size={12} /> Copiar link
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeInvite(i.id)}
                    className="text-muted-foreground hover:text-[color:var(--via-danger)]"
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
  const createInviteFn = useServerFn(createTeamInvite);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await createInviteFn({
        data: { email: email.toLowerCase().trim() },
      });
      setEmail("");
      await navigator.clipboard.writeText(inviteUrl(data.token));
      toast.success("Convite criado e link copiado.");
      qc.invalidateQueries({ queryKey: ["invites"] });
    } catch (error) {
      toast.error((error as Error).message);
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
          label="E-mail do convidado"
          type="email"
          value={email}
          onChange={setEmail}
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Acesso completo (admin). Sem papéis distintos nesta versão.
        </p>
      </div>
      <button type="submit" disabled={loading} className="via-btn via-btn-primary">
        {loading ? "Convidando…" : "Convidar"}
      </button>
    </form>
  );
}
