import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field } from "./auth.sign-in";

export const Route = createFileRoute("/auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
  }

  return (
    <div className="via-card">
      <span className="via-label">Recuperação</span>
      <h1 className="mt-2 text-3xl">Esqueci minha senha</h1>
      {sent ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 text-sm text-green-800 dark:text-green-300">
            <p className="font-semibold">E-mail de recuperação enviado!</p>
            <p className="mt-1 text-xs text-green-700 dark:text-green-400 leading-relaxed">
              Enviamos um e-mail para <strong>{email}</strong> contendo o link de redefinição e também um <strong>código numérico (OTP)</strong>.
            </p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se o link for bloqueado ou expirar pelo leitor de e-mail, você pode utilizar o código numérico diretamente na tela de nova senha.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              to="/auth/reset-password"
              search={{ email }}
              className="via-btn via-btn-primary text-center w-full"
            >
              Digitar código recebido (OTP)
            </Link>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="via-btn via-btn-secondary text-center w-full text-xs"
            >
              Tentar outro e-mail
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          <button type="submit" disabled={loading} className="via-btn via-btn-primary w-full">
            {loading ? "Enviando…" : "Enviar link e código"}
          </button>
        </form>
      )}
      <div className="mt-6 pt-3 border-t border-border flex justify-between items-center text-xs">
        <Link to="/auth/sign-in" className="text-[color:var(--via-blue)] hover:underline">
          Voltar para entrar
        </Link>
        <Link to="/auth/reset-password" className="text-muted-foreground hover:underline">
          Já tenho um código
        </Link>
      </div>
    </div>
  );
}