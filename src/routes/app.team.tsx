import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Trash2, Mail } from "lucide-react";
import { Field } from "./auth.sign-in";

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

  const membersQuery = useQuery({
    queryKey: ["members"],
    queryFn: async (): Promise<Member[]> => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id");
      if (error) throw error;
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, display_name").in("id", ids)
        : { data: [] as { id: string; display_name: string | null }[] };
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
      return ids.map((user_id) => ({
        user_id,
        display_name: nameById.get(user_id) ?? null,
      }));
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

  async function removeUser(userId: string) {
    if (!confirm("Remover este usuário do sistema?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Usuário removido.");
    qc.invalidateQueries({ queryKey: ["members"] });
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase.from("invites").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["invites"] });
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
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("invites")
      .insert({
        email: email.toLowerCase().trim(),
        role: "admin",
        created_by: userData.user!.id,
      })
      .select("token")
      .single();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEmail("");
    await navigator.clipboard.writeText(inviteUrl(data.token));
    toast.success("Convite criado e link copiado.");
    qc.invalidateQueries({ queryKey: ["invites"] });
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
