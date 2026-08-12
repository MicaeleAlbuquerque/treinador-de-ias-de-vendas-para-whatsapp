import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field } from "./auth.sign-in";

// Cadastro aberto: qualquer pessoa pode criar conta e acessar o painel.
export const Route = createFileRoute("/auth/sign-up")({ component: SignUpPage });

function SignUpPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { display_name: displayName },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Conta criada! Bem-vindo.");
    navigate({ to: "/app" });
  }

  return (
    <div className="via-card">
      <span className="via-label">Criar conta</span>
      <h1 className="mt-2 text-3xl">Criar conta</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Crie seu acesso ao painel. Leva menos de um minuto.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field label="Nome" type="text" value={displayName} onChange={setDisplayName} required />
        <Field label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <Field label="Senha" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />
        <button type="submit" disabled={loading} className="via-btn via-btn-primary w-full">
          {loading ? "Criando…" : "Criar conta"}
        </button>
      </form>
      <div className="mt-4 text-xs">
        <Link to="/auth/sign-in" className="text-[color:var(--via-blue)] hover:underline">
          Já tenho conta
        </Link>
      </div>
    </div>
  );
}
