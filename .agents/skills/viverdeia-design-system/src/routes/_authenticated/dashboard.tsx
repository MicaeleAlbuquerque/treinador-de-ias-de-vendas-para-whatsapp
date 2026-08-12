import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Clock, CheckCircle, Loader, AlertTriangle, Mail, Plus, Percent, Timer } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboardStats, useDashboardAnalytics, useEnvelopes } from '../../hooks/useEnvelopes';
import { StatCard } from '../../components/StatCard';
import { EnvelopeStatusBadge } from '../../components/EnvelopeStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { StatusDonut } from '../../components/dashboard/StatusDonut';
import { TrendChart } from '../../components/dashboard/TrendChart';
import { AnalyticsKPI } from '../../components/dashboard/AnalyticsKPI';
import { TopSignersBar } from '../../components/dashboard/TopSignersBar';
import { OnboardingDialog } from '../../components/onboarding/OnboardingDialog';
import { useOnboardingStatus } from '../../hooks/useOnboarding';


export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

function formatHours(hours: number): { value: string; subtitle: string } {
  if (!hours || !Number.isFinite(hours)) return { value: '—', subtitle: 'Sem dados ainda' };
  if (hours < 1) return { value: `${Math.round(hours * 60)} min`, subtitle: 'Tempo médio até a assinatura' };
  if (hours < 24) return { value: `${hours.toFixed(1)} h`, subtitle: 'Tempo médio até a assinatura' };
  return { value: `${(hours / 24).toFixed(1)} dias`, subtitle: 'Tempo médio até a assinatura' };
}

function DashboardPage() {
  const { profile } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats(profile?.id);
  const { data: analytics, isLoading: analyticsLoading } = useDashboardAnalytics(profile?.id);
  const { data: recentEnvelopes, isLoading: envelopesLoading } = useEnvelopes({ ownerId: profile?.id });
  const notifiedRef = useRef(false);
  const { shouldShow, profile: onboardingProfile } = useOnboardingStatus();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  useEffect(() => {
    if (shouldShow) setOnboardingOpen(true);
  }, [shouldShow]);

  useEffect(() => {
    if (notifiedRef.current || !recentEnvelopes?.length) return;
    notifiedRef.current = true;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentlyCompleted = recentEnvelopes.filter(
      (env) => env.status === 'completed' && env.completed_at && new Date(env.completed_at).getTime() > oneDayAgo,
    );
    if (recentlyCompleted.length === 1) {
      toast.success(`Envelope "${recentlyCompleted[0].name}" foi assinado!`);
    } else if (recentlyCompleted.length > 1) {
      toast.success(`${recentlyCompleted.length} envelopes foram assinados nas últimas 24h!`);
    }
  }, [recentEnvelopes]);

  const completionRateVariation =
    analytics && analytics.completionRate.previous > 0
      ? analytics.completionRate.current - analytics.completionRate.previous
      : undefined;

  const avgTimeFormatted = analytics ? formatHours(analytics.avgSigningTime.hours) : { value: '—', subtitle: '' };
  const hasAnyEnvelope = (analytics?.totalEnvelopes ?? 0) > 0;

  return (
    <div className="space-y-6">
      {onboardingProfile && (
        <OnboardingDialog profile={onboardingProfile} open={onboardingOpen} onOpenChange={setOnboardingOpen} />
      )}
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard title="Pendentes de Assinatura" value={stats?.pending ?? 0} icon={Clock} />
            <StatCard title="Assinados Hoje" value={stats?.completedToday ?? 0} icon={CheckCircle} />
            <StatCard title="Em Andamento" value={stats?.inProgress ?? 0} icon={Loader} />
            <StatCard title="Expirados" value={stats?.expired ?? 0} icon={AlertTriangle} />
          </>
        )}
      </div>

      {/* Analytics */}
      {analyticsLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !hasAnyEnvelope ? (
        <Card className="shadow-elevation-2">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Crie seu primeiro envelope para ver as métricas e gráficos analíticos.
            </p>
            <Button asChild className="mt-4">
              <Link to="/envelopes/new">
                <Plus className="mr-2 h-4 w-4" />
                Novo Envelope
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AnalyticsKPI
              title="Taxa de conclusão"
              value={`${(analytics!.completionRate.current * 100).toFixed(1)}%`}
              subtitle="Últimos 30 dias"
              variation={completionRateVariation}
              icon={Percent}
              tooltip="Percentual de envelopes finalizados que foram concluídos com sucesso (vs cancelados/expirados)."
            />
            <AnalyticsKPI
              title="Tempo médio de assinatura"
              value={avgTimeFormatted.value}
              subtitle={
                analytics!.avgSigningTime.sampleSize > 0
                  ? `Baseado em ${analytics!.avgSigningTime.sampleSize} envelope(s) concluído(s)`
                  : 'Sem dados ainda'
              }
              icon={Timer}
              tooltip="Tempo médio entre envio e conclusão por todos os signatários."
            />
          </div>

          {/* Donut + Trend */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <StatusDonut data={analytics!.byStatus} total={analytics!.totalEnvelopes} />
            </div>
            <div className="lg:col-span-2">
              <TrendChart data={analytics!.trend} />
            </div>
          </div>

          {/* Top signers */}
          <TopSignersBar data={analytics!.topSigners} />
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent envelopes */}
        <Card className="lg:col-span-2 shadow-elevation-2">
          <CardHeader>
            <CardTitle className="text-lg">Últimos Envelopes</CardTitle>
          </CardHeader>
          <CardContent>
            {envelopesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : !recentEnvelopes?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum envelope criado ainda</p>
            ) : (
              <div className="space-y-3">
                {recentEnvelopes.slice(0, 5).map((env) => (
                  <Link
                    key={env.id}
                    to="/envelopes/$id"
                    params={{ id: env.id }}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/5"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{env.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(env.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <EnvelopeStatusBadge status={env.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card className="shadow-elevation-2">
          <CardHeader>
            <CardTitle className="text-lg">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link to="/envelopes/new">
                <Plus className="mr-2 h-4 w-4" />
                Novo Envelope
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/envelopes" search={{ status: 'sent' }}>
                <Clock className="mr-2 h-4 w-4" />
                Ver Pendentes
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
