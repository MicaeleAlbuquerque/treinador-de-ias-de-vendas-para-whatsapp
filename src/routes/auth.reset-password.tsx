import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field } from "./auth.sign-in";

export const Route = createFileRoute("/auth/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha redefinida.");
    navigate({ to: "/app" });
  }

  return (
    <div className="via-card">
      <span className="via-label">Nova senha</span>
      <h1 className="mt-2 text-3xl">Redefinir senha</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field label="Nova senha" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />
        <button type="submit" disabled={loading} className="via-btn via-btn-primary w-full">
          {loading ? "Salvando…" : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}