import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field } from "./auth.sign-in";
import { AlertTriangle, KeyRound, CheckCircle2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/auth/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [useOtpMode, setUseOtpMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function processAuthFromUrl() {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashClean = window.location.hash.startsWith("#")
          ? window.location.hash.substring(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hashClean);

        const emailParam = searchParams.get("email") || hashParams.get("email");
        if (emailParam && mounted) setEmail(emailParam);

        // Verifica se o Supabase retornou erro no hash ou search (ex: link expirado por email scanner)
        const errorParam = hashParams.get("error") || searchParams.get("error");
        const errorDesc =
          hashParams.get("error_description") ||
          searchParams.get("error_description") ||
          errorParam;

        if (errorDesc) {
          const friendlyError =
            errorDesc.toLowerCase().includes("expired") || errorDesc.toLowerCase().includes("invalid")
              ? "O link de recuperação expirou ou foi consumido pelo leitor/antivírus do seu e-mail. Use o código recebido no e-mail abaixo para redefinir."
              : decodeURIComponent(errorDesc.replace(/\+/g, " "));
          if (mounted) {
            setUrlError(friendlyError);
            setUseOtpMode(true);
          }
        }

        // Se houver access_token no hash
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? "",
          });
          if (!error && data.session && mounted) {
            setHasActiveSession(true);
            setUrlError(null);
          }
        }

        // Se houver code na query (PKCE)
        const code = searchParams.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data.session && mounted) {
            setHasActiveSession(true);
            setUrlError(null);
          } else if (error && mounted) {
            setUrlError("Código do link inválido ou expirado. Digite o código OTP recebido por e-mail.");
            setUseOtpMode(true);
          }
        }

        // Se houver token_hash
        const tokenHash = searchParams.get("token_hash");
        if (tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (!error && data.session && mounted) {
            setHasActiveSession(true);
            setUrlError(null);
          } else if (error && mounted) {
            setUrlError("O link expirou. Digite o código OTP recebido por e-mail.");
            setUseOtpMode(true);
          }
        }

        // Checa se já temos sessão ativa
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session && mounted) {
          setHasActiveSession(true);
          if (sessionData.session.user?.email && !email) setEmail(sessionData.session.user.email);
        }
      } catch (err) {
        console.error("Erro ao verificar autenticação de recuperação:", err);
      } finally {
        if (mounted) setVerifying(false);
      }
    }

    processAuthFromUrl();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || session) && mounted) {
        setHasActiveSession(true);
        setUrlError(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleResetWithSession(e: FormEvent) {
    e.preventDefault();
    if (!password || password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        // Se a sessão expirou no momento do envio, abre o modo OTP
        if (error.message.toLowerCase().includes("session") || error.message.toLowerCase().includes("auth")) {
          setHasActiveSession(false);
          setUseOtpMode(true);
          toast.error("Sua sessão de recuperação expirou. Digite o código recebido no e-mail.");
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.success("Senha redefinida com sucesso!");
      navigate({ to: "/app" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetWithOtp(e: FormEvent) {
    e.preventDefault();
    if (!email || !otpCode || !password) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (password.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      // 1. Valida o OTP recebido no e-mail
      const { data, error: otpErr } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "recovery",
      });
      if (otpErr) {
        toast.error(`Código inválido ou expirado: ${otpErr.message}`);
        return;
      }
      if (!data.session) {
        toast.error("Não foi possível iniciar a sessão com este código.");
        return;
      }

      // 2. Com a sessão estabelecida pelo OTP, atualiza a senha
      const { error: pwdErr } = await supabase.auth.updateUser({ password });
      if (pwdErr) {
        toast.error(pwdErr.message);
        return;
      }

      toast.success("Senha redefinida com sucesso!");
      navigate({ to: "/app" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (verifying) {
    return (
      <div className="via-card flex flex-col items-center justify-center py-12 text-center">
        <RefreshCw className="animate-spin text-muted-foreground" size={24} />
        <p className="mt-3 text-sm text-muted-foreground">Validando link de recuperação…</p>
      </div>
    );
  }

  return (
    <div className="via-card space-y-4">
      <div>
        <span className="via-label">Recuperação de Acesso</span>
        <h1 className="mt-2 text-3xl">Redefinir senha</h1>
      </div>

      {urlError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3.5 flex items-start gap-3 text-sm">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-900 dark:text-amber-200">Aviso sobre o link</div>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">{urlError}</p>
          </div>
        </div>
      )}

      {hasActiveSession && !useOtpMode ? (
        // Fluxo 1: Sessão ativa reconhecida do link
        <form onSubmit={handleResetWithSession} className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 p-2.5 rounded border border-green-200">
            <CheckCircle2 size={16} /> Link verificado com sucesso. Escolha sua nova senha.
          </div>
          <Field
            label="Nova senha"
            type="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="new-password"
          />
          <button type="submit" disabled={loading} className="via-btn via-btn-primary w-full">
            {loading ? "Salvando…" : "Salvar nova senha"}
          </button>
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setUseOtpMode(true)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Prefere usar código numérico do e-mail?
            </button>
          </div>
        </form>
      ) : (
        // Fluxo 2: Verificação com Código OTP (100% imune a pré-visualização de e-mail)
        <form onSubmit={handleResetWithOtp} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Digite seu e-mail e o código numérico de 6 a 8 dígitos que você recebeu por e-mail para definir sua nova senha.
          </p>

          <Field
            label="Seu e-mail"
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />

          <div>
            <label className="via-label">Código numérico recebido (OTP)</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.trim())}
                required
                placeholder="Ex: 123456 ou 78675588"
                className="via-input tracking-wider font-mono"
              />
              <KeyRound size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">
              Consulte a mensagem recebida no e-mail (números destacados).
            </span>
          </div>

          <Field
            label="Nova senha"
            type="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="new-password"
          />

          <button type="submit" disabled={loading} className="via-btn via-btn-primary w-full">
            {loading ? "Redefinindo…" : "Validar código e salvar senha"}
          </button>

          {hasActiveSession && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setUseOtpMode(false)}
                className="text-xs text-[color:var(--via-blue)] hover:underline"
              >
                Voltar para redefinição direta por link
              </button>
            </div>
          )}
        </form>
      )}

      <div className="pt-2 border-t border-border flex justify-between items-center text-xs">
        <Link to="/auth/forgot-password" className="text-muted-foreground hover:underline">
          Solicitar novo e-mail
        </Link>
        <Link to="/auth/sign-in" className="text-[color:var(--via-blue)] hover:underline font-medium">
          Voltar para entrar
        </Link>
      </div>
    </div>
  );
}