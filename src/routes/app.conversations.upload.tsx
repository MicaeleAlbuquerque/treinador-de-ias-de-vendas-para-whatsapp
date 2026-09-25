import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { uploadMultipleWhatsAppExports } from "@/lib/whatsapp.functions";
import { parseWhatsAppExport } from "@/lib/whatsapp-parser";
import { tagConversation } from "@/lib/analysis.functions";
import {
  ChevronLeft,
  Upload,
  FileArchive,
  FileText,
  Clock,
  Phone,
  User,
  CheckCircle2,
  Trash2,
  ExternalLink,
  MessageSquare,
  Plus,
  Check,
  X,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/conversations/upload")({
  component: UploadPage,
});

interface PendingItem {
  id: string;
  fileName: string;
  fileText: string;
  messageCount: number;
  leadPhone: string;
  detectedName?: string;
}

interface ImportedItem {
  conversationId: string;
  fileName: string;
  leadPhone: string;
  leadNameAnon: string;
  sellerName: string;
  messageCount: number;
  audioCount: number;
  firstMsgAt: string | null;
  lastMsgAt: string | null;
  outcome?: string;
  outcomeValue?: number | null;
  messages: Array<{
    sender_role: string;
    ts: string;
    text: string | null;
    media_type: string;
  }>;
}

const OUTCOME_BADGE: Record<string, string> = {
  won: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800",
  lost: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  unknown: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
};

const OUTCOME_LABEL: Record<string, string> = {
  won: "Ganha (Won)",
  lost: "Perdida (Lost)",
  in_progress: "Em andamento",
  unknown: "Sem marca",
};

