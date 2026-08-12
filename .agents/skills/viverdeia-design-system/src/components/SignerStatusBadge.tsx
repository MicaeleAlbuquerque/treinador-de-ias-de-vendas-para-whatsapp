import { Badge } from './ui/badge';
import { SIGNER_STATUS_CONFIG, type SignerStatus } from '../types';
import { cn } from '../lib/utils';

const colorMap: Record<string, string> = {
  gray: 'bg-muted text-muted-foreground border-border',
  blue: 'bg-accent/10 text-accent border-accent/20',
  yellow: 'bg-warning/10 text-warning border-warning/20',
  green: 'bg-success/10 text-success border-success/20',
  red: 'bg-destructive/10 text-destructive border-destructive/20',
  orange: 'bg-warning/15 text-warning border-warning/25',
};

export function SignerStatusBadge({ status }: { status: string }) {
  const config = SIGNER_STATUS_CONFIG[status as SignerStatus] ?? { label: status, color: 'gray' };
  return (
    <Badge variant="outline" className={cn('font-medium', colorMap[config.color])}>
      {config.label}
    </Badge>
  );
}
