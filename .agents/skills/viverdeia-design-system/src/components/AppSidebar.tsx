import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  FileText,
  Layers,
  Mail,
  Users,
  Settings,
  Clock,
  User,
  LogOut,
  PenTool,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { NotificationBell } from './NotificationBell';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'user'] },
  { to: '/documents', label: 'Documentos', icon: FileText, roles: ['admin', 'user'] },
  { to: '/templates', label: 'Templates', icon: Layers, roles: ['admin', 'user'] },
  { to: '/envelopes', label: 'Envelopes', icon: Mail, roles: ['admin', 'user'] },
  { to: '/admin/users', label: 'Usuários', icon: Users, roles: ['admin'] },
  { to: '/admin/settings', label: 'Configurações', icon: Settings, roles: ['admin'] },
  { to: '/admin/reminders', label: 'Régua de Lembretes', icon: Clock, roles: ['admin'] },
] as const;

export function AppSidebar() {
  const { profile, signOut } = useAuth();
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredNav = navItems.filter((item) => (item.roles as readonly string[]).includes((profile?.role ?? 'user').toLowerCase()));

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-sidebar-border px-6 py-5">
        <PenTool className="h-6 w-6 text-sidebar-primary" />
        <span className="text-lg font-bold text-sidebar-accent-foreground">Assina.ai</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNav.map((item) => {
          const isActive = currentPath.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <Link
          to="/profile"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            currentPath === '/profile' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
          )}
        >
          <User className="h-5 w-5" />
          Perfil
        </Link>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar - mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border transition-transform md:translate-x-0 md:static md:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

export function AppHeader() {
  const { profile } = useAuth();
  const router = useRouterState();
  const currentPath = router.location.pathname;

  const pageTitle = navItems.find((i) => currentPath.startsWith(i.to))?.label
    ?? (currentPath === '/profile' ? 'Perfil' : '');

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4 shadow-elevation-1">
      <h1 className="text-xl font-semibold text-foreground ml-10 md:ml-0">{pageTitle}</h1>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.full_name}</span>
        <Badge variant="outline" className={profile?.role === 'admin' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-border bg-secondary text-muted-foreground'}>
          {profile?.role}
        </Badge>
      </div>
    </header>
  );
}