function formatMessageTime(ts: string) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${dateStr} às ${timeStr}`;
  } catch {
    return ts;
  }
}

function UploadPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const uploadMultipleFn = useServerFn(uploadMultipleWhatsAppExports);
  const tagFn = useServerFn(tagConversation);

  const [sellerId, setSellerId] = useState("");
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [sendingSingleId, setSendingSingleId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [wonValue, setWonValue] = useState<string>("");
  const [tagging, setTagging] = useState(false);

  // Inicializa estado de pós-importação somente se vier com ?resume=1 (ex: voltando de detalhes)
  const [importedResults, setImportedResults] = useState<ImportedItem[] | null>(() => {
    try {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("resume") === "1") {
          const saved = sessionStorage.getItem("last_imported_conversations");
          return saved ? JSON.parse(saved) : null;
        }
        // Se acessou diretamente ou clicou em subir export manual, limpa resumos anteriores
        sessionStorage.removeItem("last_imported_conversations");
        sessionStorage.removeItem("last_imported_conv_idx");
      }
      return null;
    } catch {
      return null;
    }
  });

  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(() => {
    try {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("resume") === "1") {
          const savedIdx = sessionStorage.getItem("last_imported_conv_idx");
          return savedIdx ? Number(savedIdx) : 0;
        }
      }
      return 0;
    } catch {
      return 0;
    }
  });

  // Salva no sessionStorage para que telas de detalhes possam voltar ao resumo via ?resume=1
  useEffect(() => {
    try {
      if (importedResults && importedResults.length > 0) {
        sessionStorage.setItem("last_imported_conversations", JSON.stringify(importedResults));
        sessionStorage.setItem("last_imported_conv_idx", String(selectedResultIndex));
      } else {
        sessionStorage.removeItem("last_imported_conversations");
        sessionStorage.removeItem("last_imported_conv_idx");
      }
    } catch {
      // ignore
    }
  }, [importedResults, selectedResultIndex]);

  const sellersQ = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sellers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  async function processFilesList(files: FileList | File[]) {
    setExtracting(true);
    const newItems: PendingItem[] = [];

    for (const f of Array.from(files)) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(f);
          const txtFileNames = Object.keys(zip.files).filter(
            (name) =>
              name.toLowerCase().endsWith(".txt") &&
              !name.startsWith("__MACOSX") &&
              !zip.files[name]!.dir,
          );

          if (txtFileNames.length === 0) {
            toast.warning(`Nenhum arquivo .txt de conversa encontrado dentro de "${f.name}".`);
            continue;
          }

          for (const txtName of txtFileNames) {
            const text = await zip.files[txtName]!.async("string");
            const parsed = parseWhatsAppExport(text);
            if (parsed.length === 0) continue;

            const firstLead = parsed.find((p) => !p.isSystem)?.authorName ?? "Lead";
            const digits = firstLead.replace(/\D/g, "");
            const suggestedPhone = digits.length >= 8 && digits.length <= 15 ? (firstLead.trim().startsWith("+") ? `+${digits}` : digits) : "";

            newItems.push({
              id: `${f.name}-${txtName}-${Date.now()}-${Math.random()}`,
              fileName: `${f.name} > ${txtName.split("/").pop()}`,
              fileText: text,
              leadPhone: suggestedPhone,
              detectedName: firstLead,
              messageCount: parsed.length,
            });
          }
        } catch (err) {
          toast.error(`Erro ao descompactar "${f.name}": ${(err as Error).message}`);
        }
      } else if (f.name.toLowerCase().endsWith(".txt")) {
        try {
          const text = await f.text();
          const parsed = parseWhatsAppExport(text);
          const firstLead = parsed.find((p) => !p.isSystem)?.authorName ?? "Lead";
          const digits = firstLead.replace(/\D/g, "");
          const suggestedPhone = digits.length >= 8 && digits.length <= 15 ? (firstLead.trim().startsWith("+") ? `+${digits}` : digits) : "";

          newItems.push({
            id: `${f.name}-${Date.now()}-${Math.random()}`,
            fileName: f.name,
            fileText: text,
            leadPhone: suggestedPhone,
            detectedName: firstLead,
            messageCount: parsed.length,
          });
        } catch (err) {
          toast.error(`Erro ao ler "${f.name}": ${(err as Error).message}`);
        }
      } else {
        toast.info(`Formato não suportado: "${f.name}". Envie .txt ou .zip.`);
      }
    }

    setExtracting(false);

    if (newItems.length > 0) {
      setPendingItems((prev) => [...prev, ...newItems]);
      toast.success(`${newItems.length} conversa(s) carregada(s) para importação.`);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      processFilesList(e.target.files);
      e.target.value = "";
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFilesList(e.dataTransfer.files);
    }
  }

  function updateLeadPhone(id: string, phone: string) {
    setPendingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, leadPhone: phone } : item)),
    );
  }

  function removeItem(id: string) {
    setPendingItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function submitSingleItem(item: PendingItem) {
    if (!sellerId) {
      toast.error("Selecione o vendedor responsável antes de enviar.");
      return;
    }
    setSendingSingleId(item.id);
    try {
      const res = await uploadMultipleFn({
        data: {
          sellerId,
          items: [
            {
              fileName: item.fileName,
              fileText: item.fileText,
              leadPhone: item.leadPhone.trim() || undefined,
            },
          ],
        },
      });

      if (res.total > 0) {
        toast.success(`Conversa "${item.fileName}" enviada com sucesso para Conversas!`);
        qc.invalidateQueries({ queryKey: ["conversations"] });
        // Remove apenas este item da lista de pendentes
        setPendingItems((prev) => prev.filter((p) => p.id !== item.id));

        // Adiciona aos resultados importados para permitir conferência imediata
        setImportedResults((prev) => {
          const list = prev ? [...prev] : [];
          return [...(res.items as ImportedItem[]), ...list];
        });
        setSelectedResultIndex(0);
      } else {
        toast.error("Nenhuma mensagem válida foi importada deste arquivo.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSendingSingleId(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sellerId) {
      toast.error("Selecione o vendedor responsável pelas conversas.");
      return;
    }
    if (pendingItems.length === 0) {
      toast.error("Adicione pelo menos um arquivo de conversa.");
      return;
    }

    setBusy(true);
    try {
      const res = await uploadMultipleFn({
        data: {
          sellerId,
          items: pendingItems.map((p) => ({
            fileName: p.fileName,
            fileText: p.fileText,
            leadPhone: p.leadPhone.trim() || undefined,
          })),
        },
      });

      if (res.total > 0) {
        toast.success(`${res.total} conversa(s) importada(s) com sucesso!`);
        qc.invalidateQueries({ queryKey: ["conversations"] });
        setImportedResults(res.items as ImportedItem[]);
        setSelectedResultIndex(0);
      } else {
        toast.error("Nenhuma mensagem válida foi importada dos arquivos enviados.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTagSummary(
    conversationId: string,
    outcome: "won" | "lost" | "in_progress" | "unknown",
    value?: number | null,
  ) {
    setTagging(true);
    try {
      await tagFn({
        data: {
          conversationId,
          outcome,
          outcomeValue: value ?? null,
        },
      });
      const label =
        outcome === "won"
          ? "Conversa marcada como Ganha (Won)!"
          : outcome === "lost"
          ? "Conversa marcada como Perdida (Lost)!"
          : outcome === "in_progress"
          ? "Conversa marcada como Em andamento!"
          : "Outcome desmarcado!";
      toast.success(label);

      // Atualiza o outcome no estado local
      setImportedResults((prev) =>
        prev
          ? prev.map((item) =>
              item.conversationId === conversationId
                ? { ...item, outcome, outcomeValue: value ?? null }
                : item,
            )
          : null,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTagging(false);
    }
  }

  // ==========================================
  // RENDERIZAÇÃO: RESUMO PÓS-IMPORTAÇÃO COM CONTEÚDO E STATUS WON/LOST
  // ==========================================
  if (importedResults && importedResults.length > 0) {
    const currentConv = importedResults[selectedResultIndex] || importedResults[0];

    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setImportedResults(null);
              setPendingItems([]);
              try {
                sessionStorage.removeItem("last_imported_conversations");
                sessionStorage.removeItem("last_imported_conv_idx");
              } catch {}
              navigate({ to: "/app/conversations" });
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={14} /> Voltar para lista de conversas
          </button>
          <button
            type="button"
            onClick={() => {
              setImportedResults(null);
              setPendingItems([]);
              try {
                sessionStorage.removeItem("last_imported_conversations");
                sessionStorage.removeItem("last_imported_conv_idx");
              } catch {}
            }}
            className="via-btn via-btn-secondary text-xs inline-flex items-center gap-1"
          >
            <Plus size={14} /> Subir novas conversas
          </button>
        </div>

        {/* Banner de Sucesso */}
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-green-900 dark:text-green-200">
                Importação concluída com sucesso!
              </h2>
              <p className="text-xs text-green-700 dark:text-green-400">
                {importedResults.length === 1
                  ? "1 conversa foi processada e salva no banco de dados."
                  : `${importedResults.length} conversas foram processadas e salvas no banco de dados.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setImportedResults(null);
              setPendingItems([]);
              try {
                sessionStorage.removeItem("last_imported_conversations");
                sessionStorage.removeItem("last_imported_conv_idx");
              } catch {}
              navigate({ to: "/app/conversations" });
            }}
            className="via-btn via-btn-primary text-xs inline-flex items-center gap-1.5 font-semibold shadow-sm"
          >
            <Check size={14} /> Confirmar e ir para lista de conversas
          </button>
        </div>

        {/* Seletor de Conversa se houver mais de uma */}
        {importedResults.length > 1 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Conversas importadas ({importedResults.length}) — selecione para revisar desfecho e conteúdo:
            </div>
            <div className="flex flex-wrap gap-2">
              {importedResults.map((item, idx) => (
                <button
                  key={item.conversationId}
                  type="button"
                  onClick={() => setSelectedResultIndex(idx)}
                  className={`px-3 py-2 text-xs rounded-lg border font-medium transition-all text-left flex items-center gap-2 ${
                    selectedResultIndex === idx
                      ? "border-[color:var(--via-blue)] bg-[color:var(--via-blue)]/10 text-foreground font-semibold shadow-sm"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MessageSquare size={14} />
                  <span>{item.leadPhone || item.leadNameAnon}</span>
                  <span className="text-[10px] opacity-75 font-normal">({item.messageCount} msgs)</span>
                  {item.outcome && item.outcome !== "unknown" && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        OUTCOME_BADGE[item.outcome]
                      }`}
                    >
                      {item.outcome === "won"
                        ? "Won"
                        : item.outcome === "lost"
                        ? "Lost"
                        : "Andamento"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Card de Desfecho (Won / Lost / Em andamento) */}
        <div className="via-card space-y-3 bg-secondary/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Desfecho da conversa:
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  OUTCOME_BADGE[currentConv.outcome ?? "unknown"]
                }`}
              >
                {OUTCOME_LABEL[currentConv.outcome ?? "unknown"]}
              </span>
              {currentConv.outcome === "won" && currentConv.outcomeValue != null && (
                <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                  R$ {Number(currentConv.outcomeValue).toLocaleString("pt-BR")}
                </span>
              )}
            </div>

            <span className="text-[11px] text-muted-foreground">
              Define o sinal de fechamento para o DNA do time
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={tagging}
              onClick={() => handleTagSummary(currentConv.conversationId, "won", wonValue ? Number(wonValue) : null)}
              className={`via-btn via-btn-sm inline-flex items-center gap-1.5 ${
                currentConv.outcome === "won"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "via-btn-secondary"
              }`}
            >
              <Check size={14} className={currentConv.outcome === "won" ? "text-white" : "text-green-600"} />
              Marcar Won (Ganha)
            </button>

            <div className="inline-flex items-center gap-1">
              <span className="text-xs text-muted-foreground">R$</span>
              <input
                type="number"
                placeholder="Valor R$"
                value={wonValue}
                onChange={(e) => setWonValue(e.target.value)}
                className="via-input w-24 text-xs py-1 px-2"
              />
            </div>

            <button
              type="button"
              disabled={tagging}
              onClick={() => handleTagSummary(currentConv.conversationId, "lost")}
              className={`via-btn via-btn-sm inline-flex items-center gap-1.5 ${
                currentConv.outcome === "lost"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "via-btn-secondary"
              }`}
            >
              <X size={14} className={currentConv.outcome === "lost" ? "text-white" : "text-red-500"} />
              Marcar Lost (Perdida)
            </button>

            <button
              type="button"
              disabled={tagging}
              onClick={() => handleTagSummary(currentConv.conversationId, "in_progress")}
              className={`via-btn via-btn-sm inline-flex items-center gap-1.5 ${
                currentConv.outcome === "in_progress"
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "via-btn-secondary"
              }`}
            >
              <Clock size={14} className={currentConv.outcome === "in_progress" ? "text-white" : "text-amber-500"} />
              Em andamento
            </button>

            {currentConv.outcome && currentConv.outcome !== "unknown" && (
              <button
                type="button"
                disabled={tagging}
                onClick={() => handleTagSummary(currentConv.conversationId, "unknown", null)}
                className="via-btn via-btn-sm via-btn-secondary inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                title="Desmarcar desfecho"
              >
                <RotateCcw size={13} /> Desmarcar
              </button>
            )}
          </div>
        </div>

        {/* Card Resumo da Conversa Selecionada */}
        <div className="via-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold">{currentConv.leadNameAnon}</h3>
                <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                  {currentConv.fileName}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Phone size={13} className="text-[color:var(--via-blue)]" />
                  <span>Telefone do lead: <strong>{currentConv.leadPhone}</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <User size={13} className="text-[color:var(--via-blue)]" />
                  <span>Vendedor: <strong>{currentConv.sellerName}</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <MessageSquare size={13} className="text-[color:var(--via-blue)]" />
                  <span><strong>{currentConv.messageCount}</strong> mensagens ({currentConv.audioCount} áudios)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/app/conversations"
                className="via-btn via-btn-primary text-xs inline-flex items-center gap-1.5 font-semibold shadow-sm"
              >
                <Check size={13} /> Ir para conversas
              </Link>
              <Link
                to="/app/conversations/$id"
                params={{ id: currentConv.conversationId }}
                className="via-btn via-btn-secondary text-xs inline-flex items-center gap-1.5"
              >
                Abrir detalhes completos <ExternalLink size={12} />
              </Link>
            </div>
          </div>

          {/* Visualização de Mensagens com Horário Exato */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="font-semibold uppercase tracking-wider">Conteúdo da conversa</span>
              <span>Horário e data de envio</span>
            </div>

            <div className="rounded-xl border border-border/80 bg-[#ECE5DD] dark:bg-[#0b141a] p-4 max-h-[550px] overflow-y-auto space-y-3 shadow-inner">
              {currentConv.messages.map((m, mIdx) => {
                if (m.sender_role === "system") {
                  return (
                    <div key={mIdx} className="mx-auto max-w-md text-center text-[11px] text-zinc-600 dark:text-zinc-400 bg-black/5 dark:bg-white/5 py-1 px-3 rounded-full italic">
                      {m.text} · <span className="text-[10px] font-mono">{formatMessageTime(m.ts)}</span>
                    </div>
                  );
                }

                const isSeller = m.sender_role === "seller";
                return (
                  <div key={mIdx} className={`flex ${isSeller ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[82%] rounded-xl px-3.5 py-2.5 shadow-sm text-sm ${
                        isSeller
                          ? "bg-[#DCF8C6] text-zinc-900 dark:bg-[#005c4b] dark:text-[#e9edef] rounded-tr-none"
                          : "bg-white text-zinc-900 dark:bg-[#202c33] dark:text-[#e9edef] rounded-tl-none border border-zinc-200/50 dark:border-none"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] font-bold tracking-wide opacity-80 mb-1 border-b border-black/5 dark:border-white/10 pb-1">
                        <span className={isSeller ? "text-emerald-800 dark:text-emerald-300" : "text-blue-800 dark:text-blue-300"}>
                          {isSeller ? `VENDEDOR (${currentConv.sellerName})` : `LEAD (${currentConv.leadPhone})`}
                        </span>
                        <div className="flex items-center gap-1 font-normal text-[10px] opacity-75">
                          <Clock size={11} />
                          <span>{formatMessageTime(m.ts)}</span>
                        </div>
                      </div>

                      <div className="whitespace-pre-wrap leading-relaxed">
                        {m.media_type === "audio" ? (
                          <div className="italic text-xs flex items-center gap-1 text-zinc-600 dark:text-zinc-300">
                            <span>[Áudio do WhatsApp]</span>
                          </div>
                        ) : (
                          m.text || <span className="italic opacity-60">[sem texto]</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDERIZAÇÃO: FORMULÁRIO DE UPLOAD
  // ==========================================
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/app/conversations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={14} /> Voltar para conversas
      </Link>

      <header>
        <span className="via-label">Ingestão Manual</span>
        <h1 className="mt-1 text-3xl">Importar conversas do WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          Você pode arrastar <strong>múltiplos arquivos <code>.txt</code></strong>, um <strong>arquivo <code>.zip</code> com diversas conversas</strong>, ou múltiplos arquivos de uma só vez.
        </p>
      </header>

      <form onSubmit={onSubmit} className="via-card space-y-5">
        {/* Vendedor */}
        <div>
          <label className="via-label">Vendedor responsável</label>
          <select
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            required
            className="via-input mt-1"
          >
            <option value="">Selecione o vendedor…</option>
            {(sellersQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {(sellersQ.data ?? []).length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Cadastre vendedores em{" "}
              <Link className="underline" to="/app/settings">
                Configurações → Vendedores
              </Link>.
            </p>
          )}
        </div>

        {/* Área de Drop de Arquivos */}
        <div>
          <label className="via-label">Arquivos de conversas (.txt ou .zip)</label>
          <label
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`mt-1 flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-8 text-center text-sm transition-all ${
              isDragging
                ? "border-[color:var(--via-blue)] bg-[color:var(--via-blue)]/10 text-foreground scale-[1.01]"
                : "border-border bg-secondary/50 text-muted-foreground hover:border-[color:var(--via-blue)] hover:bg-secondary"
            }`}
          >
            <div className="flex items-center gap-2 text-[color:var(--via-blue)]">
              <Upload size={28} />
              <FileArchive size={28} className="text-amber-500" />
            </div>
            <div>
              <span className="font-semibold text-foreground">
                Arraste vários arquivos .txt ou um arquivo .zip com diversas conversas
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Ou clique aqui para selecionar do seu computador (seleção múltipla permitida)
              </p>
            </div>
            <input
              type="file"
              multiple
              accept=".txt,.zip,application/zip,application/x-zip-compressed"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Indicador de Descompactação */}
        {extracting && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground text-center">
            Processando arquivos e descompactando .zip…
          </div>
        )}

        {/* Lista de Arquivos Pré-Importação com Campo do Telefone do Lead */}
        {pendingItems.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-border pb-2 gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resumo das conversas ({pendingItems.length})
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPendingItems([])}
                  className="text-xs text-red-600 hover:underline px-1"
                >
                  Limpar todos
                </button>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={busy || !sellerId || pendingItems.length === 0}
                  className="via-btn via-btn-primary via-btn-sm inline-flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                  title="Confirmar o envio de todas as conversas resumidas abaixo para o histórico"
                >
                  <Check size={14} />
                  {busy
                    ? "Enviando todos os resumos…"
                    : pendingItems.length > 1
                    ? `Confirmar envio de todos os resumos (${pendingItems.length})`
                    : "Confirmar envio do resumo"}
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {pendingItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-card p-3.5 space-y-2.5 transition-all shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="text-[color:var(--via-blue)] flex-shrink-0" />
                      <span className="text-xs font-semibold truncate" title={item.fileName}>
                        {idx + 1}. {item.fileName}
                      </span>
                      <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-muted-foreground flex-shrink-0">
                        {item.messageCount} msgs
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-muted-foreground hover:text-red-600 transition-colors p-1"
                      title="Remover conversa da lista"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Campo de Telefone do Lead específico desta conversa */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <Phone size={12} className="text-[color:var(--via-blue)]" /> Telefone do lead:
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 5511999998888 (ou deixe vazio para detecção automática)"
                      value={item.leadPhone}
                      onChange={(e) => updateLeadPhone(item.id, e.target.value)}
                      className="via-input text-xs py-1 px-2.5 flex-1"
                    />
                  </div>

                  {/* Barra de ação individual: Confirmar envio desta conversa */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                    <span className="text-[11px] text-muted-foreground">
                      Envie individualmente ou use o botão do topo para enviar tudo.
                    </span>
                    <button
                      type="button"
                      onClick={() => submitSingleItem(item)}
                      disabled={busy || sendingSingleId === item.id || !sellerId}
                      className="via-btn via-btn-secondary via-btn-sm inline-flex items-center gap-1.5 text-xs text-[color:var(--via-blue)] border-[color:var(--via-blue)]/30 hover:bg-[color:var(--via-blue)]/10 font-medium whitespace-nowrap"
                      title="Enviar apenas esta conversa para o histórico"
                    >
                      <Upload size={12} />
                      {sendingSingleId === item.id ? "Enviando…" : "Confirmar envio desta conversa"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !sellerId || pendingItems.length === 0}
          className="via-btn via-btn-primary w-full py-2.5 text-sm font-semibold"
        >
          {busy
            ? `Importando ${pendingItems.length} conversa(s)…`
            : pendingItems.length > 1
            ? `Importar todas as ${pendingItems.length} conversas`
            : "Importar conversa"}
        </button>
      </form>
    </div>
  );
}
