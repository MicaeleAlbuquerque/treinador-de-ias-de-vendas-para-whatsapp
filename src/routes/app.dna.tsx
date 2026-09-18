import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { triggerDnaRecalc } from "@/lib/analysis.functions";
import { setCurrentSnapshot } from "@/lib/analysis.functions";
import { useMyRole } from "@/lib/user-role";
import { toast } from "sonner";
import { Sparkles, Trophy, Brain, BookOpen, Copy, Check, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { scoreAllPendingQuality, getQualityScoreStats, saveDnaQualityConfig } from "@/lib/quality-score.functions";
import { triggerPlaybookGenerate, getCurrentPlaybook, listPlaybookHistory, getPlaybookSnapshot, setActivePlaybook, savePlaybookEdit, generateFewShotExamples, recommendLlmModel } from "@/lib/playbook.functions";

export const Route = createFileRoute("/app/dna")({ component: DnaPage });

type Tab = "ranking" | "stages" | "objections" | "antipatterns" | "history";

function DnaPage() {
  const qc = useQueryClient();
  const { role } = useMyRole();
  const isAdmin = role === "admin";
  const recalcFn = useServerFn(triggerDnaRecalc);
  const setSnapFn = useServerFn(setCurrentSnapshot);
  const scoreQualityFn = useServerFn(scoreAllPendingQuality);
  const getQualityStatsFn = useServerFn(getQualityScoreStats);
  const saveQualityCfgFn = useServerFn(saveDnaQualityConfig);
  const generatePlaybookFn = useServerFn(triggerPlaybookGenerate);
  const getPlaybookFn = useServerFn(getCurrentPlaybook);
  const listPlaybookHistoryFn = useServerFn(listPlaybookHistory);
  const getPlaybookSnapshotFn = useServerFn(getPlaybookSnapshot);
  const setActivePlaybookFn = useServerFn(setActivePlaybook);
  const savePlaybookEditFn = useServerFn(savePlaybookEdit);
  // Versão de playbook em visualização (null = a ativa/atual).
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("ranking");
  const [generatingPlaybook, setGeneratingPlaybook] = useState(false);
  const [recalculatingDna, setRecalculatingDna] = useState(false);
  const [evaluatingQuality, setEvaluatingQuality] = useState(false);
  const [togglingQuality, setTogglingQuality] = useState(false);
  const [savingPlaybookEdit, setSavingPlaybookEdit] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  async function toggleUseQuality(next: boolean) {
    setTogglingQuality(true);
    try {
      await saveQualityCfgFn({
        data: {
          dnaUseQualityScore: next,
          dnaQualityMinGood: settingsQ.data?.dna_quality_min_good ?? 75,
          dnaQualityMaxBad: settingsQ.data?.dna_quality_max_bad ?? 40,
        },
      });
      toast.success(next ? "Análise IA habilitada." : "Análise IA desabilitada.");
      qc.invalidateQueries({ queryKey: ["dna-settings"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setTogglingQuality(false); }
  }

  const settingsQ = useQuery({
    queryKey: ["dna-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings")
        .select("current_dna_snapshot_id, last_dna_snapshot_at, dna_min_won, dna_min_lost, dna_min_sellers, dna_individual_mode, dna_use_quality_score, dna_quality_min_good, dna_quality_max_bad")
        .eq("id", true).maybeSingle();
      return data;
    },
  });
  const qualityStatsQ = useQuery({
    queryKey: ["quality-stats"],
    queryFn: () => getQualityStatsFn({}),
    refetchInterval: (q) => {
      const d = q.state.data as { pendingJobs?: number } | undefined;
      return d?.pendingJobs ? 5000 : false;
    },
  });
  const playbookQ = useQuery({
    queryKey: ["playbook-current"],
    queryFn: () => getPlaybookFn({}),
  });
  const playbookHistoryQ = useQuery({
    queryKey: ["playbook-history"],
    queryFn: () => listPlaybookHistoryFn({}),
  });
  // Quando uma versão antiga é selecionada, busca ela; senão usa a atual.
  const viewedPlaybookQ = useQuery({
    queryKey: ["playbook-snapshot", viewingSnapshotId],
    queryFn: () => getPlaybookSnapshotFn({ data: { snapshotId: viewingSnapshotId! } }),
    enabled: !!viewingSnapshotId,
  });
  const activeSnapshotId = (playbookQ.data as any)?.id ?? null;
  const displayedPlaybook = viewingSnapshotId ? viewedPlaybookQ.data : playbookQ.data;
  const displayedLoading = viewingSnapshotId ? viewedPlaybookQ.isLoading : playbookQ.isLoading;

  async function savePlaybookEditHandler(systemPrompt: string) {
    const base = viewingSnapshotId ?? activeSnapshotId;
    if (!base) {
      toast.error("Nenhuma versão base pra editar.");
      return;
    }
    setSavingPlaybookEdit(true);
    try {
      await savePlaybookEditFn({ data: { systemPrompt, baseSnapshotId: base } });
      toast.success("Edição salva como nova versão.");
      setViewingSnapshotId(null);
      qc.invalidateQueries({ queryKey: ["playbook-current"] });
      qc.invalidateQueries({ queryKey: ["playbook-history"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPlaybookEdit(false);
    }
  }

  async function restorePlaybookVersion(snapshotId: string) {
    setRestoringVersionId(snapshotId);
    try {
      await setActivePlaybookFn({ data: { snapshotId } });
      toast.success("Versão restaurada como playbook ativo.");
      setViewingSnapshotId(null);
      qc.invalidateQueries({ queryKey: ["playbook-current"] });
      qc.invalidateQueries({ queryKey: ["playbook-history"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoringVersionId(null);
    }
  }

  async function runPlaybookGenerate() {
    setGeneratingPlaybook(true);
    try {
      const r = await generatePlaybookFn({}) as any;
      if (r.ok) {
        const modeLabel = r.mode === "auto" ? "modo auto (IA classificou sozinha)" : "modo refinado (com amostras avaliadas)";
        toast.success(`Playbook gerado em ${modeLabel}: ${r.total} conversas analisadas (${r.good} boas / ${r.bad} fracas).`);
        setViewingSnapshotId(null);
        qc.invalidateQueries({ queryKey: ["playbook-current"] });
        qc.invalidateQueries({ queryKey: ["playbook-history"] });
      } else if (r.reason === "no_conversations") {
        toast.error("Precisa de pelo menos 3 conversas com 4+ mensagens no banco. Importe o histórico primeiro.");
      } else {
        toast.error("Falha ao gerar playbook.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setGeneratingPlaybook(false); }
  }

  async function runQualityBatch() {
    setEvaluatingQuality(true);
    try {
      const r = await scoreQualityFn({ data: { batch: 10 } });
      if (r.processed === 0 && r.enqueued === 0) {
        toast.info("Todas as conversas elegíveis já foram avaliadas.");
      } else if (r.failed > 0) {
        toast.warning(`Lote: ${r.processed} avaliadas, ${r.failed} falhas, ${r.enqueued} enfileiradas.`);
      } else {
        toast.success(`Lote: ${r.processed} avaliadas. ${r.enqueued} pendentes na fila.`);
      }
      qc.invalidateQueries({ queryKey: ["quality-stats"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setEvaluatingQuality(false); }
  }
  const snapId = settingsQ.data?.current_dna_snapshot_id ?? null;

  const snapQ = useQuery({
    queryKey: ["dna-snap", snapId],
    enabled: !!snapId,
    queryFn: async () => {
      const { data } = await supabase.from("dna_snapshots")
        .select("id, created_at, total_conversations_analyzed, top_performer_seller_id")
        .eq("id", snapId!).single();
      return data;
    },
  });
  const scoresQ = useQuery({
    queryKey: ["dna-scores", snapId],
    enabled: !!snapId,
    queryFn: async () => {
      const { data } = await supabase.from("seller_dna_scores")
        .select("*").eq("snapshot_id", snapId!).order("score", { ascending: false });
      const rows = data ?? [];
      const sellerIds = [...new Set(rows.map((r: any) => r.seller_id).filter(Boolean))];
      const nameById = new Map<string, string>();
      if (sellerIds.length > 0) {
        const { data: ss } = await supabase.from("sellers").select("id, name").in("id", sellerIds);
        for (const s of ss ?? []) nameById.set(s.id, s.name);
      }
      return rows.map((r: any) => ({ ...r, seller_name: nameById.get(r.seller_id) ?? "—" }));
    },
  });
  const objQ = useQuery({
    queryKey: ["dna-obj", snapId],
    enabled: !!snapId,
    queryFn: async () => {
      const { data } = await supabase.from("dna_objections")
        .select("*").eq("snapshot_id", snapId!).order("win_rate", { ascending: false });
      return data ?? [];
    },
  });
  const antiQ = useQuery({
    queryKey: ["dna-anti", snapId],
    enabled: !!snapId,
    queryFn: async () => {
      const { data } = await supabase.from("dna_antipatterns")
        .select("*").eq("snapshot_id", snapId!).order("lift", { ascending: false }).limit(30);
      return data ?? [];
    },
  });
  const histQ = useQuery({
    queryKey: ["dna-hist"],
    queryFn: async () => {
      const { data } = await supabase.from("dna_snapshots")
        .select("id, created_at, total_conversations_analyzed").order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  async function recalc() {
    setRecalculatingDna(true);
    try {
      const r = await recalcFn() as any;
      if (r?.ok) {
        toast.success(`DNA recalculado (${r.totalAnalyzed} conversas)`);
        qc.invalidateQueries({ queryKey: ["dna-settings"] });
      } else {
        const need = r?.need ?? { won: 0, lost: 0, sellers: 0 };
        const parts: string[] = [];
        if (need.won > 0) parts.push(`${need.won} conversa(s) boa(s)`);
        if (need.lost > 0) parts.push(`${need.lost} conversa(s) fraca(s)`);
        if (need.sellers > 0) parts.push(`${need.sellers} vendedor(es)`);
        toast.error(
          `Pra calcular o DNA do time faltam: ${parts.join(", ")}. Marque Won/Lost manualmente, conecte Pipedrive ou rode a análise de qualidade IA acima.`,
          { duration: 8000 },
        );
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setRecalculatingDna(false); }
  }

  if (!snapId) {
    return (
      <div className="space-y-6">
        <header><span className="via-label">DNA</span><h1 className="mt-1 text-3xl">Motor de análise</h1></header>

        <TierBanner level="basic" />
        <PlaybookPanel
          playbook={displayedPlaybook}
          loading={displayedLoading}
          generating={generatingPlaybook}
          saving={savingPlaybookEdit}
          restoringVersionId={restoringVersionId}
          onGenerate={runPlaybookGenerate}
          totalConversations={qualityStatsQ.data?.total ?? 0}
          qualityEvaluated={qualityStatsQ.data?.evaluated ?? 0}
          history={(playbookHistoryQ.data as any)?.items ?? []}
          activeSnapshotId={activeSnapshotId}
          viewingSnapshotId={viewingSnapshotId}
          onSelectVersion={setViewingSnapshotId}
          onRestoreVersion={restorePlaybookVersion}
          onSaveEdit={savePlaybookEditHandler}
        />
        <QualityScorePanel
          stats={qualityStatsQ.data}
          evaluating={evaluatingQuality}
          toggling={togglingQuality}
          onRun={runQualityBatch}
          onToggleUseQuality={toggleUseQuality}
          useQuality={settingsQ.data?.dna_use_quality_score !== false}
          minGood={settingsQ.data?.dna_quality_min_good ?? 75}
          maxBad={settingsQ.data?.dna_quality_max_bad ?? 40}
        />

        <TierBanner level="advanced" />
        <div className="via-card text-center py-10 space-y-3">
          <Sparkles className="mx-auto text-muted-foreground" />
          <div className="text-sm text-muted-foreground max-w-xl mx-auto space-y-2">
            <p>
              <strong>DNA Avançado do Time</strong> ainda não calculado. Esta análise faz ranking de vendedores e
              extrai padrões de quem ganha vs quem perde — requer pelo menos {settingsQ.data?.dna_min_won ?? 10} conversas
              "boas", {settingsQ.data?.dna_min_lost ?? 5} "fracas" e {settingsQ.data?.dna_min_sellers ?? 3} vendedores envolvidos.
            </p>
            <p className="text-xs">
              Como liberar: marcar Won/Lost manualmente, conectar Pipedrive, ou ativar a "Análise IA" acima (vira proxy de outcome).
            </p>
          </div>
          {isAdmin && (
            <button disabled={recalculatingDna} onClick={recalc} className="via-btn via-btn-secondary">
              {recalculatingDna ? "Calculando…" : "Tentar calcular DNA Avançado"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "ranking", label: "Ranking" },
    { id: "stages", label: "Etapas" },
    { id: "objections", label: "Objeções vencedoras" },
    { id: "antipatterns", label: "Antipadrão" },
    { id: "history", label: "Histórico" },
  ];
  const topName = (scoresQ.data ?? []).find((s: any) => s.is_top_performer)?.seller_name ?? "—";

  return (
    <div className="space-y-6">
      <header>
        <span className="via-label">DNA</span>
        <h1 className="mt-1 text-3xl">Motor de análise</h1>
      </header>

      <TierBanner level="basic" />
      <PlaybookPanel
        playbook={displayedPlaybook}
        loading={displayedLoading}
        generating={generatingPlaybook}
        saving={savingPlaybookEdit}
        restoringVersionId={restoringVersionId}
        onGenerate={runPlaybookGenerate}
        totalConversations={qualityStatsQ.data?.total ?? 0}
        qualityEvaluated={qualityStatsQ.data?.evaluated ?? 0}
        history={(playbookHistoryQ.data as any)?.items ?? []}
        activeSnapshotId={activeSnapshotId}
        viewingSnapshotId={viewingSnapshotId}
        onSelectVersion={setViewingSnapshotId}
        onRestoreVersion={restorePlaybookVersion}
        onSaveEdit={savePlaybookEditHandler}
      />
      <QualityScorePanel
        stats={qualityStatsQ.data}
        evaluating={evaluatingQuality}
        toggling={togglingQuality}
        onRun={runQualityBatch}
        onToggleUseQuality={toggleUseQuality}
        useQuality={settingsQ.data?.dna_use_quality_score !== false}
        minGood={settingsQ.data?.dna_quality_min_good ?? 75}
        maxBad={settingsQ.data?.dna_quality_max_bad ?? 40}
      />

      <TierBanner level="advanced" />
      <div className="via-card space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg">DNA Avançado do Time — Snapshot atual</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {snapQ.data ? `Criado em ${new Date(snapQ.data.created_at).toLocaleString("pt-BR")} · ${snapQ.data.total_conversations_analyzed} conversas analisadas` : ""}
              · Top performer: <strong>{topName}</strong>
            </p>
          </div>
          {isAdmin && <button disabled={recalculatingDna} onClick={recalc} className="via-btn via-btn-secondary">{recalculatingDna ? "Calculando…" : "Recalcular DNA"}</button>}
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-bold uppercase tracking-wide border-b-2 ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ranking" && (
        <div className="via-card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Vendedor</th><th className="px-3 py-2 text-left">Score</th>
              <th className="px-3 py-2 text-left">Win rate</th><th className="px-3 py-2 text-left">Resp. lead</th>
              <th className="px-3 py-2 text-left">1ª resp. (min)</th><th className="px-3 py-2 text-left">Conversas</th>
            </tr></thead>
            <tbody>
              {(scoresQ.data ?? []).map((s: any) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{s.seller_name} {s.is_top_performer && <Trophy size={12} className="inline text-amber-600" />}</td>
                  <td className="px-3 py-2">{Number(s.score).toFixed(3)}</td>
                  <td className="px-3 py-2">{Math.round((s.win_rate ?? 0) * 100)}%</td>
                  <td className="px-3 py-2">{Math.round((s.lead_response_rate ?? 0) * 100)}%</td>
                  <td className="px-3 py-2">{s.avg_first_response_minutes != null ? Number(s.avg_first_response_minutes).toFixed(0) : "—"}</td>
                  <td className="px-3 py-2">{s.total_conversations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "stages" && (
        <div className="via-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Vendedor</th>
              {["abertura","qualificacao","valor","objecao","fechamento"].map((s) => <th key={s} className="px-3 py-2 text-left">{s}</th>)}
            </tr></thead>
            <tbody>
              {(scoresQ.data ?? []).map((s: any) => {
                const dist = (s.stage_distribution as Record<string,number>) ?? {};
                const total = Object.values(dist).reduce((a, b) => a + (b as number), 0) || 1;
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{s.seller_name}</td>
                    {["abertura","qualificacao","valor","objecao","fechamento"].map((st) => {
                      const pct = Math.round(((dist[st] ?? 0) / total) * 100);
                      return <td key={st} className="px-3 py-2"><div className="rounded bg-blue-100 px-2 py-1 text-xs" style={{ opacity: 0.3 + pct/100*0.7 }}>{pct}%</div></td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "objections" && (
        <div className="space-y-3">
          {(objQ.data ?? []).length === 0 && <div className="via-card text-sm text-muted-foreground">Sem objeções no snapshot.</div>}
          {(objQ.data ?? []).map((o: any) => (
            <div key={o.id} className="via-card text-sm">
              <div className="text-xs uppercase text-muted-foreground">{o.category} · {Math.round((o.win_rate ?? 0) * 100)}% win · {o.sample_size} amostras</div>
              <div className="mt-1">{o.seller_response}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "antipatterns" && (
        <div className="via-card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">N-grama</th><th className="px-3 py-2 text-left">Lift</th>
              <th className="px-3 py-2 text-left">Freq. perdidas</th><th className="px-3 py-2 text-left">Freq. ganhas</th>
            </tr></thead>
            <tbody>
              {(antiQ.data ?? []).map((a: any) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{a.ngram}</td>
                  <td className="px-3 py-2">{Number(a.lift).toFixed(2)}×</td>
                  <td className="px-3 py-2">{(Number(a.lost_frequency) * 100).toFixed(2)}%</td>
                  <td className="px-3 py-2">{(Number(a.won_frequency) * 100).toFixed(2)}%</td>
                </tr>
              ))}
              {(antiQ.data ?? []).length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sem antipadrões detectados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "history" && (
        <div className="via-card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Conversas</th><th className="px-3 py-2 text-left">Atual</th><th className="px-3 py-2 text-left">Ações</th>
            </tr></thead>
            <tbody>
              {(histQ.data ?? []).map((s: any) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{new Date(s.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2">{s.total_conversations_analyzed}</td>
                  <td className="px-3 py-2">{s.id === snapId ? "✓" : ""}</td>
                  <td className="px-3 py-2">
                    {isAdmin && s.id !== snapId && (
                      <button className="via-btn via-btn-secondary text-xs" onClick={async () => {
                        try { await setSnapFn({ data: { snapshotId: s.id } }); toast.success("Snapshot ativado"); qc.invalidateQueries({ queryKey: ["dna-settings"] }); }
                        catch (e) { toast.error((e as Error).message); }
                      }}>Rollback</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QualityScorePanel({
  stats,
  evaluating,
  toggling,
  onRun,
  onToggleUseQuality,
  useQuality,
  minGood,
  maxBad,
}: {
  stats: { total: number; evaluated: number; good: number; bad: number; pendingJobs: number; failedJobs: number } | undefined;
  evaluating: boolean;
  toggling: boolean;
  onRun: () => void;
  onToggleUseQuality: (next: boolean) => void;
  useQuality: boolean;
  minGood: number;
  maxBad: number;
}) {
  if (!stats) {
    return (
      <div className="via-card p-4 text-sm text-muted-foreground">Carregando estatísticas de qualidade…</div>
    );
  }
  const remaining = Math.max(0, stats.total - stats.evaluated);
  const pct = stats.total > 0 ? Math.round((stats.evaluated / stats.total) * 100) : 0;

  let buttonLabel: string;
  let buttonDisabled = evaluating;
  let buttonTitle = "";
  if (stats.total === 0) {
    buttonLabel = "Importe conversas primeiro";
    buttonDisabled = true;
    buttonTitle = "Vá em Configurações → WhatsApp → Importar histórico.";
  } else if (remaining === 0) {
    buttonLabel = "Tudo avaliado";
    buttonDisabled = true;
  } else {
    buttonLabel = evaluating ? "Avaliando…" : `Avaliar próximas 10 (${remaining} restantes)`;
    buttonTitle = "Avalia 10 conversas neste batch. Repita pra avançar.";
  }

  return (
    <div className="via-card space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-[color:var(--via-blue)]" />
            <h3 className="text-lg">Análise de qualidade por IA</h3>
            {useQuality ? (
              <span className="text-[11px] rounded-full bg-green-500/15 text-green-700 px-2 py-0.5">ATIVA</span>
            ) : (
              <span className="text-[11px] rounded-full bg-muted text-muted-foreground px-2 py-0.5">DESATIVADA</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            <strong>A própria IA avalia sozinha</strong> — você não precisa marcar nada. Ela lê cada conversa e dá uma nota
            de 0 a 100 (descoberta, escuta, valor, objeção, ritmo, fechamento), classificando como
            <strong> boa (≥{minGood})</strong> ou <strong>fraca (≤{maxBad})</strong>.
            {useQuality
              ? " Essas notas viram o sinal que o DNA usa quando você não marcou Won/Lost — então funciona sem CRM."
              : " (Uso no DNA desativado: o DNA está considerando só Won/Lost manual ou Pipedrive.)"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            disabled={buttonDisabled}
            onClick={onRun}
            className="via-btn via-btn-primary"
            title={buttonTitle}
          >
            {buttonLabel}
          </button>
          <button
            onClick={() => onToggleUseQuality(!useQuality)}
            disabled={toggling}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            {toggling ? "Atualizando…" : useQuality ? "Desativar uso no DNA" : "Ativar uso no DNA"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Conversas</div>
          <div className="text-xl font-bold mt-1">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Avaliadas</div>
          <div className="text-xl font-bold mt-1">{stats.evaluated} <span className="text-xs font-normal text-muted-foreground">({pct}%)</span></div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 p-3">
          <div className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">Boas (≥{minGood})</div>
          <div className="text-xl font-bold mt-1 text-green-700 dark:text-green-400">{stats.good}</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3">
          <div className="text-xs uppercase tracking-wide text-red-700 dark:text-red-400">Fracas (≤{maxBad})</div>
          <div className="text-xl font-bold mt-1 text-red-700 dark:text-red-400">{stats.bad}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Na fila</div>
          <div className="text-xl font-bold mt-1">{stats.pendingJobs}{stats.failedJobs > 0 ? <span className="text-xs ml-1 text-red-600">+{stats.failedJobs} erro</span> : null}</div>
        </div>
      </div>
      {stats.total === 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm">
          <div className="font-semibold">Banco vazio</div>
          <p className="text-xs text-muted-foreground mt-1">
            Não há conversas pra avaliar. <a href="/app/settings#importar" className="underline text-foreground">Importar histórico do WhatsApp</a> primeiro.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------- TierBanner ----------------
function TierBanner({ level }: { level: "basic" | "advanced" }) {
  if (level === "basic") {
    return (
      <div className="rounded-xl border border-[color:var(--via-blue)]/30 bg-[color:var(--via-blue-light)] dark:bg-[color:var(--via-blue)]/10 px-4 py-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--via-blue)] text-white">
          <BookOpen size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold uppercase tracking-wide">Tier 1 · Análise Básica (sem CRM)</div>
          <p className="text-xs text-muted-foreground">
            Lê só o histórico do WhatsApp. Gera playbook + system prompt prontos pra usar em qualquer agente IA.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 flex items-center gap-3 mt-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Trophy size={18} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-bold uppercase tracking-wide">Tier 2 · Análise Avançada (requer CRM ou Won/Lost)</div>
        <p className="text-xs text-muted-foreground">
          Ranking de vendedores, win rate, antipadrões. Precisa de outcomes marcados — Pipedrive automático ou manual.
        </p>
      </div>
    </div>
  );
}

// ---------------- PlaybookPanel ----------------
function PlaybookPanel({
  playbook,
  loading,
  generating,
  saving,
  restoringVersionId,
  onGenerate,
  totalConversations,
  qualityEvaluated,
  history = [],
  activeSnapshotId = null,
  viewingSnapshotId = null,
  onSelectVersion,
  onRestoreVersion,
  onSaveEdit,
}: {
  playbook: any;
  loading: boolean;
  generating: boolean;
  saving: boolean;
  restoringVersionId: string | null;
  onGenerate: () => void;
  totalConversations: number;
  qualityEvaluated: number;
  history?: any[];
  activeSnapshotId?: string | null;
  viewingSnapshotId?: string | null;
  onSelectVersion?: (id: string | null) => void;
  onRestoreVersion?: (id: string) => void;
  onSaveEdit?: (systemPrompt: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("system_prompt");
  const [showVersions, setShowVersions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const canGenerate = totalConversations >= 3;
  const willUseAuto = qualityEvaluated < 6;
  const isViewingOld = !!viewingSnapshotId && viewingSnapshotId !== activeSnapshotId;
  const fmtDate = (s: string) =>
    new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  async function copySystemPrompt() {
    if (!playbook?.system_prompt) return;
    try {
      await navigator.clipboard.writeText(playbook.system_prompt);
      setCopied(true);
      toast.success("System prompt copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Falha ao copiar.");
    }
  }

  if (loading) {
    return <div className="via-card p-4 text-sm text-muted-foreground">Carregando playbook…</div>;
  }

  return (
    <div className="via-card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-[color:var(--via-blue)]" />
            <h3 className="text-lg">Playbook do Atendimento</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            A IA lê as conversas avaliadas (boas + fracas) e extrai um <strong>system prompt pronto</strong>,
            scripts vencedores, pontos de treinamento e o tom da marca. Cola onde você treina sua IA (agente, chatbot, plataforma de atendimento).
          </p>
        </div>
        <button
          disabled={generating || !canGenerate}
          onClick={onGenerate}
          className="via-btn via-btn-primary"
          title={canGenerate
            ? willUseAuto
              ? "Modo auto: a IA classifica e extrai sozinha (~15-30s)."
              : "Modo refinado: usa suas conversas avaliadas (~10-20s)."
            : "Importe pelo menos 3 conversas com 4+ mensagens antes."}
        >
          {generating ? "Gerando…" : playbook ? "Regenerar playbook" : "Gerar playbook agora"}
        </button>
      </div>

      {/* Histórico de versões geradas */}
      {history.length > 0 && (
        <div className="rounded-lg border border-border">
          <button
            onClick={() => setShowVersions((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 bg-muted/30 text-sm font-semibold"
          >
            <span className="flex items-center gap-2">
              {showVersions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Versões geradas ({history.length})
            </span>
            {isViewingOld && <span className="text-[11px] font-normal text-amber-600">vendo versão antiga</span>}
          </button>
          {showVersions && (
            <ul className="divide-y divide-border">
              {history.map((h: any) => {
                const isActive = h.id === activeSnapshotId;
                const isViewing = h.id === (viewingSnapshotId ?? activeSnapshotId);
                return (
                  <li
                    key={h.id}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${isViewing ? "bg-[color:var(--via-blue)]/5" : ""}`}
                  >
                    <button onClick={() => onSelectVersion?.(isActive ? null : h.id)} className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{fmtDate(h.generated_at)}</span>
                        {isActive && (
                          <span className="rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-2 py-0.5 text-[10px] font-semibold">
                            ATIVA
                          </span>
                        )}
                        {isViewing && !isActive && (
                          <span className="rounded-full bg-[color:var(--via-blue)]/15 text-[color:var(--via-blue)] px-2 py-0.5 text-[10px] font-semibold">
                            VENDO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {h.conversations_analyzed} amostras ({h.good_samples}b/{h.bad_samples}f) · {h.model ?? "—"}
                      </div>
                    </button>
                    {!isActive && (
                      <button
                        disabled={restoringVersionId === h.id}
                        onClick={() => onRestoreVersion?.(h.id)}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted shrink-0"
                      >
                        {restoringVersionId === h.id ? "Restaurando…" : "Restaurar"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Banner: visualizando versão antiga */}
      {isViewingOld && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-amber-800 dark:text-amber-300">
            Você está vendo uma <strong>versão antiga</strong> — não é a que está ativa.
          </span>
          <span className="flex gap-2">
            <button
              disabled={restoringVersionId === viewingSnapshotId}
              onClick={() => onRestoreVersion?.(viewingSnapshotId!)}
              className="via-btn via-btn-sm via-btn-primary"
            >
              {restoringVersionId === viewingSnapshotId ? "Restaurando…" : "Restaurar esta versão"}
            </button>
            <button onClick={() => onSelectVersion?.(null)} className="via-btn via-btn-sm via-btn-secondary">
              Voltar pra ativa
            </button>
          </span>
        </div>
      )}

      {!canGenerate && !playbook && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Importe pelo menos <strong>3 conversas</strong> com 4+ mensagens antes de gerar o playbook.
            Hoje: <strong>{totalConversations}</strong> elegível(eis).
          </p>
        </div>
      )}

      {canGenerate && !playbook && (
        <div className={`rounded-lg border p-3 text-sm ${willUseAuto ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/20" : "border-green-200 bg-green-50/30 dark:bg-green-950/20"}`}>
          <p className="text-xs">
            {willUseAuto ? (
              <>
                <strong>Vai rodar em modo AUTO</strong> — a IA lê {Math.min(totalConversations, 18)} conversas e classifica boas/fracas sozinha.
                Pra refinar (mais precisão e custo menor), avalie ao menos 6 conversas no painel abaixo antes — assim ela usa a curadoria.
              </>
            ) : (
              <>
                <strong>Vai rodar em modo REFINADO</strong> — usa as {qualityEvaluated} conversas que você já avaliou (boas vs fracas).
              </>
            )}
          </p>
        </div>
      )}

      {playbook && (
        <>
          {playbook.summary && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Resumo</div>
              <p>{playbook.summary}</p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Gerado em {new Date(playbook.generated_at).toLocaleString("pt-BR")} ·
                {" "}{playbook.conversations_analyzed} amostras ({playbook.good_samples} boas, {playbook.bad_samples} fracas)
              </p>
            </div>
          )}

          {/* System prompt: bloco grande copiável e editável */}
          <PlaybookSection
            id="system_prompt"
            title="System prompt (cola no seu agente de IA)"
            isOpen={openSection === "system_prompt"}
            onToggle={() => setOpenSection(openSection === "system_prompt" ? null : "system_prompt")}
            rightAction={
              editing ? null : (
                <span className="flex gap-1">
                  <button
                    onClick={() => { setDraft(playbook.system_prompt ?? ""); setEditing(true); setOpenSection("system_prompt"); }}
                    className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    onClick={copySystemPrompt}
                    className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiado" : "Copiar"}
                  </button>
                </span>
              )
            }
          >
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full text-xs font-mono bg-background border border-border rounded p-3 h-96 leading-relaxed"
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={saving || !draft.trim()}
                    onClick={() => { onSaveEdit?.(draft); setEditing(false); }}
                    className="via-btn via-btn-sm via-btn-primary"
                  >
                    {saving ? "Salvando…" : "Salvar como nova versão"}
                  </button>
                  <button onClick={() => setEditing(false)} className="via-btn via-btn-sm via-btn-secondary">
                    Cancelar
                  </button>
                  <span className="text-[11px] text-muted-foreground">A versão atual é preservada no histórico.</span>
                </div>
              </div>
            ) : (
              <pre className="text-xs whitespace-pre-wrap font-mono bg-background border border-border rounded p-3 max-h-[32rem] overflow-y-auto leading-relaxed">
                {playbook.system_prompt}
              </pre>
            )}
          </PlaybookSection>

          {/* Winning scripts */}
          <PlaybookSection
            id="winning"
            title={`Scripts vencedores (${(playbook.winning_scripts ?? []).length})`}
            isOpen={openSection === "winning"}
            onToggle={() => setOpenSection(openSection === "winning" ? null : "winning")}
          >
            <ul className="space-y-2 text-sm">
              {(playbook.winning_scripts ?? []).map((s: any, i: number) => (
                <li key={i} className="rounded border border-green-200 bg-green-50/40 dark:bg-green-950/20 p-2">
                  <div className="text-[11px] uppercase tracking-wide text-green-700 dark:text-green-400">{s.category}</div>
                  <div className="mt-1">"{s.script}"</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.why}</div>
                </li>
              ))}
            </ul>
          </PlaybookSection>

          {/* Losing scripts */}
          <PlaybookSection
            id="losing"
            title={`Padrões a evitar (${(playbook.losing_scripts ?? []).length})`}
            isOpen={openSection === "losing"}
            onToggle={() => setOpenSection(openSection === "losing" ? null : "losing")}
          >
            <ul className="space-y-2 text-sm">
              {(playbook.losing_scripts ?? []).map((s: any, i: number) => (
                <li key={i} className="rounded border border-red-200 bg-red-50/40 dark:bg-red-950/20 p-2">
                  <div className="text-[11px] uppercase tracking-wide text-red-700 dark:text-red-400">{s.category}</div>
                  <div className="mt-1">"{s.script}"</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.why_bad}</div>
                </li>
              ))}
            </ul>
          </PlaybookSection>

          {/* Training tips */}
          <PlaybookSection
            id="training"
            title={`Pontos de treinamento (${(playbook.training_tips ?? []).length})`}
            isOpen={openSection === "training"}
            onToggle={() => setOpenSection(openSection === "training" ? null : "training")}
          >
            <ul className="space-y-2 text-sm">
              {(playbook.training_tips ?? []).map((t: any, i: number) => {
                const cls = t.priority === "high" ? "border-red-200 bg-red-50/30 dark:bg-red-950/20"
                  : t.priority === "medium" ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/20"
                  : "border-border bg-muted/20";
                return (
                  <li key={i} className={`rounded border ${cls} p-2`}>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Prioridade: {t.priority ?? "—"}</div>
                    <div className="mt-1"><strong>Gap:</strong> {t.gap}</div>
                    <div className="text-sm mt-1"><strong>Drill:</strong> {t.drill}</div>
                  </li>
                );
              })}
            </ul>
          </PlaybookSection>

          {/* Vocab + voice */}
          <PlaybookSection
            id="vocab"
            title="Vocabulário e tom da marca"
            isOpen={openSection === "vocab"}
            onToggle={() => setOpenSection(openSection === "vocab" ? null : "vocab")}
          >
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Expressões da marca</div>
                <ul className="mt-1 text-xs space-y-1 list-disc pl-4">
                  {(playbook.vocabulary?.signature_phrases ?? []).map((p: string, i: number) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mt-3">Evitar</div>
                <ul className="mt-1 text-xs space-y-1 list-disc pl-4 text-red-700 dark:text-red-400">
                  {(playbook.vocabulary?.avoid ?? []).map((p: string, i: number) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Tom</div>
                <ul className="mt-1 text-xs space-y-1">
                  <li><strong>Formalidade:</strong> {playbook.voice_tone?.formality ?? "—"}</li>
                  <li><strong>Registro:</strong> {playbook.voice_tone?.register ?? "—"}</li>
                  <li><strong>Energia:</strong> {playbook.voice_tone?.energy ?? "—"}</li>
                </ul>
                {playbook.voice_tone?.description && (
                  <p className="text-xs mt-2 text-muted-foreground">{playbook.voice_tone.description}</p>
                )}
              </div>
            </div>
          </PlaybookSection>

          {/* ===== Kit de implantação ===== */}
          <div className="pt-2 mt-2 border-t border-border">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-[color:var(--via-blue)]" />
              <h4 className="text-sm font-semibold">Kit de implantação</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Tudo que você precisa pra colocar o agente pra rodar com este prompt.
            </p>

            <RecommendedModelSection
              isOpen={openSection === "modelo"}
              onToggle={() => setOpenSection(openSection === "modelo" ? null : "modelo")}
            />
            <KnowledgeBaseSection
              systemPrompt={playbook.system_prompt ?? ""}
              saving={saving}
              onSaveEdit={onSaveEdit}
              isOpen={openSection === "base"}
              onToggle={() => setOpenSection(openSection === "base" ? null : "base")}
            />
            <FewShotSection
              isOpen={openSection === "fewshot"}
              onToggle={() => setOpenSection(openSection === "fewshot" ? null : "fewshot")}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Kit: modelo de LLM recomendado (gerado por IA, atualizado na data) ----
function RecommendedModelSection({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const fn = useServerFn(recommendLlmModel);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<{ recommendation: string; searched: boolean; date: string } | null>(null);

  async function gen() {
    setBusy(true);
    try {
      const r = (await fn({})) as any;
      setRec({ recommendation: r.recommendation, searched: r.searched, date: r.date });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <PlaybookSection id="modelo" title="Modelo de IA recomendado" isOpen={isOpen} onToggle={onToggle}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          A IA pesquisa os modelos disponíveis <strong>na data de hoje</strong> e recomenda o melhor pro seu agente de
          vendas — então não fica preso a modelos antigos quando lançam novos.
        </p>
        {rec && (
          <div className="rounded border border-border bg-muted/20 p-3">
            <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{rec.recommendation}</pre>
            <p className="text-[11px] text-muted-foreground mt-2 border-t border-border pt-2">
              {rec.searched ? "Com pesquisa web atualizada" : "Gerado pela IA (sem pesquisa web — confirme lançamentos recentes)"} · {rec.date}
            </p>
          </div>
        )}
        <button disabled={busy} onClick={gen} className="via-btn via-btn-sm via-btn-primary">
          {busy ? "Pesquisando…" : rec ? "Atualizar recomendação" : "Gerar recomendação atualizada"}
        </button>
      </div>
    </PlaybookSection>
  );
}

// ---- Kit: checklist da base de conhecimento (extrai placeholders e injeta) ----
function KnowledgeBaseSection({
  systemPrompt, saving, onSaveEdit, isOpen, onToggle,
}: {
  systemPrompt: string;
  saving: boolean;
  onSaveEdit?: (s: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  // Extrai placeholders [ALGO] únicos do prompt.
  const placeholders = useMemo(() => {
    const set = new Set<string>();
    for (const m of systemPrompt.matchAll(/\[([^\]\n]{2,80})\]/g)) set.add(m[1]!.trim());
    return [...set];
  }, [systemPrompt]);
  const [values, setValues] = useState<Record<string, string>>({});
  const filledCount = placeholders.filter((p) => (values[p] ?? "").trim()).length;

  function buildFilled(): string {
    let out = systemPrompt;
    for (const p of placeholders) {
      const v = (values[p] ?? "").trim();
      if (v) out = out.split(`[${p}]`).join(v);
    }
    return out;
  }

  return (
    <PlaybookSection
      id="base"
      title={`Base de conhecimento (${filledCount}/${placeholders.length} preenchidos)`}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {placeholders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este prompt não tem campos a preencher — já está completo. 👍
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Estes são os dados do seu negócio que o agente precisa pra parar de ser genérico. Preencha e injete no prompt.
          </p>
          <div className="space-y-2">
            {placeholders.map((p) => (
              <label key={p} className="block">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{p}</span>
                <input
                  value={values[p] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
                  placeholder={`ex: valor de ${p.toLowerCase()}`}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="via-btn via-btn-sm via-btn-secondary"
              onClick={() => { navigator.clipboard.writeText(buildFilled()); toast.success("Prompt preenchido copiado."); }}
            >
              <Copy size={12} /> Copiar prompt preenchido
            </button>
            <button
              disabled={saving || filledCount === 0}
              className="via-btn via-btn-sm via-btn-primary"
              onClick={() => onSaveEdit?.(buildFilled())}
            >
              {saving ? "Salvando…" : "Salvar preenchido como nova versão"}
            </button>
          </div>
        </div>
      )}
    </PlaybookSection>
  );
}

// ---- Kit: dataset few-shot das melhores conversas ----
function FewShotSection({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const genFn = useServerFn(generateFewShotExamples);
  const [busy, setBusy] = useState(false);
  const [examples, setExamples] = useState<any[] | null>(null);

  async function gen() {
    setBusy(true);
    try {
      const r = await genFn({ data: { topN: 5 } }) as any;
      if (!r.ok) {
        toast.info("Avalie algumas conversas na Análise de qualidade primeiro pra ter exemplos.");
        setExamples([]);
        return;
      }
      setExamples(r.examples);
      toast.success(`${r.examples.length} exemplos extraídos das melhores conversas.`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  function download() {
    if (!examples?.length) return;
    const blob = new Blob([JSON.stringify(examples, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "few-shot-exemplos.json"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PlaybookSection id="fewshot" title="Exemplos de conversa (few-shot)" isOpen={isOpen} onToggle={onToggle}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          As melhores conversas reais (por nota de qualidade) viram exemplos pra reforçar o estilo do time no agente.
        </p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={gen} className="via-btn via-btn-sm via-btn-primary">
            {busy ? "Extraindo…" : "Gerar exemplos"}
          </button>
          {examples && examples.length > 0 && (
            <button onClick={download} className="via-btn via-btn-sm via-btn-secondary">
              <Copy size={12} /> Baixar .json
            </button>
          )}
        </div>
        {examples && examples.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {examples.slice(0, 3).map((ex: any, i: number) => (
              <div key={i} className="rounded border border-border bg-muted/20 p-2 text-xs">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Exemplo {i + 1} · nota {ex.score}</div>
                {(ex.turns ?? []).slice(0, 8).map((t: any, j: number) => (
                  <div key={j} className={t.role === "vendedor" ? "text-foreground" : "text-muted-foreground"}>
                    <strong>{t.role === "vendedor" ? "Vendedor" : "Lead"}:</strong> {t.text.slice(0, 160)}
                  </div>
                ))}
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Mostrando 3 de {examples.length}. O .json traz todos completos.</p>
          </div>
        )}
      </div>
    </PlaybookSection>
  );
}

function PlaybookSection({
  id, title, isOpen, onToggle, children, rightAction,
}: {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  rightAction?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30">
        <button onClick={onToggle} className="flex items-center gap-2 text-sm font-semibold flex-1 text-left">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
        </button>
        {rightAction}
      </div>
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
}
