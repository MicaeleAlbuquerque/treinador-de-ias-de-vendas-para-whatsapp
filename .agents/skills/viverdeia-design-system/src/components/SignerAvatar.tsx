import { cn } from '../lib/utils';
import { SIGNER_COLORS } from '../types';

interface SignerAvatarProps {
  name: string;
  index?: number;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  showOrder?: number;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizeMap = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

export function SignerAvatar({ name, index = 0, color, size = 'md', showOrder, className }: SignerAvatarProps) {
  const bg = color ?? SIGNER_COLORS[index % SIGNER_COLORS.length];
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm',
        sizeMap[size],
        className,
      )}
      style={{ backgroundColor: bg }}
      aria-label={name}
      title={name}
    >
      {initials(name)}
      {typeof showOrder === 'number' && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-foreground text-[9px] font-bold text-background">
          {showOrder}
        </span>
      )}
    </div>
  );
}
