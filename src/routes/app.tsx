import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import logoLockupDark from "@/assets/brand/viverdeia-lockup-black.svg";
import logoLockupLight from "@/assets/brand/viverdeia-lockup-white.svg";
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
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-20 flex-col justify-center gap-1.5 border-b border-border px-6">
        <img src={logoLockupDark} alt="Viver de IA" className="h-5 w-auto self-start dark:hidden" />
        <img src={logoLockupLight} alt="Viver de IA" className="hidden h-5 w-auto self-start dark:block" />
        <p className="via-label text-[9px] text-muted-foreground">Treinador de IAs de Vendas</p>
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
