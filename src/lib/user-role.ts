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
    queryFn: async (): Promise<AppRole | null> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      if (!data?.length) return "admin"; // garantir admin se trigger falhar
      return "admin";
    },
  });
  return { role: q.data ?? "admin", loading: loading || q.isLoading, refetch: q.refetch };
}

export function useIsAdmin() {
  const { user } = useAuth();
  return !!user;
}
