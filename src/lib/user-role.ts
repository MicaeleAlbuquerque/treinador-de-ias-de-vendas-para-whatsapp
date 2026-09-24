import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";

// Single-tenant interno: qualquer usuário autenticado tem papel admin.
// Mantemos a tabela `user_roles` por compatibilidade e auditoria.
export type AppRole = "admin" | "member";

export function useMyRole() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["my-role", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AppRole> => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user!.id);
        if (!error && data && data.length > 0) {
          const roles = data.map((r: { role: string }) => r.role);
          if (roles.includes("admin")) return "admin";
          if (roles.includes("member")) return "member";
        }
      } catch {
        // Fallback
      }
      // Single-tenant interno: qualquer usuário autenticado tem papel admin por padrão
      return "admin";
    },
  });
  return { role: (q.data ?? "admin") as AppRole, loading: loading || q.isLoading, refetch: q.refetch };
}

export function useIsAdmin() {
  const { role, loading } = useMyRole();
  return { isAdmin: role === "admin", loading };
}

