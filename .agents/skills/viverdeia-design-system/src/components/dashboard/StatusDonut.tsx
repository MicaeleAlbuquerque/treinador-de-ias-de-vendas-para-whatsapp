import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  expired: 'Expirado',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'var(--success, oklch(0.72 0.17 155))',
  sent: 'var(--primary)',
  in_progress: 'var(--accent)',
  expired: 'var(--destructive)',
  cancelled: 'var(--muted-foreground)',
  draft: 'var(--secondary)',
};

interface Props {
  data: { status: string; count: number }[];
  total: number;
}

export function StatusDonut({ data, total }: Props) {
  const formatted = data.map((d) => ({
    name: STATUS_LABELS[d.status] ?? d.status,
    value: d.count,
    color: STATUS_COLORS[d.status] ?? 'var(--muted)',
  }));

  return (
    <Card className="shadow-elevation-2">
      <CardHeader>
        <CardTitle className="text-lg">Envelopes por status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={formatted}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
              >
                {formatted.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--popover-foreground)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-foreground">{total}</span>
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {formatted.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-auto font-medium text-foreground">{entry.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
