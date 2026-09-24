import { Link } from "@tanstack/react-router";
import { Trophy, Clock, ArrowRight, UserCircle, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { deleteSimulation } from "@/lib/training-simulator.functions";

interface SimulationHistoryProps {
  items: Array<{
    id: string;
    title: string;
    score: number | null;
    outcome: string;
    sellerName: string;
    createdAt: string;
    messageCount: number;
  }>;
  isLoading: boolean;
  onNewSessionClick: () => void;
}

function scoreColor(s: number | null): string {
  if (s == null) return "bg-muted text-muted-foreground border-border";
  if (s >= 80) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (s >= 60) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
}

export function SimulationHistory({ items, isLoading, onNewSessionClick }: SimulationHistoryProps) {
  const qc = useQueryClient();
  const deleteSimFn = useServerFn(deleteSimulation);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, title: string) {
    const ok = window.confirm(`Deseja realmente excluir este treino "${title || "Treino com Lead IA"}" do histórico?`);
    if (!ok) return;

    setDeletingId(id);
    try {
      await deleteSimFn({ data: { conversationId: id } });
      toast.success("Simulação apagada com sucesso!");
      qc.invalidateQueries({ queryKey: ["simulation-history"] });
    } catch (e) {
      toast.error(`Falha ao apagar: ${(e as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return <div className="via-card p-6 text-sm text-muted-foreground text-center">Carregando histórico de treinos…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="via-card p-8 text-center space-y-3">
        <Trophy className="mx-auto text-muted-foreground" size={32} />
        <h3 className="text-base font-bold">Nenhum treino realizado ainda</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Pratique agora com a IA interpretando um lead com dúvidas e objeções reais da sua operação de vendas.
        </p>
        <button onClick={onNewSessionClick} className="via-btn via-btn-primary text-xs inline-flex items-center gap-1.5">
          Iniciar Primeiro Treino
        </button>
      </div>
    );
  }

  return (
    <div className="via-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Trophy size={18} className="text-amber-500" /> Histórico de Simulações da Equipe
          </h3>
          <p className="text-xs text-muted-foreground">
            Acompanhe as notas pedagógicas e o desempenho de cada vendedor nos treinos práticos.
          </p>
        </div>
        <button onClick={onNewSessionClick} className="via-btn via-btn-primary via-btn-sm inline-flex items-center gap-1">
          Novo Treino
        </button>
      </div>

      <div className="divide-y divide-border">
        {items.map((it) => (
          <div key={it.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <span className={`inline-flex items-center justify-center font-bold rounded-lg border px-2.5 py-1 text-sm ${scoreColor(it.score)}`}>
                  {it.score != null ? `${it.score}` : "—"}
                </span>
              </div>
              <div>
                <div className="font-semibold text-sm flex items-center gap-2">
                  <span>{it.title || "Treino com Lead IA"}</span>
                  {it.outcome === "won" && (
                    <span className="text-[10px] rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold px-1.5 py-0.5">
                      Venda Concluída
                    </span>
                  )}
                  {it.outcome === "lost" && (
                    <span className="text-[10px] rounded bg-red-500/15 text-red-700 dark:text-red-300 font-semibold px-1.5 py-0.5">
                      Perdeu o Lead
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <UserCircle size={13} /> {it.sellerName}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare size={13} /> {it.messageCount} mensagens
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={13} /> {new Date(it.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/app/conversations/$id"
                params={{ id: it.id }}
                className="via-btn via-btn-secondary via-btn-sm inline-flex items-center gap-1 text-xs"
              >
                Ver transcrição <ArrowRight size={12} />
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(it.id, it.title)}
                disabled={deletingId === it.id}
                title="Apagar este treino do histórico"
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              >
                {deletingId === it.id ? (
                  <Loader2 size={14} className="animate-spin text-red-500" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
