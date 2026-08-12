import { Button } from './ui/button';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  variant?: 'default' | 'search' | 'filter' | 'error';
  tip?: string;
}

const variantStyles: Record<NonNullable<EmptyStateProps['variant']>, {
  ring: string;
  bg: string;
  icon: string;
  dot: string;
}> = {
  default: {
    ring: 'ring-primary/10',
    bg: 'bg-gradient-to-br from-primary/5 to-primary/15',
    icon: 'text-primary/70',
    dot: 'bg-primary/30',
  },
  search: {
    ring: 'ring-muted-foreground/10',
    bg: 'bg-gradient-to-br from-muted/50 to-muted',
    icon: 'text-muted-foreground',
    dot: 'bg-muted-foreground/30',
  },
  filter: {
    ring: 'ring-accent/15',
    bg: 'bg-gradient-to-br from-accent/5 to-accent/15',
    icon: 'text-accent',
    dot: 'bg-accent/30',
  },
  error: {
    ring: 'ring-destructive/15',
    bg: 'bg-gradient-to-br from-destructive/5 to-destructive/15',
    icon: 'text-destructive/70',
    dot: 'bg-destructive/30',
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  variant = 'default',
  tip,
}: EmptyStateProps) {
  const styles = variantStyles[variant];

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {/* Ilustração: círculo com gradiente, ícone central e elementos decorativos */}
      <div className="relative">
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-full ${styles.bg} ring-8 ${styles.ring}`}
        >
          <Icon className={`h-10 w-10 ${styles.icon}`} strokeWidth={1.5} />
        </div>
        {/* Decorative dots */}
        <span
          className={`absolute -top-1 -right-2 h-2 w-2 rounded-full ${styles.dot}`}
          aria-hidden
        />
        <span
          className={`absolute top-4 -left-3 h-1.5 w-1.5 rounded-full ${styles.dot} opacity-60`}
          aria-hidden
        />
        <span
          className={`absolute -bottom-1 right-3 h-1 w-1 rounded-full ${styles.dot} opacity-50`}
          aria-hidden
        />
      </div>

      <h3 className="mt-6 text-xl font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground text-balance">
        {description}
      </p>

      {(actionLabel || secondaryActionLabel) && (
        <div className="mt-6 flex flex-col-reverse sm:flex-row items-center gap-3">
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="ghost" size="sm" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
          {actionLabel && onAction && (
            <Button onClick={onAction}>{actionLabel}</Button>
          )}
        </div>
      )}

      {tip && (
        <p className="mt-5 text-xs text-muted-foreground/80">
          <span className="font-medium">Dica:</span> {tip}
        </p>
      )}
    </div>
  );
}
