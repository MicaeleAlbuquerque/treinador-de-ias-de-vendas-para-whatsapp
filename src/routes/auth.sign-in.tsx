import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/sign-in")({ component: SignInPage });

function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/app" });
  }

  return (
    <div className="via-card">
      <span className="via-label">Acessar conta</span>
      <h1 className="mt-2 text-3xl">Entrar</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Acesse o painel da sua empresa.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <Field label="Senha" type="password" value={password} onChange={setPassword} required autoComplete="current-password" />
        <button type="submit" disabled={loading} className="via-btn via-btn-primary w-full">
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-xs">
        <Link to="/auth/forgot-password" className="text-[color:var(--via-blue)] hover:underline">
          Esqueci a senha
        </Link>
        <Link to="/auth/sign-up" className="text-[color:var(--via-blue)] hover:underline">
          Criar conta
        </Link>
      </div>
    </div>
  );
}

export function Field({ label, type, value, onChange, required, autoComplete }: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; required?: boolean; autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="via-label">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        required={required} autoComplete={autoComplete}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--via-blue)] focus:ring-2 focus:ring-[color:var(--via-blue)]/20" />
    </label>
  );
}
