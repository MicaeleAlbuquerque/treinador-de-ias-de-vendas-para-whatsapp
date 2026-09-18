import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordRedirect,
});

function ResetPasswordRedirect() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.location.replace(`/auth/reset-password${window.location.search}${window.location.hash}`);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      Redirecionando…
    </div>
  );
}
