import { useState, useRef, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNotifications, useUnreadCount, useMarkAsRead } from '../hooks/useNotifications';
import { Button } from './ui/button';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: notifications } = useNotifications();
  const { data: unreadCount } = useUnreadCount();
  const markAsRead = useMarkAsRead();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClick = (notificationId: string, envelopeId: string | null, isRead: boolean) => {
    if (!isRead) {
      markAsRead.mutate(notificationId);
    }
    setOpen(false);
    if (envelopeId) {
      navigate({ to: '/envelopes/$id', params: { id: envelopeId } });
    }
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={() => setOpen(!open)}
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {!!unreadCount && unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-primary-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border bg-card shadow-elevation-2 z-50">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {!notifications?.length ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-muted/50 to-muted ring-4 ring-muted/30">
                  <BellOff className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">Sem notificações</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Você está em dia.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n.id, n.envelope_id, n.is_read)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  )}
                  <div className={!n.is_read ? '' : 'pl-5'}>
                    <p className={`text-sm ${n.is_read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
