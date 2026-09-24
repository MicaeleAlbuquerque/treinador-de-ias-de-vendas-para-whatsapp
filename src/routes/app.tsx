import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { useAuth, signOut } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ThemeToggle } from "@/components/theme-toggle";
import { getWhatsAppInstance } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

type NavItem = { to: string; label: string; exact?: boolean; beta?: boolean };
const NAV: NavItem[] = [
  { to: "/app", label: "Painel", exact: true },
  { to: "/app/conversations", label: "Conversas" },
  { to: "/app/dna", label: "DNA" },
  { to: "/app/coach", label: "Coach" },
  { to: "/app/prompts", label: "Prompts e playbooks" },
  { to: "/app/team", label: "Equipe" },
  { to: "/app/settings", label: "Configurações" },
  { to: "/app/help", label: "Ajuda" },
];

function AppShell() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth/sign-in", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="via-label">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar email={user.email ?? undefined} />
      <div className="md:pl-64">
        <main className="mx-auto max-w-6xl px-6 py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AppSidebar({ email }: { email?: string }) {
  const loc = useLocation();
  const navigate = useNavigate();

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
    staleTime: 30000,
  });

  const companyName = brandQuery.data?.company_name?.trim();
  const logoUrl = brandQuery.data?.logo_url?.trim();

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-20 items-center gap-3 border-b border-border px-5">
        {logoUrl ? (
          <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-background/80 border border-border flex items-center justify-center p-1">
            <img
              src={logoUrl}
              alt={companyName ?? "Logo da empresa"}
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = "none";
              }}
            />
          </div>
        ) : companyName ? (
          <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm select-none">
            {companyName.slice(0, 2).toUpperCase()}
          </div>
        ) : null}

        {companyName ? (
          <div className="min-w-0 flex-1">
            <div
              className="font-bold text-sm truncate text-foreground leading-tight"
              title={companyName}
            >
              {companyName}
            </div>
            <p className="via-label text-[9px] text-muted-foreground mt-0.5 truncate">
              Treinador de IAs de Vendas
            </p>
          </div>
        ) : !logoUrl ? (
          <div className="flex flex-col justify-center gap-1.5">
            <Logo className="h-5 w-auto self-start" />
            <p className="via-label text-[9px] text-muted-foreground">
              Treinador de IAs de Vendas
            </p>
          </div>
        ) : null}
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
        {NAV.map((item) => {
          const active = item.exact ? loc.pathname === item.to : loc.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span>{item.label}</span>
              {item.beta ? (
                <span className="rounded-full border border-accent px-1.5 py-px text-[8px] tracking-wider text-accent">
                  BETA
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <WhatsAppStatusBadge />
      <div className="border-t border-border p-4">
        {email ? (
          <p className="mb-2 truncate text-xs text-muted-foreground" title={email}>
            {email}
          </p>
        ) : null}
        <ThemeToggle variant="row" />
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth/sign-in" });
          }}
          className="via-label mt-1 w-full rounded-md px-3 py-2 text-left text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}

function WhatsAppStatusBadge() {
  const getInstanceFn = useServerFn(getWhatsAppInstance);
  const q = useQuery({
    queryKey: ["wa-instance-status"],
    queryFn: () => getInstanceFn({}),
    refetchInterval: 15000,
  });

  const status = q.data?.status as string | undefined;
  const tone =
    status === "connected"
      ? { dot: "bg-emerald-500", text: "Conectado" }
      : status === "connecting" || status === "qr_ready" || status === "qr" || status === "pairing"
        ? { dot: "bg-amber-500 animate-pulse", text: "Conectando" }
        : status === "error"
          ? { dot: "bg-rose-500", text: "Erro" }
          : q.data
            ? { dot: "bg-muted-foreground/40", text: "Desconectado" }
            : { dot: "bg-muted-foreground/30", text: "Não conectado" };

  return (
    <div className="border-t border-border px-4 py-3 text-xs">
      <Link to="/app/settings" className="flex items-center gap-2 hover:opacity-90">
        <span className={`inline-block h-2 w-2 rounded-full ${tone.dot}`} />
        <span className="via-label text-muted-foreground">WhatsApp · {tone.text}</span>
      </Link>
      {q.data?.last_error && (
        <p className="mt-1 truncate text-[10px] text-destructive" title={q.data.last_error}>
          {q.data.last_error}
        </p>
      )}
    </div>
  );
}
