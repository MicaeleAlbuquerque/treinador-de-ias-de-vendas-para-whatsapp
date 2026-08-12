import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Field } from "./auth.sign-in";

export const Route = createFileRoute("/accept-invite/$token")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  // If already logged in, just call accept_invite.
  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      setBusy(true);
      const { error } = await supabase.rpc("accept_invite", { _token: token });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Convite aceito.");
      navigate({ to: "/app" });
    })();
  }, [loading, user, token, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error: signUpErr } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/accept-invite/${token}`,
        data: { display_name: displayName },
      },
    });
    if (signUpErr) { setBusy(false); toast.error(signUpErr.message); return; }
    // If auto-confirm is on, session is established and useEffect will accept the invite.
    // Otherwise we tell the user.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setBusy(false);
      toast.success("Conta criada. Confirme o e-mail para continuar.");
      return;
    }
    const { error: acceptErr } = await supabase.rpc("accept_invite", { _token: token });
    setBusy(false);
    if (acceptErr) { toast.error(acceptErr.message); return; }
    toast.success("Bem-vindo!");
    navigate({ to: "/app" });
  }

  if (user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <Logo className="h-7 mb-8" />
        <div className="via-card max-w-md text-center">
          <h1 className="text-2xl">Aceitando convite</h1>
          <p className="mt-3 text-sm text-muted-foreground">Aguarde…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <Logo className="h-7 mb-8" />
      <div className="via-card w-full max-w-md">
        <span className="via-label">Convite</span>
        <h1 className="mt-2 text-3xl">Criar acesso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use o mesmo e-mail que recebeu o convite.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Nome" type="text" value={displayName} onChange={setDisplayName} required />
          <Field label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          <Field label="Senha" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />
          <button type="submit" disabled={busy} className="via-btn via-btn-primary w-full">
            {busy ? "Criando…" : "Aceitar convite"}
          </button>
        </form>
        <div className="mt-4 text-xs">
          <Link to="/auth/sign-in" className="text-[color:var(--via-blue)] hover:underline">
            Já tenho conta nesta instância
          </Link>
        </div>
      </div>
    </div>
  );
}
