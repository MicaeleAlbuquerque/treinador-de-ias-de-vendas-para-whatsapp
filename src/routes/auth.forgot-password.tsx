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
        <p className="mt-4 text-sm text-muted-foreground">
          Se existir uma conta com este e-mail, você receberá um link para redefinir a senha.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          <button type="submit" disabled={loading} className="via-btn via-btn-primary w-full">
            {loading ? "Enviando…" : "Enviar link"}
          </button>
        </form>
      )}
      <p className="mt-4 text-xs">
        <Link to="/auth/sign-in" className="text-[color:var(--via-blue)] hover:underline">
          Voltar para entrar
        </Link>
      </p>
    </div>
  );
}