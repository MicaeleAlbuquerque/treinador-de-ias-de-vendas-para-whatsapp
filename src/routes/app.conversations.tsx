import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyRole } from "@/lib/user-role";
import { Upload, MessageCircle, Smartphone, Search, Trash2, AlertTriangle, X, Mic } from "lucide-react";
import { toast } from "sonner";
import {
  cleanupInvalidConversations,
  wipeEvolutionConversations,
  wipeUploadConversations,
  deleteConversation,
  deleteMultipleConversations,
  processPendingTranscriptionsNow,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/app/conversations")({
  component: ConversationsLayout,
});

function ConversationsLayout() {
  const match = useMatchRoute();
  const isIndex = !!match({ to: "/app/conversations", fuzzy: false });
  return isIndex ? <ConversationsList /> : <Outlet />;
}

type ConvRow = {
  id: string;
  seller_id: string | null;
  lead_phone: string;
  lead_name_anon: string | null;
  source: string;
  outcome: string;
  outcome_value?: number | null;
  last_msg_at: string | null;
  message_count: number;
  sellers?: { name: string } | null;
  preview?: string | null;
};

const OUTCOME_BADGE: Record<string, string> = {
  won: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800",
  lost: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  unknown: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
};

const OUTCOME_LABEL: Record<string, string> = {
  won: "Ganha",
  lost: "Perdida",
  in_progress: "Em andamento",
  unknown: "Sem marca",
};

function ConversationsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role } = useMyRole();
  const qc = useQueryClient();

  const [filterSeller, setFilterSeller] = useState<string>("all");
  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [search, setSearch] = useState("");

  const sellersQ = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data } = await supabase.from("sellers").select("id, name, active").order("name");
      return data ?? [];
    },
  });

  const convQ = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select(
          "id, seller_id, lead_phone, lead_name_anon, source, outcome, outcome_value, last_msg_at, message_count, sellers ( name )",
        )
        .order("last_msg_at", { ascending: false, nullsFirst: false })
        .limit(200);
      return (data ?? []) as ConvRow[];
    },
  });

  const instanceQ = useQuery({
    queryKey: ["whatsapp-instance"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id, status")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const audioStatsQ = useQuery({
    queryKey: ["audio-stats"],
    queryFn: async () => {
      const total = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("media_type", "audio");
      const transcribed = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("media_type", "audio")
        .not("audio_transcript", "is", null);
      return { total: total.count ?? 0, transcribed: transcribed.count ?? 0 };
    },
  });

  const filtered = useMemo(() => {
    const all = convQ.data ?? [];
    return all.filter((c) => {
      if (filterSeller === "unassigned" && c.seller_id) return false;
      if (filterSeller !== "all" && filterSeller !== "unassigned" && c.seller_id !== filterSeller) return false;
      if (filterOutcome !== "all" && c.outcome !== filterOutcome) return false;
      if (filterSource !== "all" && c.source !== filterSource) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${c.lead_name_anon ?? ""} ${c.lead_phone} ${c.sellers?.name ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [convQ.data, filterSeller, filterOutcome, filterSource, search]);

  const kpis = useMemo(() => {
    const all = convQ.data ?? [];
    const total = all.length;
    const withSeller = all.filter((c) => c.seller_id).length;
    const withOutcome = all.filter((c) => c.outcome !== "unknown").length;
    const invalid = all.filter((c) => !c.lead_phone || !/^\+?\d{6,20}$/.test(c.lead_phone) || (c.message_count ?? 0) === 0).length;
    const wonConvs = all.filter((c) => c.outcome === "won");
    const totalWonValue = wonConvs.reduce((acc, c) => acc + (c.outcome_value ? Number(c.outcome_value) : 0), 0);
    return {
      total,
      pctSeller: total ? Math.round((withSeller / total) * 100) : 0,
      pctOutcome: total ? Math.round((withOutcome / total) * 100) : 0,
      invalid,
      totalWonValue,
      formattedWonValue:
        totalWonValue > 0
          ? `R$ ${totalWonValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "R$ 0,00",
    };
  }, [convQ.data]);

  const cleanupFn = useServerFn(cleanupInvalidConversations);
  const wipeFn = useServerFn(wipeEvolutionConversations);
  const wipeUploadFn = useServerFn(wipeUploadConversations);
  const deleteConvFn = useServerFn(deleteConversation);
  const deleteMultipleConvFn = useServerFn(deleteMultipleConversations);
  const processPendingTranscribeFn = useServerFn(processPendingTranscriptionsNow);
  const [cleaning, setCleaning] = useState(false);
  const [transcribingPending, setTranscribingPending] = useState(false);

  async function handleTranscribePendingAudios() {
    setTranscribingPending(true);
    try {
      const res = await processPendingTranscribeFn({});
      if (res.processed > 0) {
        toast.success(`${res.processed} áudio(s) transcrito(s) com sucesso!`);
      } else if (res.remaining === 0) {
        toast.info("Todos os áudios já foram transcritos.");
      } else {
        toast.warning(`${res.failed} áudio(s) falharam ou não possuem arquivo de mídia.`);
      }
      audioStatsQ.refetch();
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTranscribingPending(false);
    }
  }
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal unificado de exclusão (Evolution + Upload)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalOriginFilter, setModalOriginFilter] = useState<"all" | "evolution" | "upload">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteAllChecked, setDeleteAllChecked] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  // Carrega todas as conversas do sistema para o modal de exclusão
  const modalConvsQ = useQuery({
    queryKey: ["conversations-to-delete"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, seller_id, lead_phone, lead_name_anon, source, outcome, last_msg_at, message_count, sellers ( name )",
        )
        .order("last_msg_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ConvRow[];
    },
    enabled: isDeleteModalOpen,
  });

  const modalConvsAll = modalConvsQ.data ?? [];
  const countEvolution = modalConvsAll.filter((c) => c.source === "evolution").length;
  const countUpload = modalConvsAll.filter((c) => c.source === "upload").length;
  const countTotal = modalConvsAll.length;

  const modalFilteredConvs = useMemo(() => {
    return modalConvsAll.filter((c) => {
      if (modalOriginFilter !== "all" && c.source !== modalOriginFilter) return false;
      if (modalSearch.trim()) {
        const q = modalSearch.toLowerCase().trim();
        const text = `${c.lead_name_anon ?? ""} ${c.lead_phone} ${c.sellers?.name ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [modalConvsAll, modalOriginFilter, modalSearch]);

  function openDeleteModal() {
    setIsDeleteModalOpen(true);
    setModalOriginFilter("all");
    setSelectedIds(new Set());
    setDeleteAllChecked(false);
    setModalSearch("");
  }

  async function onExecuteModalDelete() {
    const filterLabel =
      modalOriginFilter === "evolution"
        ? "Evolution (WhatsApp)"
        : modalOriginFilter === "upload"
        ? "Upload manual"
        : "todas as origens (Evolution e Upload)";

    const targetCount =
      modalOriginFilter === "evolution"
        ? countEvolution
        : modalOriginFilter === "upload"
        ? countUpload
        : countTotal;

    if (deleteAllChecked) {
      if (targetCount === 0) {
        toast.info("Nenhuma conversa encontrada para apagar.");
        return;
      }
      if (
        !confirm(
          `APAGAR TODAS as ${targetCount} conversas de ${filterLabel}?\n\nEsta ação é irreversível e removerá permanentemente as conversas, mensagens e históricos associados.`,
        )
      )
        return;

      setIsDeletingBulk(true);
      try {
        let deleted = 0;
        if (modalOriginFilter === "evolution") {
          const r = await wipeFn({});
          deleted = r.deleted;
        } else if (modalOriginFilter === "upload") {
          const r = await wipeUploadFn({});
          deleted = r.deleted;
        } else {
          const r1 = await wipeFn({});
          const r2 = await wipeUploadFn({});
          deleted = r1.deleted + r2.deleted;
        }
        toast.success(`Apagadas todas as ${deleted} conversa(s) de ${filterLabel}.`);
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversations-to-delete"] });
        setIsDeleteModalOpen(false);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setIsDeletingBulk(false);
      }
    } else {
      if (selectedIds.size === 0) {
        toast.error("Nenhuma conversa selecionada para apagar.");
        return;
      }
      if (
        !confirm(
          `Apagar as ${selectedIds.size} conversa(s) selecionada(s)?\n\nEsta ação é irreversível e removerá as mensagens associadas.`,
        )
      )
        return;

      setIsDeletingBulk(true);
      try {
        const ids = Array.from(selectedIds);
        const r = await deleteMultipleConvFn({ data: { conversationIds: ids } });
        toast.success(`Apagadas ${r.deleted} conversa(s) selecionada(s).`);
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversations-to-delete"] });
        setIsDeleteModalOpen(false);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setIsDeletingBulk(false);
      }
    }
  }

  async function onCleanup() {
    if (!confirm(`Apagar conversas inválidas (lead_phone não-numérico ou sem mensagens)? Mensagens caem em cascata. Não desfaz.`)) return;
    setCleaning(true);
    try {
      const r = await cleanupFn({});
      if (r.deleted === 0) toast.info("Nenhuma conversa inválida encontrada.");
      else toast.success(`Removidas ${r.deleted} conversa(s) inválida(s).`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setCleaning(false); }
  }

  async function onDeleteConversation(c: ConvRow, e: React.MouseEvent) {
    e.stopPropagation();
    const label = c.lead_name_anon || c.lead_phone;
    if (!confirm(`Apagar a conversa com ${label}? Mensagens e histórico serão removidos em definitivo.`)) return;
    setDeletingId(c.id);
    try {
      await deleteConvFn({ data: { conversationId: c.id } });
      toast.success("Conversa apagada com sucesso.");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="via-label">Conversas</span>
          <h1 className="mt-1 text-3xl">Histórico</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {kpis.invalid > 0 && (
            <button
              onClick={onCleanup}
              disabled={cleaning}
              className="via-btn via-btn-secondary inline-flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
              title="Remove conversas com telefone inválido ou sem mensagens."
            >
              <Trash2 size={14} /> {cleaning ? "Limpando…" : `Limpar ${kpis.invalid} inválida(s)`}
            </button>
          )}
          <button
            onClick={openDeleteModal}
            disabled={cleaning || isDeletingBulk}
            className="via-btn via-btn-secondary inline-flex items-center gap-2 text-red-700 border-red-300 hover:bg-red-50"
            title="Apagar conversas (Evolution e Upload, específicas ou em massa)."
          >
            <Trash2 size={14} /> Apagar conversas
          </button>
          <Link
            to="/app/conversations/upload"
            onClick={() => {
              try {
                sessionStorage.removeItem("last_imported_conversations");
                sessionStorage.removeItem("last_imported_conv_idx");
              } catch {}
            }}
            className="via-btn via-btn-secondary inline-flex items-center gap-2"
          >
            <Upload size={14} /> Subir export manual
          </Link>
        </div>
      </header>

      {kpis.invalid > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <div className="font-semibold">{kpis.invalid} conversa(s) inválida(s) detectada(s)</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              São conversas com lead_phone não-numérico ou vazias (sem mensagens). Use o botão "Limpar" no header pra remover.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Conversas" value={kpis.total} />
        <Kpi label="Com vendedor" value={`${kpis.pctSeller}%`} />
        <Kpi label="Com outcome" value={`${kpis.pctOutcome}%`} />
        <Kpi label="Receita Ganha" value={kpis.formattedWonValue} />
        <Kpi
          label="Áudios transcritos"
          value={
            audioStatsQ.data && audioStatsQ.data.total
              ? `${Math.round((audioStatsQ.data.transcribed / audioStatsQ.data.total) * 100)}%`
              : "—"
          }
        >
          {audioStatsQ.data && audioStatsQ.data.total > audioStatsQ.data.transcribed ? (
            <button
              type="button"
              disabled={transcribingPending}
              onClick={handleTranscribePendingAudios}
              className="mt-1.5 text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium transition-colors"
              title="Processar transcrição dos áudios pendentes com IA"
            >
              <Mic size={11} className={transcribingPending ? "animate-pulse" : ""} />
              {transcribingPending
                ? "Transcrevendo…"
                : `Transcrever (${audioStatsQ.data.total - audioStatsQ.data.transcribed} pendentes)`}
            </button>
          ) : null}
        </Kpi>
      </div>

      <div className="via-card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="via-label">Buscar</label>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-2.5 text-muted-foreground" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Telefone, vendedor, lead…"
              className="via-input pl-8"
            />
          </div>
        </div>
        <Selector label="Vendedor" value={filterSeller} onChange={setFilterSeller}>
          <option value="all">Todos</option>
          <option value="unassigned">Sem atribuição</option>
          {(sellersQ.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Selector>
        <Selector label="Outcome" value={filterOutcome} onChange={setFilterOutcome}>
          <option value="all">Todos</option>
          <option value="won">Ganha</option>
          <option value="lost">Perdida</option>
          <option value="in_progress">Em andamento</option>
          <option value="unknown">Sem marca</option>
        </Selector>
        <Selector label="Origem" value={filterSource} onChange={setFilterSource}>
          <option value="all">Todas</option>
          <option value="evolution">WhatsApp</option>
          <option value="upload">Upload</option>
        </Selector>
      </div>

      {convQ.isLoading ? (
        <div className="via-card text-muted-foreground text-sm">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="via-card flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--via-blue-light)] text-[color:var(--via-blue)]">
            <MessageCircle size={22} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg">Nenhuma conversa por aqui</h3>
          {instanceQ.data?.status === "connected" ? (
            <>
              <p className="text-sm text-muted-foreground max-w-md">
                WhatsApp conectado, mas o histórico ainda não foi importado. Novas mensagens aparecem em tempo real; pra trazer o que veio antes, importe o histórico.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <a href="/app/settings?tab=whatsapp#importar" className="via-btn via-btn-primary via-btn-sm">
                  Importar histórico agora
                </a>
                <Link
                  to="/app/conversations/upload"
                  onClick={() => {
                    try {
                      sessionStorage.removeItem("last_imported_conversations");
                      sessionStorage.removeItem("last_imported_conv_idx");
                    } catch {}
                  }}
                  className="via-btn via-btn-secondary via-btn-sm"
                >
                  Subir export manual
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground max-w-md">
                Conecte o WhatsApp via Evolution pra começar a ingerir conversas em tempo real, ou suba um export manual <code className="text-xs">.txt</code> do WhatsApp.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <a href="/app/settings?tab=whatsapp" className="via-btn via-btn-primary via-btn-sm">
                  Conectar WhatsApp
                </a>
                <Link
                  to="/app/conversations/upload"
                  onClick={() => {
                    try {
                      sessionStorage.removeItem("last_imported_conversations");
                      sessionStorage.removeItem("last_imported_conv_idx");
                    } catch {}
                  }}
                  className="via-btn via-btn-secondary via-btn-sm"
                >
                  Subir export manual
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="via-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Lead</th>
                <th className="px-4 py-2 text-left">Vendedor</th>
                <th className="px-4 py-2 text-left">Mensagens</th>
                <th className="px-4 py-2 text-left">Outcome</th>
                <th className="px-4 py-2 text-left">Origem</th>
                <th className="px-4 py-2 text-left">Última msg</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate({ to: "/app/conversations/$id", params: { id: c.id } })}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.lead_name_anon ?? "Lead"}</span>
                      {!/^\+?\d{6,20}$/.test(c.lead_phone) && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-700">
                          <AlertTriangle size={10} /> inválida
                        </span>
                      )}
                    </div>
                    <div className={`text-xs ${/^\+?\d{6,20}$/.test(c.lead_phone) ? "text-muted-foreground" : "text-red-600 font-mono truncate max-w-[200px]"}`} title={c.lead_phone}>
                      {c.lead_phone}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.sellers?.name ?? <span className="italic text-amber-700">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.message_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${OUTCOME_BADGE[c.outcome] ?? OUTCOME_BADGE.unknown}`}>
                        {OUTCOME_LABEL[c.outcome] ?? c.outcome}
                      </span>
                      {c.outcome === "won" && c.outcome_value != null && (
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          R$ {Number(c.outcome_value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {c.source === "upload" ? <Upload size={12} /> : <Smartphone size={12} />}
                      {c.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.last_msg_at ? new Date(c.last_msg_at).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => onDeleteConversation(c, e)}
                      disabled={deletingId === c.id}
                      className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                      title="Apagar esta conversa"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal unificado de exclusão de conversas (Evolution + Upload) */}
      {isDeleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => !isDeletingBulk && setIsDeleteModalOpen(false)}
        >
          <div
            className="via-card w-full max-w-3xl flex flex-col max-h-[90vh] p-0 overflow-hidden shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Apagar conversas</h3>
                  <p className="text-xs text-muted-foreground">
                    Filtre por tipo (Evolution ou Upload), selecione conversas específicas ou apague em massa.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDeletingBulk && setIsDeleteModalOpen(false)}
                disabled={isDeletingBulk}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
              {/* Filtro por Origem (Evolution / Upload / Todas) */}
              <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border text-xs font-medium w-fit flex-wrap">
                <button
                  type="button"
                  onClick={() => setModalOriginFilter("all")}
                  disabled={isDeletingBulk}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    modalOriginFilter === "all"
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Todas ({countTotal})
                </button>
                <button
                  type="button"
                  onClick={() => setModalOriginFilter("evolution")}
                  disabled={isDeletingBulk}
                  className={`px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 ${
                    modalOriginFilter === "evolution"
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Smartphone size={13} className="text-blue-500" />
                  WhatsApp / Evolution ({countEvolution})
                </button>
                <button
                  type="button"
                  onClick={() => setModalOriginFilter("upload")}
                  disabled={isDeletingBulk}
                  className={`px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 ${
                    modalOriginFilter === "upload"
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Upload size={13} className="text-purple-500" />
                  Upload manual ({countUpload})
                </button>
              </div>

              {/* Checkbox para apagar todas as conversas do filtro atual */}
              <div
                className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                  deleteAllChecked
                    ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800"
                    : "bg-muted/40 border-border hover:border-border/80"
                }`}
                onClick={() => setDeleteAllChecked(!deleteAllChecked)}
              >
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteAllChecked}
                    onChange={(e) => setDeleteAllChecked(e.target.checked)}
                    disabled={isDeletingBulk}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-foreground flex items-center gap-2">
                      {modalOriginFilter === "all"
                        ? "Apagar TODAS as conversas (Evolution e Upload)"
                        : modalOriginFilter === "evolution"
                        ? "Apagar TODAS as conversas de Evolution separadamente"
                        : "Apagar TODAS as conversas de Upload separadamente"}
                      <span className="text-xs font-normal text-muted-foreground">
                        (
                        {modalOriginFilter === "evolution"
                          ? countEvolution
                          : modalOriginFilter === "upload"
                          ? countUpload
                          : countTotal}{" "}
                        no total)
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {modalOriginFilter === "all"
                        ? "Esta opção apaga todas as conversas do histórico (ambas as origens) em definitivo."
                        : modalOriginFilter === "evolution"
                        ? "Esta opção apaga apenas as conversas vindas da Evolution, mantendo os uploads manuais intactos."
                        : "Esta opção apaga apenas as conversas de upload manual, mantendo as conversas da Evolution intactas."}
                    </p>
                  </div>
                </label>
              </div>

              {/* Se não marcou "Apagar TODAS", mostra a lista com busca e seleção individual */}
              {!deleteAllChecked ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs font-medium text-muted-foreground">
                      Ou selecione conversas específicas ({selectedIds.size} selecionada(s)):
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedIds.size === modalFilteredConvs.length && modalFilteredConvs.length > 0) {
                            setSelectedIds(new Set());
                          } else {
                            setSelectedIds(new Set(modalFilteredConvs.map((c) => c.id)));
                          }
                        }}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        {selectedIds.size === modalFilteredConvs.length && modalFilteredConvs.length > 0
                          ? "Desmarcar todas"
                          : `Selecionar todas deste filtro (${modalFilteredConvs.length})`}
                      </button>
                    </div>
                  </div>

                  {/* Campo de busca no modal */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 text-muted-foreground" size={14} />
                    <input
                      type="text"
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      placeholder="Buscar por lead, telefone ou vendedor nesta lista…"
                      className="via-input pl-8 py-1.5 text-xs w-full"
                    />
                  </div>

                  {/* Lista com scroll e checkboxes individuais */}
                  <div className="border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                    {modalConvsQ.isLoading ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">Carregando conversas…</div>
                    ) : modalFilteredConvs.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        Nenhuma conversa encontrada para o filtro aplicado.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {modalFilteredConvs.map((c) => {
                          const isChecked = selectedIds.has(c.id);
                          return (
                            <div
                              key={c.id}
                              onClick={() => {
                                const next = new Set(selectedIds);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                setSelectedIds(next);
                              }}
                              className={`p-3 flex items-center gap-3 text-sm cursor-pointer transition-colors ${
                                isChecked ? "bg-red-50/50 dark:bg-red-950/20" : "hover:bg-muted/50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // tratado no click da linha
                                className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium truncate">{c.lead_name_anon || "Lead"}</span>
                                  <span className="text-xs text-muted-foreground font-mono">{c.lead_phone}</span>
                                  {c.source === "evolution" ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950/50 text-blue-700 font-medium">
                                      <Smartphone size={10} /> Evolution
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/50 text-purple-700 font-medium">
                                      <Upload size={10} /> Upload
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span>Vendedor: {c.sellers?.name ?? "—"}</span>
                                  <span>•</span>
                                  <span>{c.message_count} msgs</span>
                                  {c.last_msg_at && (
                                    <>
                                      <span>•</span>
                                      <span>{new Date(c.last_msg_at).toLocaleDateString("pt-BR")}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                                  OUTCOME_BADGE[c.outcome] ?? OUTCOME_BADGE.unknown
                                }`}
                              >
                                {OUTCOME_LABEL[c.outcome] ?? c.outcome}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Exclusão total ativada</div>
                    <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                      {modalOriginFilter === "all"
                        ? `Todas as ${countTotal} conversas (Evolution e Upload) serão permanentemente apagadas com suas mensagens e dados associados.`
                        : modalOriginFilter === "evolution"
                        ? `Todas as ${countEvolution} conversas da Evolution serão permanentemente apagadas. Os uploads manuais serão mantidos.`
                        : `Todas as ${countUpload} conversas de upload manual serão permanentemente apagadas. As conversas da Evolution serão mantidas.`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border flex items-center justify-between gap-3 bg-muted/20">
              <button
                type="button"
                onClick={() => !isDeletingBulk && setIsDeleteModalOpen(false)}
                disabled={isDeletingBulk}
                className="via-btn via-btn-secondary text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onExecuteModalDelete}
                disabled={
                  isDeletingBulk ||
                  (!deleteAllChecked && selectedIds.size === 0) ||
                  (deleteAllChecked &&
                    (modalOriginFilter === "evolution"
                      ? countEvolution === 0
                      : modalOriginFilter === "upload"
                      ? countUpload === 0
                      : countTotal === 0))
                }
                className="via-btn inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
              >
                <Trash2 size={14} />
                {isDeletingBulk
                  ? "Apagando conversas…"
                  : deleteAllChecked
                  ? `Apagar TODAS as ${
                      modalOriginFilter === "evolution"
                        ? countEvolution
                        : modalOriginFilter === "upload"
                        ? countUpload
                        : countTotal
                    } conversas`
                  : `Apagar ${selectedIds.size} selecionada(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  children,
}: {
  label: string;
  value: string | number;
  children?: React.ReactNode;
}) {
  return (
    <div className="via-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {children}
    </div>
  );
}

function Selector({
  label, value, onChange, children,
}: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div>
      <label className="via-label">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="via-input mt-1">
        {children}
      </select>
    </div>
  );
}
