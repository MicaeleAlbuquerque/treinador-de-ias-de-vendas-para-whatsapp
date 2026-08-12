import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});

function RootRedirect() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth/sign-in", replace: true });
    } else {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      Carregando…
    </div>
  );
}
