import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Field } from "./auth.sign-in";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

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
  const [acceptingError, setAcceptingError] = useState<string | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);

  const isInvalidToken = !token || token === "null" || token === "undefined" || token.trim() === "";

  // 1. Processa tokens na URL (hash com access_token ou code PKCE do Supabase Auth)
  useEffect(() => {
    let mounted = true;
    async function processHashSession() {
      try {
        if (typeof window === "undefined") return;
        const hashClean = window.location.hash.startsWith("#")
          ? window.location.hash.substring(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hashClean);
        const searchParams = new URLSearchParams(window.location.search);

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? "",
          });
          if (!error && mounted) {
            setSessionResolved(true);
          }
        }

        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && mounted) {
            setSessionResolved(true);
          }
        }
      } catch (err) {
        console.warn("[AcceptInvitePage] Falha ao processar sessão na URL:", err);
      }
    }

    processHashSession();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Se o usuário estiver autenticado (ou após a sessão ser resolvida), aceita o convite via RPC
  useEffect(() => {
    if (loading || !user || isInvalidToken) return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      setAcceptingError(null);
      try {
        const { error } = await supabase.rpc("accept_invite", { _token: token });
        if (cancelled) return;
        setBusy(false);
        if (error) {
          // Se já foi aceito ou expirou, exibe aviso amigável
          console.warn("[AcceptInvitePage] Erro ao aceitar convite:", error);
          if (
            error.message.toLowerCase().includes("accepted") ||
            error.message.toLowerCase().includes("já aceito") ||
            error.message.toLowerCase().includes("already")
          ) {
            toast.info("Este convite já foi aceito anteriormente.");
            navigate({ to: "/app" });
          } else {
            setAcceptingError(error.message);
            toast.error(error.message);
          }
          return;
        }
        toast.success("Convite aceito com sucesso!");
        navigate({ to: "/app" });
      } catch (err: any) {
        if (cancelled) return;
        setBusy(false);
        setAcceptingError(err?.message || "Erro inesperado ao aceitar convite.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, token, isInvalidToken, navigate, sessionResolved]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isInvalidToken) {
      toast.error("Código de convite inválido.");
      return;
    }
    setBusy(true);
    setAcceptingError(null);

    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/accept-invite/${token}`,
          data: { display_name: displayName.trim() },
        },
      });

      if (signUpErr) {
        setBusy(false);
        if (
          signUpErr.message.toLowerCase().includes("already") ||
          signUpErr.message.toLowerCase().includes("registered") ||
          signUpErr.message.toLowerCase().includes("cadastrado")
        ) {
          toast.error("Este e-mail já possui uma conta. Faça login para aceitar o convite.");
          navigate({ to: "/auth/sign-in" });
          return;
        }
        toast.error(signUpErr.message);
        return;
      }

      // Se auto-confirm estiver ativado, a sessão é estabelecida e o useEffect aceitará o convite.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setBusy(false);
        toast.success("Conta criada! Confirme seu e-mail para continuar.");
        return;
      }

      const { error: acceptErr } = await supabase.rpc("accept_invite", { _token: token });
      setBusy(false);
      if (acceptErr) {
        toast.error(acceptErr.message);
        setAcceptingError(acceptErr.message);
        return;
      }
      toast.success("Bem-vindo à equipe!");
      navigate({ to: "/app" });
    } catch (err: any) {
      setBusy(false);
      toast.error(err?.message || "Erro ao processar convite.");
    }
  }

  // Token inválido na URL
  if (isInvalidToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <Logo className="h-7 mb-8" />
        <div className="via-card max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-xl font-bold">Convite não encontrado</h1>
          <p className="text-sm text-muted-foreground">
            O link de convite acessado está incompleto ou inválido. Verifique o link enviado pelo administrador da equipe.
          </p>
          <div className="pt-2">
            <Link to="/auth/sign-in" className="via-btn via-btn-primary w-full block text-center">
              Fazer login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Usuário já autenticado
  if (user) {
    if (acceptingError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
          <Logo className="h-7 mb-8" />
          <div className="via-card max-w-md w-full text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle size={24} />
            </div>
            <h1 className="text-xl font-bold">Aviso sobre o convite</h1>
            <p className="text-sm text-muted-foreground">{acceptingError}</p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => navigate({ to: "/app" })}
                className="via-btn via-btn-primary w-full text-center"
              >
                Ir para o painel
              </button>
              <button
                onClick={() => window.location.reload()}
                className="via-btn via-btn-secondary w-full text-center text-xs"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <Logo className="h-7 mb-8" />
        <div className="via-card max-w-md w-full text-center py-8 space-y-3">
          <RefreshCw className="animate-spin mx-auto text-primary" size={28} />
          <h1 className="text-2xl font-semibold">Aceitando convite</h1>
          <p className="text-sm text-muted-foreground">Aguarde enquanto vinculamos seu acesso…</p>
        </div>
      </div>
    );
  }

  // Usuário não autenticado — formulário de cadastro / aceite
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <Logo className="h-7 mb-8" />
      <div className="via-card w-full max-w-md">
        <span className="via-label">Convite de Equipe</span>
        <h1 className="mt-2 text-3xl font-bold">Criar seu acesso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Preencha os dados abaixo com o mesmo e-mail que recebeu o convite.
        </p>

        {acceptingError && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{acceptingError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Seu Nome" type="text" value={displayName} onChange={setDisplayName} required />
          <Field label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          <Field label="Senha" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />
          <button type="submit" disabled={busy} className="via-btn via-btn-primary w-full">
            {busy ? "Criando conta…" : "Aceitar convite e entrar"}
          </button>
        </form>

        <div className="mt-4 text-xs text-center border-t border-border pt-4">
          <Link to="/auth/sign-in" className="text-[color:var(--via-blue)] hover:underline">
            Já tem uma conta? Fazer login
          </Link>
        </div>
      </div>
    </div>
  );
}
