import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole } from "@/lib/user-role";
import {
  setCoachThreshold,
  runCoachBacklog,
  getCoachStatus,
  getCoachPerSellerMetrics,
  getCoachDeviations,
  getCoachNotifications,
} from "@/lib/coach.functions";
import { listSimulationHistory } from "@/lib/training-simulator.functions";
import { SimulationArena } from "@/components/coach/SimulationArena";
import { SimulationHistory } from "@/components/coach/SimulationHistory";
import { toast } from "sonner";
import { Activity, AlertTriangle, Trophy, BookOpen, Brain, Sparkles, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/app/coach")({ component: CoachPage });

function scoreColor(s: number): string {
  if (s >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (s >= 60) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

function CoachPage() {
  const { role } = useMyRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const setThr = useServerFn(setCoachThreshold);
  const runBacklogFn = useServerFn(runCoachBacklog);
  const getStatusFn = useServerFn(getCoachStatus);
  const getPerSellerFn = useServerFn(getCoachPerSellerMetrics);
  const getDeviationsFn = useServerFn(getCoachDeviations);
  const getNotificationsFn = useServerFn(getCoachNotifications);
  const [editingThr, setEditingThr] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Progresso ao vivo da avaliação retroativa (loop de lotes no front).
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);

  const statusQ = useQuery({
    queryKey: ["coach-status"],
    queryFn: () => getStatusFn({}),
    // Enquanto há pendentes, atualiza a cada 15s pra refletir o worker em
    // background (cron) avaliando o histórico mesmo sem clicar.
    refetchInterval: (q) => {
      const d = q.state.data as { pending?: number } | undefined;
      return d?.pending ? 15000 : false;
    },
  });

  function stopBacklog() {
    stopRef.current = true;
  }

  async function runBacklog() {
    setBusy(true);
    stopRef.current = false;
    let doneThisRun = 0;
    let totalToDo = 0;
    let first = true;
    try {
      // Mostra a barra já na largada (antes do 1º lote retornar).
      setProgress({ done: 0, total: statusQ.data?.pending ?? 1 });
      // Loop de lotes: avalia em sequência de 3 em 3 para que cada requisição termine rapidamente
      // e evite timeout no proxy de rede, atualizando a barra continuamente.
      while (!stopRef.current) {
        const r = await runBacklogFn({ data: { batch: 3 } });
        doneThisRun += r.processed;
        if (first) {
          totalToDo = doneThisRun + r.remaining;
          first = false;
        }
        setProgress({ done: doneThisRun, total: Math.max(totalToDo, doneThisRun, 1) });
        qc.invalidateQueries({ queryKey: ["coach-status"] });
        qc.invalidateQueries({ queryKey: ["coach-per-seller"] });
        qc.invalidateQueries({ queryKey: ["coach-deviations"] });
        qc.invalidateQueries({ queryKey: ["coach-notifs"] });

        // Se esgotou ou se o lote não conseguiu processar nada
        if (r.remaining === 0 || r.processed === 0) break;
      }
      if (doneThisRun === 0) {
        toast.info("Nenhuma mensagem avaliada nesta rodada. Verifique se a sua chave de IA possui cota disponível.");
      } else if (stopRef.current) {
        toast.success(`Avaliação pausada. ${doneThisRun} mensagens avaliadas nesta rodada.`);
      } else {
        toast.success(`Pronto! ${doneThisRun} mensagens avaliadas.`);
      }
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("<!doctype html>") || msg.includes("This page didn't load") || msg.includes("504") || msg.includes("502")) {
        toast.error("Tempo limite excedido na resposta do servidor. A IA demorou para responder ou a cota da chave de IA está esgotada.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const settingsQ = useQuery({
    queryKey: ["coach-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("current_dna_snapshot_id, coach_alert_threshold")
        .eq("id", true).maybeSingle();
      return data;
    },
  });
  const threshold = (settingsQ.data as any)?.coach_alert_threshold ?? 60;

  const perSellerQ = useQuery({
    queryKey: ["coach-per-seller"],
    queryFn: async () => {
      const data = await getPerSellerFn({});
      return data ?? [];
    },
  });

  const deviationsQ = useQuery({
    queryKey: ["coach-deviations", threshold],
    queryFn: async () => {
      const data = await getDeviationsFn({});
      return data ?? [];
    },
  });

  const notifsQ = useQuery({
    queryKey: ["coach-notifs"],
    queryFn: async () => {
      const data = await getNotificationsFn({});
      return data ?? [];
    },
  });

  async function saveThreshold() {
    if (editingThr == null) return;
    try {
      await setThr({ data: { threshold: editingThr } });
      toast.success("Threshold atualizado");
      setEditingThr(null);
      qc.invalidateQueries({ queryKey: ["coach-settings"] });
      qc.invalidateQueries({ queryKey: ["coach-deviations"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  type CoachTab = "arena" | "metrics" | "history";
  const [activeTab, setActiveTab] = useState<CoachTab>("arena");
  const listHistoryFn = useServerFn(listSimulationHistory);

  const historyQ = useQuery({
    queryKey: ["simulation-history"],
    queryFn: () => listHistoryFn({}),
  });

  const sellersActiveQ = useQuery({
    queryKey: ["sellers-active-coach"],
    queryFn: async () => {
      const { data } = await supabase.from("sellers").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl flex items-center gap-2"><Activity size={26} /> Coach mode</h1>
          <p className="text-sm text-muted-foreground">Treinamento prático de vendas com IA e acompanhamento da aderência do time ao Playbook.</p>
        </div>
        <div className="text-sm text-muted-foreground">
          Base:{" "}
          <span className="font-semibold text-foreground">
            {statusQ.data?.baseMode === "dna" ? "DNA avançado" : statusQ.data?.baseMode === "playbook" ? "Playbook" : "— nenhuma"}
          </span>
          <span className="mx-2">·</span>
          Threshold:{" "}
          {editingThr == null ? (
            <button
              onClick={() => isAdmin && setEditingThr(threshold)}
              className="font-bold text-foreground hover:underline"
              disabled={!isAdmin}
            >
              {threshold}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <input
                type="number" min={0} max={100} value={editingThr}
                onChange={(e) => setEditingThr(Number(e.target.value))}
                className="via-input w-20 text-xs"
              />
              <button onClick={saveThreshold} className="via-btn via-btn-sm via-btn-primary">Salvar</button>
              <button onClick={() => setEditingThr(null)} className="via-btn via-btn-sm via-btn-secondary">Cancelar</button>
            </span>
          )}
        </div>
      </header>

      {/* Abas Superiores do Coach */}
      <div className="flex border-b border-border gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("arena")}
          className={`pb-2.5 px-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === "arena"
              ? "border-[color:var(--via-blue)] text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Brain size={16} className="text-[color:var(--via-blue)]" /> Arena de Treinamento (Roleplay IA)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("metrics")}
          className={`pb-2.5 px-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === "metrics"
              ? "border-[color:var(--via-blue)] text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity size={16} /> Aderência & Métricas do Time
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`pb-2.5 px-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === "history"
              ? "border-[color:var(--via-blue)] text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy size={16} className="text-amber-500" /> Histórico de Simulações
          {(historyQ.data?.length ?? 0) > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold">
              {historyQ.data?.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "arena" && (
        <SimulationArena
          sellers={sellersActiveQ.data ?? []}
          onFinishedSession={() => {
            qc.invalidateQueries({ queryKey: ["simulation-history"] });
          }}
        />
      )}

      {activeTab === "history" && (
        <SimulationHistory
          items={historyQ.data ?? []}
          isLoading={historyQ.isLoading}
          onNewSessionClick={() => setActiveTab("arena")}
        />
      )}

      {activeTab === "metrics" && (
        <div className="space-y-6">

      {/* Painel de status: base ativa, progresso de avaliação, ação retroativa */}
      {statusQ.data?.baseMode === "none" ? (
        <div className="via-card border-amber-200 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 text-amber-600 shrink-0" size={18} />
            <div className="text-sm text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-semibold">A Coach precisa de uma base de comparação.</p>
              <p>
                Gere um <strong>Playbook</strong> na aba <Link to="/app/dna" className="underline">DNA</Link> (basta ter conversas
                importadas — não precisa de CRM). Assim que existir, a Coach passa a pontuar cada mensagem do vendedor contra ele.
                Quando você tiver o <strong>DNA avançado</strong> (Tier 2), ela usa ele automaticamente — mais preciso.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="via-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {statusQ.data?.baseMode === "dna" ? (
                <Brain className="text-foreground" size={20} />
              ) : (
                <BookOpen className="text-[color:var(--via-blue)]" size={20} />
              )}
              <div className="text-sm">
                <p className="font-semibold">
                  Comparando contra: {statusQ.data?.baseMode === "dna" ? "DNA avançado do top performer" : "Playbook do atendimento"}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {statusQ.data?.evaluated ?? 0} de {statusQ.data?.sellerMessages ?? 0} mensagens de vendedor avaliadas
                  {(statusQ.data?.pending ?? 0) > 0 && ` · ${statusQ.data?.pending} pendentes`}
                </p>
              </div>
            </div>
            {(statusQ.data?.pending ?? 0) > 0 && !busy && (
              <button onClick={runBacklog} className="via-btn via-btn-primary">
                Avaliar histórico ({statusQ.data?.pending})
              </button>
            )}
            {busy && (
              <button onClick={stopBacklog} className="via-btn via-btn-secondary">
                Parar
              </button>
            )}
          </div>

          {/* Barra de progresso ao vivo */}
          {busy && (
            <div className="mt-3 space-y-1">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[color:var(--via-blue)] transition-all duration-500"
                  style={{
                    width: progress
                      ? `${Math.max(4, Math.min(100, Math.round((progress.done / Math.max(progress.total, 1)) * 100)))}%`
                      : "6%",
                  }}
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[color:var(--via-blue)]" />
                {progress
                  ? `Avaliando… ${progress.done} avaliadas nesta rodada${progress.total ? ` · ~${progress.total} no lote` : ""}`
                  : "Iniciando avaliação…"}
              </div>
            </div>
          )}
          {!busy && (statusQ.data?.pending ?? 0) > 0 && (
            <p className="text-[11px] text-muted-foreground mt-2">
              A avaliação também roda <strong>sozinha em background</strong> a cada poucos minutos — você pode fechar a aba.
              Use <strong>Avaliar histórico</strong> pra acelerar agora.
            </p>
          )}
          {statusQ.data?.baseMode === "playbook" && (
            <p className="text-[11px] text-muted-foreground mt-3 border-t border-border pt-2">
              Modo Tier 1: usa o Playbook como referência. Pra ranking de vendedores e antipadrões estatísticos,
              gere o <Link to="/app/dna" className="underline">DNA avançado</Link> (requer Won/Lost ou análise IA).
            </p>
          )}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="via-card">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Trophy size={18} /> Aderência por agente humano (7d)</h2>
          {perSellerQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : (perSellerQ.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem avaliações nos últimos 7 dias.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase">
                  <th className="pb-2">Vendedor</th><th className="pb-2">Mensagens</th><th className="pb-2">Score médio</th>
                </tr>
              </thead>
              <tbody>
                {(perSellerQ.data ?? []).map((s: any, i: number) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2">{i === 0 && <Trophy size={12} className="inline mr-1 text-amber-500" />}{s.name}</td>
                    <td className="py-2">{s.count}</td>
                    <td className="py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${scoreColor(s.avg)}`}>{Math.round(s.avg)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="via-card">
          <h2 className="text-lg font-bold mb-3">Agente IA</h2>
          <div className="text-sm text-muted-foreground">Nenhum agente IA configurado ainda. (Roadmap)</div>
        </div>
      </section>

      <section className="via-card">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><AlertTriangle size={18} /> Últimas saídas do padrão</h2>
        {(deviationsQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma mensagem abaixo do threshold ({threshold}).</div>
        ) : (
          <ul className="space-y-2">
            {(deviationsQ.data ?? []).map((d: any) => (
              <li key={d.id} className="flex items-start justify-between gap-3 border-b border-border pb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{d.suggestion || <span className="italic text-muted-foreground">sem sugestão</span>}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{new Date(d.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${scoreColor(d.score)}`}>{Math.round(d.score)}</span>
                  <Link to="/app/conversations/$id" params={{ id: d.conversation_id }} className="text-xs text-[color:var(--via-blue)] hover:underline">
                    Abrir
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="via-card">
        <h2 className="text-lg font-bold mb-3">Notificações recentes</h2>
        {(notifsQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem notificações.</div>
        ) : (
          <ul className="space-y-2">
            {(notifsQ.data ?? []).map((n: any) => {
              const convId = n.payload?.conversation_id;
              return (
                <li key={n.id} className="flex items-start justify-between gap-3 border-b border-border pb-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{n.title}</div>
                    <div className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
                  </div>
                  {convId && (
                    <Link to="/app/conversations/$id" params={{ id: convId }} className="text-xs text-[color:var(--via-blue)] hover:underline">
                      Abrir conversa
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
        </div>
      )}
    </div>
  );
}