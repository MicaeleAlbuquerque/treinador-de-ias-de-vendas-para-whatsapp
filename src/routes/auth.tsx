import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

function AuthLayout() {
  const brandQuery = useQuery({
    queryKey: ["app-settings-branding"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("company_name, logo_url")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  const companyName = brandQuery.data?.company_name?.trim();
  const logoUrl = brandQuery.data?.logo_url?.trim();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/auth/sign-in" className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName ?? "Logo"}
                className="h-8 w-8 object-contain rounded-md bg-background/50 border border-border p-0.5"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : null}

            {companyName ? (
              <span className="font-bold text-lg text-foreground tracking-tight">
                {companyName}
              </span>
            ) : (
              <Logo className="h-7 w-auto" />
            )}
          </Link>

          {companyName ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wider hidden sm:inline opacity-70">
                Plataforma
              </span>
              <Logo className="h-5 w-auto" />
            </div>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}