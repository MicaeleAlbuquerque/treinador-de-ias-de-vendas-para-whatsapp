import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { assignSellerToConversation, transcribeAudioMessageNow } from "@/lib/whatsapp.functions";
import { tagConversation, reclassifyMessage } from "@/lib/analysis.functions";
import { ChevronLeft, Check, X, Clock, UserCircle, ShieldCheck, RotateCcw, Mic } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/conversations/$id")({
  component: ConversationDetail,
});

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

function ConversationDetail() {
  const navigate = useNavigate();
  const { id } = useParams({ from: "/app/conversations/$id" });
  const qc = useQueryClient();
  const assignFn = useServerFn(assignSellerToConversation);
  const tagFn = useServerFn(tagConversation);
  const reclassifyFn = useServerFn(reclassifyMessage);
  const transcribeAudioFn = useServerFn(transcribeAudioMessageNow);
  const [assigning, setAssigning] = useState(false);
  const [wonValue, setWonValue] = useState<string>("");
  const [transcribingMsgId, setTranscribingMsgId] = useState<string | null>(null);

  async function handleTranscribeAudio(messageId: string) {
    setTranscribingMsgId(messageId);
    try {
      const res = await transcribeAudioFn({ data: { messageId } });
      if (res.ok && res.transcript) {
        toast.success("Áudio transcrito com sucesso!");
        qc.invalidateQueries({ queryKey: ["messages", id] });
        qc.invalidateQueries({ queryKey: ["audio-stats"] });
      } else {
        toast.error("Não foi possível transcrever este áudio.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTranscribingMsgId(null);
    }
  }

  const convQ = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, seller_id, lead_phone, lead_name_anon, source, outcome, outcome_value, auto_marked, last_msg_at, sellers ( id, name )")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const msgsQ = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_role, ts, media_type, text, audio_url, audio_transcript, stage, stage_confidence, stage_manual")
        .eq("conversation_id", id)
        .order("ts", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sellersQ = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data } = await supabase.from("sellers").select("id, name, active").eq("active", true).order("name");
      return data ?? [];
    },
  });

  async function handleTag(outcome: "won" | "lost" | "in_progress" | "unknown", value?: number | null) {
    try {
      await tagFn({ data: { conversationId: id, outcome, outcomeValue: value ?? null } });
      toast.success("Conversa atualizada");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function handleConfirm() {
    try {
      await tagFn({ data: { conversationId: id, outcome: (convQ.data as any).outcome, confirm: true } });
      toast.success("Tagging confirmado");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function handleReclassify(messageId: string, stage: string) {
    try {
      await reclassifyFn({ data: { messageId, stage } });
      qc.invalidateQueries({ queryKey: ["messages", id] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handleAssign(sellerId: string) {
    setAssigning(true);
    try {
      await assignFn({ data: { conversationId: id, sellerId } });
      toast.success("Vendedor atribuído");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  if (convQ.isLoading) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (convQ.error || !convQ.data) return <div className="text-sm text-red-600">Conversa não encontrada</div>;

  const conv = convQ.data as any;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate({ to: "/app/conversations" });
            }
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft size={14} /> Voltar
        </button>
        <Link to="/app/conversations" className="text-xs text-muted-foreground hover:underline">
          Ver todas as conversas
        </Link>
      </div>

      <header className="via-card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">{conv.lead_phone}</div>
          <h1 className="text-2xl">{conv.lead_name_anon ?? "Lead"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${OUTCOME_BADGE[conv.outcome] ?? OUTCOME_BADGE.unknown}`}>
              {OUTCOME_LABEL[conv.outcome] ?? conv.outcome}
            </span>
            {conv.auto_marked && conv.outcome !== "unknown" && (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                Auto-marcado · sujeito a revisão
              </span>
            )}
            {conv.outcome === "won" && conv.outcome_value != null && (
              <span className="text-muted-foreground">Valor: R$ {Number(conv.outcome_value).toLocaleString("pt-BR")}</span>
            )}
            <span className="text-muted-foreground">Origem: {conv.source}</span>
            <span className="text-muted-foreground">Vendedor: {conv.sellers?.name ?? "— não atribuído"}</span>
            {conv.last_msg_at && (
              <span className="text-muted-foreground">Última msg: {new Date(conv.last_msg_at).toLocaleString("pt-BR")}</span>
            )}
          </div>
        </div>
      </header>

      <div className="via-card flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => handleTag("won", wonValue ? Number(wonValue) : null)} className="via-btn via-btn-sm via-btn-secondary inline-flex items-center gap-1">
          <Check size={14} /> Marcar Won
        </button>
        <input type="number" placeholder="Valor R$" value={wonValue} onChange={(e) => setWonValue(e.target.value)} className="via-input w-28 text-xs" />
        <button type="button" onClick={() => handleTag("lost")} className="via-btn via-btn-sm via-btn-secondary inline-flex items-center gap-1">
          <X size={14} /> Marcar Lost
        </button>
        <button type="button" onClick={() => handleTag("in_progress")} className="via-btn via-btn-sm via-btn-secondary inline-flex items-center gap-1">
          <Clock size={14} /> Em andamento
        </button>
        {conv.outcome !== "unknown" && (
          <button
            type="button"
            onClick={() => handleTag("unknown", null)}
            className="via-btn via-btn-sm via-btn-secondary inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title="Remove o outcome e volta para Sem marca"
          >
            <RotateCcw size={14} /> Desmarcar outcome
          </button>
        )}
        {conv.auto_marked && conv.outcome !== "unknown" && (
          <button type="button" onClick={handleConfirm} className="via-btn via-btn-sm via-btn-primary inline-flex items-center gap-1">
            <ShieldCheck size={14} /> Confirmar tagging
          </button>
        )}

        {!conv.seller_id && (
          <div className="ml-auto flex items-center gap-2">
            <UserCircle size={14} className="text-muted-foreground" />
            <select
              disabled={assigning}
              defaultValue=""
              onChange={(e) => e.target.value && handleAssign(e.target.value)}
              className="via-input max-w-[200px]"
            >
              <option value="">Atribuir vendedor…</option>
              {(sellersQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="via-card space-y-3 bg-[#ECE5DD] dark:bg-[#0b141a]">
        {msgsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando mensagens…</div>
        ) : (msgsQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem mensagens.</div>
        ) : (
          (msgsQ.data ?? []).map((m) => (
            <Bubble
              key={m.id}
              msg={m as any}
              onReclassify={handleReclassify}
              onTranscribe={handleTranscribeAudio}
              transcribingId={transcribingMsgId}
            />
          ))
        )}
      </div>
    </div>
  );
}

const STAGES = ["abertura","qualificacao","valor","objecao","fechamento"] as const;
function Bubble({
  msg,
  onReclassify,
  onTranscribe,
  transcribingId,
}: {
  msg: any;
  onReclassify: (id: string, stage: string) => void;
  onTranscribe: (id: string) => void;
  transcribingId?: string | null;
}) {
  if (msg.sender_role === "system") {
    return (
      <div className="mx-auto max-w-md text-center text-[11px] text-muted-foreground italic">
        {msg.text}
      </div>
    );
  }
  const isSeller = msg.sender_role === "seller";
  return (
    <div className={`flex ${isSeller ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
          isSeller
            ? "bg-[#DCF8C6] text-zinc-900 dark:bg-[#005c4b] dark:text-[#e9edef]"
            : "bg-white text-zinc-900 dark:bg-[#202c33] dark:text-[#e9edef]"
        }`}
      >
        {msg.media_type === "audio" ? (
          <div className="space-y-2">
            {msg.audio_url ? (
              <audio controls src={msg.audio_url} className="w-full" />
            ) : (
              <div className="text-xs text-muted-foreground italic">[áudio]</div>
            )}
            {msg.audio_transcript ? (
              <div className="rounded bg-black/5 dark:bg-white/10 dark:text-zinc-200 p-2 text-xs italic">
                {msg.audio_transcript}
              </div>
            ) : msg.audio_url ? (
              <div className="pt-1">
                <button
                  type="button"
                  disabled={transcribingId === msg.id}
                  onClick={() => onTranscribe(msg.id)}
                  className="via-btn via-btn-secondary via-btn-xs text-[11px] inline-flex items-center gap-1.5 font-medium hover:border-primary/50"
                  title="Transcrever áudio usando inteligência artificial"
                >
                  <Mic size={12} className={transcribingId === msg.id ? "animate-pulse text-primary" : "text-primary"} />
                  {transcribingId === msg.id ? "Transcrevendo com IA…" : "Transcrever áudio"}
                </button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">[áudio sem mídia disponível]</div>
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm">{msg.text || <span className="italic text-muted-foreground">[sem texto]</span>}</div>
        )}
        <div className="mt-1 text-right text-[10px] text-zinc-500 dark:text-zinc-400">
          {new Date(msg.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
        {isSeller && (
          <div className="mt-1 flex justify-end">
            <select
              value={msg.stage ?? ""}
              onChange={(e) => e.target.value && onReclassify(msg.id, e.target.value)}
              className="rounded border border-zinc-300 bg-white/70 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-1 text-[10px] text-zinc-700"
              title={msg.stage_manual ? "Manual" : msg.stage_confidence ? `Confiança ${Math.round(msg.stage_confidence * 100)}%` : "Sem classificação"}
            >
              <option value="">— etapa —</option>
              {STAGES.map((s) => <option key={s} value={s}>{s}{msg.stage === s && msg.stage_manual ? " ✓" : ""}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
