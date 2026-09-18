import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyRole } from "@/lib/user-role";
import { ensureDemoSeed } from "@/lib/whatsapp.functions";
import { Upload, MessageCircle, Smartphone, Search, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cleanupInvalidConversations, wipeEvolutionConversations, wipeUploadConversations, wipeDemoConversations, deleteConversation } from "@/lib/whatsapp.functions";

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
  const seedFn = useServerFn(ensureDemoSeed);

  const [filterSeller, setFilterSeller] = useState<string>("all");
  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Fire-and-forget demo seed on first admin visit
  useEffect(() => {
    if (!user || role !== "admin") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await seedFn();
        if (cancelled) return;
        if ((r as any)?.seeded) {
          toast.success("Conversas de demonstração carregadas");
          qc.invalidateQueries({ queryKey: ["conversations"] });
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, role, seedFn, qc]);

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
          "id, seller_id, lead_phone, lead_name_anon, source, outcome, last_msg_at, message_count, sellers ( name )",
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
    return {
      total,
      pctSeller: total ? Math.round((withSeller / total) * 100) : 0,
      pctOutcome: total ? Math.round((withOutcome / total) * 100) : 0,
      invalid,
    };
  }, [convQ.data]);

  const cleanupFn = useServerFn(cleanupInvalidConversations);
  const wipeFn = useServerFn(wipeEvolutionConversations);
  const wipeUploadFn = useServerFn(wipeUploadConversations);
  const wipeDemoFn = useServerFn(wipeDemoConversations);
  const deleteConvFn = useServerFn(deleteConversation);
  const [cleaning, setCleaning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
  async function onWipeEvolution() {
    if (!confirm("APAGAR TODAS as conversas vindas da Evolution? (preserva demo e uploads manuais). Use isso quando quiser re-importar do zero. NÃO desfaz.")) return;
    if (!confirm("Confirma APAGAR EM DEFINITIVO?")) return;
    setCleaning(true);
    try {
      const r = await wipeFn({});
      toast.success(`Apagadas ${r.deleted} conversa(s) da Evolution. Pronto pra re-importar.`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setCleaning(false); }
  }
  async function onWipeUpload() {
    if (!confirm("APAGAR TODAS as conversas vindas de upload manual? (preserva Evolution e demo). NÃO desfaz.")) return;
    if (!confirm("Confirma APAGAR EM DEFINITIVO as conversas de upload?")) return;
    setCleaning(true);
    try {
      const r = await wipeUploadFn({});
      if (r.deleted === 0) toast.info("Nenhuma conversa de upload encontrada.");
      else toast.success(`Apagadas ${r.deleted} conversa(s) de upload.`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setCleaning(false); }
  }
  async function onWipeDemo() {
    if (!confirm("APAGAR TODAS as conversas de demonstração (demo)? (preserva Evolution e uploads). NÃO desfaz.")) return;
    if (!confirm("Confirma APAGAR EM DEFINITIVO as conversas demo?")) return;
    setCleaning(true);
    try {
      const r = await wipeDemoFn({});
      if (r.deleted === 0) toast.info("Nenhuma conversa de demonstração encontrada.");
      else toast.success(`Apagadas ${r.deleted} conversa(s) de demonstração.`);
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
            onClick={onWipeEvolution}
            disabled={cleaning}
            className="via-btn via-btn-secondary inline-flex items-center gap-2 text-red-700 border-red-300 hover:bg-red-50"
            title="Apaga TODAS conversas vindas da Evolution (preserva demo + uploads). Pra re-importar do zero."
          >
            <Trash2 size={14} /> Apagar tudo Evolution
          </button>
          <button
            onClick={onWipeUpload}
            disabled={cleaning}
            className="via-btn via-btn-secondary inline-flex items-center gap-2 text-red-700 border-red-300 hover:bg-red-50"
            title="Apaga TODAS conversas vindas de upload manual (preserva Evolution e demo)."
          >
            <Trash2 size={14} /> Apagar tudo Upload
          </button>
          <button
            onClick={onWipeDemo}
            disabled={cleaning}
            className="via-btn via-btn-secondary inline-flex items-center gap-2 text-red-700 border-red-300 hover:bg-red-50"
            title="Apaga TODAS conversas de demonstração (demo)."
          >
            <Trash2 size={14} /> Apagar tudo Demo
          </button>
          <Link to="/app/conversations/upload" className="via-btn via-btn-secondary inline-flex items-center gap-2">
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Conversas" value={kpis.total} />
        <Kpi label="Com vendedor" value={`${kpis.pctSeller}%`} />
        <Kpi label="Com outcome" value={`${kpis.pctOutcome}%`} />
        <Kpi
          label="Áudios transcritos"
          value={
            audioStatsQ.data && audioStatsQ.data.total
              ? `${Math.round((audioStatsQ.data.transcribed / audioStatsQ.data.total) * 100)}%`
              : "—"
          }
        />
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
          <option value="demo">Demo</option>
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
                <a href="/app/conversations/upload" className="via-btn via-btn-secondary via-btn-sm">
                  Subir export manual
                </a>
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
                <a href="/app/conversations/upload" className="via-btn via-btn-secondary via-btn-sm">
                  Subir export manual
                </a>
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
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${OUTCOME_BADGE[c.outcome] ?? OUTCOME_BADGE.unknown}`}>
                      {OUTCOME_LABEL[c.outcome] ?? c.outcome}
                    </span>
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
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="via-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
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
