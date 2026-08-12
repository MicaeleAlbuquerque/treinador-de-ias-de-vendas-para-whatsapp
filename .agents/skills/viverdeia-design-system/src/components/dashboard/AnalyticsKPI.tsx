import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Info } from 'lucide-react';

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  variation?: number; // percentage points (e.g., 0.12 = +12%)
  tooltip?: string;
  icon?: LucideIcon;
}

export function AnalyticsKPI({ title, value, subtitle, variation, tooltip, icon: Icon }: Props) {
  const hasVariation = typeof variation === 'number' && Number.isFinite(variation);
  const trend = hasVariation ? (variation! > 0.001 ? 'up' : variation! < -0.001 ? 'down' : 'flat') : null;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <Card className="shadow-elevation-2">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {tooltip && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground/70" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">{value}</span>
          {trend && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              {Math.abs(variation! * 100).toFixed(1)}%
            </span>
          )}
        </div>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
