import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { useAuth, signOut } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ThemeToggle } from "@/components/theme-toggle";
import { getWhatsAppInstance } from "@/lib/whatsapp.functions";
import {
  LayoutDashboard,
  MessageSquare,
  Dna,
  Award,
  Sparkles,
  Users,
  Settings,
  HelpCircle,
  Menu,
  X,
  LogOut,
} from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

type NavItem = {
  to: string;
  label: string;
  exact?: boolean;
  beta?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const NAV: NavItem[] = [
  { to: "/app", label: "Painel", exact: true, icon: LayoutDashboard },
  { to: "/app/conversations", label: "Conversas", icon: MessageSquare },
  { to: "/app/dna", label: "DNA", icon: Dna },
  { to: "/app/coach", label: "Coach", icon: Award },
  { to: "/app/prompts", label: "Prompts e playbooks", icon: Sparkles },
  { to: "/app/team", label: "Equipe", icon: Users },
  { to: "/app/settings", label: "Configurações", icon: Settings },
  { to: "/app/help", label: "Ajuda", icon: HelpCircle },
];

const MOBILE_BOTTOM_NAV = [
  { to: "/app", label: "Painel", exact: true, icon: LayoutDashboard },
  { to: "/app/conversations", label: "Conversas", icon: MessageSquare },
  { to: "/app/dna", label: "DNA", icon: Dna },
  { to: "/app/coach", label: "Coach", icon: Award },
  { to: "/app/settings", label: "Ajustes", icon: Settings },
];

function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth/sign-in", replace: true });
  }, [loading, user, navigate]);

  // Fecha o drawer mobile automaticamente ao mudar de rota
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [loc.pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="via-label animate-pulse">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-x-hidden">
      {/* Sidebar Desktop (>= md) */}
      <AppSidebar email={user.email ?? undefined} />

      {/* Header Mobile (< md) */}
      <MobileHeader
        drawerOpen={mobileDrawerOpen}
        onToggleDrawer={() => setMobileDrawerOpen((prev) => !prev)}
      />

      {/* Drawer Mobile (< md) */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        email={user.email ?? undefined}
      />

      {/* Conteúdo principal */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0 overflow-x-hidden">
        <main className="mx-auto w-full max-w-6xl px-3.5 py-4 sm:px-6 sm:py-8 md:py-10 pb-24 md:pb-10 flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Barra de Navegação Inferior Mobile (< md) */}
      <MobileBottomNav onOpenMenu={() => setMobileDrawerOpen(true)} />
    </div>
  );
}

function MobileHeader({
  drawerOpen,
  onToggleDrawer,
}: {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
}) {
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
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur md:hidden">
      <Link to="/app" className="flex items-center gap-2.5 min-w-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={companyName ?? "Logo"}
            className="h-7 w-7 rounded-md object-contain border border-border/80 p-0.5 bg-background"
          />
        ) : companyName ? (
          <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs select-none">
            {companyName.slice(0, 2).toUpperCase()}
          </div>
        ) : (
          <Logo className="h-4 w-auto" />
        )}
        <span className="font-bold text-xs truncate max-w-[170px] text-foreground">
          {companyName || "Treinador de IAs"}
        </span>
      </Link>

      <div className="flex items-center gap-1.5">
        <WhatsAppStatusDot />
        <ThemeToggle />
        <button
          type="button"
          onClick={onToggleDrawer}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          aria-label={drawerOpen ? "Fechar menu" : "Abrir menu"}
        >
          {drawerOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}

function MobileDrawer({
  isOpen,
  onClose,
  email,
}: {
  isOpen: boolean;
  onClose: () => void;
  email?: string;
}) {
  const loc = useLocation();
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200">
      {/* Overlay escuro de fundo */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel lateral deslizante */}
      <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card border-r border-border flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2 min-w-0">
            <Logo className="h-5 w-auto" />
            <span className="text-xs font-semibold text-muted-foreground truncate">
              Menu
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Links de navegação */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {NAV.map((item) => {
            const active = item.exact
              ? loc.pathname === item.to
              : loc.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={16} />
                  <span>{item.label}</span>
                </div>
                {item.beta && (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">
                    BETA
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Status WhatsApp */}
        <WhatsAppStatusBadge />

        {/* Rodapé do Drawer */}
        <div className="border-t border-border p-4 bg-muted/20">
          {email && (
            <p className="mb-2 truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
          )}
          <div className="mb-3">
            <ThemeToggle variant="row" />
          </div>
          <button
            type="button"
            onClick={async () => {
              onClose();
              await signOut();
              navigate({ to: "/auth/sign-in" });
            }}
            className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut size={15} />
            <span>Sair da conta</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const loc = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-border bg-card/95 backdrop-blur px-2 shadow-lg md:hidden">
      {MOBILE_BOTTOM_NAV.map((item) => {
        const active = item.exact
          ? loc.pathname === item.to
          : loc.pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-lg transition-colors ${
              active
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={18} className={active ? "scale-110 transition-transform" : ""} />
            <span className="text-[10px] tracking-tight mt-1 leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
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
          const Icon = item.icon;
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
              <div className="flex items-center gap-2.5">
                <Icon size={15} />
                <span>{item.label}</span>
              </div>
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
          className="via-label mt-1 w-full rounded-md px-3 py-2 text-left text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center gap-2"
        >
          <LogOut size={13} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}

function WhatsAppStatusDot() {
  const getInstanceFn = useServerFn(getWhatsAppInstance);
  const q = useQuery({
    queryKey: ["wa-instance-status"],
    queryFn: () => getInstanceFn({}),
    refetchInterval: 15000,
  });

  const status = q.data?.status as string | undefined;
  const isConnected = status === "connected";
  const isConnecting =
    status === "connecting" || status === "qr_ready" || status === "qr" || status === "pairing";

  return (
    <Link
      to="/app/settings"
      className="p-1.5 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
      title={isConnected ? "WhatsApp Conectado" : isConnecting ? "WhatsApp Conectando" : "WhatsApp Desconectado"}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          isConnected
            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
            : isConnecting
            ? "bg-amber-500 animate-pulse"
            : "bg-muted-foreground/40"
        }`}
      />
    </Link>
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
