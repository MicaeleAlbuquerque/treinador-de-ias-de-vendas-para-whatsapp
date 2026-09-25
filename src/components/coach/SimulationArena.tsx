import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  startSimulation,
  sendSimulationMessage,
  finishSimulation,
  getActiveSimulation,
  discardSimulation,
  type getSimulationPersonas,
} from "@/lib/training-simulator.functions";
import { type PersonaType, type SimulationEvaluationResult } from "@/lib/training-simulator.server";
import { toast } from "sonner";
import {
  Brain,
  Send,
  Sparkles,
  Trophy,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  User,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  CheckCheck,
  Shield,
  Lightbulb,
  Zap,
  RefreshCw,
} from "lucide-react";

interface SimulationArenaProps {
  sellers: Array<{ id: string; name: string }>;
  onFinishedSession?: () => void;
}

interface MessageItem {
  id: string;
  sender: "lead" | "seller";
  text: string;
  time: string;
}

const PERSONAS_CONFIG = [
  {
    id: "random" as PersonaType,
    title: "🎲 Personalidade Oculta (Surpresa)",
    badge: "Aleatório",
    desc: "A personalidade do lead é sorteada secretamente. Você terá que descobrir suas dores e objeções durante a conversa!",
  },
  {
    id: "preco" as PersonaType,
    title: "Lead Focado em Preço / Comparador",
    badge: "Preço",
    desc: "Pede preço de imediato. Se você passar o valor sem agregar valor e diagnosticar antes, ele diz 'tá caro' ou some.",
  },
  {
    id: "cetico" as PersonaType,
    title: "Lead Cético / Medo de Errar",
    badge: "Cético",
    desc: "Já comprou concorrentes e se decepcionou. Exige provas, garantias e questiona promessas fáceis.",
  },
  {
    id: "apressado" as PersonaType,
    title: "Lead Apressado / Direto ao Ponto",
    badge: "Apressado",
    desc: "Respostas muito curtas, sem paciência pra textões. Quer objetividade e clareza imediata.",
  },
  {
    id: "indeciso" as PersonaType,
    title: "Lead Indeciso / 'Falar com Sócio ou Esposa'",
    badge: "Indeciso",
    desc: "Gosta da solução mas hesita em fechar. Testa sua capacidade de criar urgência e envolver o decisor.",
  },
  {
    id: "aberto" as PersonaType,
    title: "Lead Aberto / Pronto para Comprar",
    badge: "Receptivo",
    desc: "Tem dor latente e orçamento. Testa se você conduz com firmeza e não deixa a venda esfriar.",
  },
];

export function SimulationArena({ sellers, onFinishedSession }: SimulationArenaProps) {
  const startFn = useServerFn(startSimulation);
  const sendFn = useServerFn(sendSimulationMessage);
  const finishFn = useServerFn(finishSimulation);
  const getActiveFn = useServerFn(getActiveSimulation);
  const discardFn = useServerFn(discardSimulation);

  // Estados da Simulação
  const [selectedPersona, setSelectedPersona] = useState<PersonaType>("random");
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");
  const [customProduct, setCustomProduct] = useState("");

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [leadName, setLeadName] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState("");

  const [loadingActive, setLoadingActive] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Resultado da Avaliação do Coach
  const [evaluation, setEvaluation] = useState<SimulationEvaluationResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Restaura automaticamente a sessão de simulação em andamento se o usuário iniciou um treino e navegou para outra tela
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      try {
        const storedId = typeof window !== "undefined" ? localStorage.getItem("via_active_sim_id") : null;
        // Se não há ID de simulação ativo salvo pelo usuário, abre direto na Área de Treinamento normal
        if (!storedId) {
          if (isMounted) setLoadingActive(false);
          return;
        }

        const res = await getActiveFn({ data: { conversationId: storedId } });
        if (!isMounted) return;
        if (res && res.hasActiveSession && res.conversationId && res.messages.length > 0) {
          // Se ainda não foi avaliada, restaura o chat imediatamente
          if (!res.evaluation) {
            setConversationId(res.conversationId);
            setLeadName(res.leadName);
            setSelectedPersona(res.requestedPersona);
            setMessages(res.messages);
          } else {
            // Se já foi finalizada, limpa para abrir na tela normal de configuração
            if (typeof window !== "undefined") {
              localStorage.removeItem("via_active_sim_id");
            }
          }
        } else {
          // Se não encontrou no banco, limpa o storage
          if (typeof window !== "undefined") {
            localStorage.removeItem("via_active_sim_id");
          }
        }
      } catch (err) {
        console.warn("[sim] Falha ao recuperar sessão ativa:", err);
      } finally {
        if (isMounted) setLoadingActive(false);
      }
    }
    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleDiscardAndExit() {
    if (!conversationId) {
      handleReset(false);
      return;
    }

    const confirmed = window.confirm(
      "Deseja sair desta conversa de treino e voltar para a área de treinamento? Esta conversa será descartada e NÃO será salva no histórico."
    );
    if (!confirmed) return;

    setDiscarding(true);
    try {
      await discardFn({ data: { conversationId } });
      if (typeof window !== "undefined") {
        localStorage.removeItem("via_active_sim_id");
      }
      setConversationId(null);
      setMessages([]);
      setEvaluation(null);
      setSendError(null);
      setFailedMessage(null);
      toast.info("Simulação cancelada. Nada foi salvo no histórico.");
      onFinishedSession?.();
    } catch (err) {
      toast.error("Erro ao cancelar simulação.");
    } finally {
      setDiscarding(false);
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleStart() {
    setStarting(true);
    setEvaluation(null);
    setSendError(null);
    setFailedMessage(null);
    try {
      const res = await startFn({
        data: {
          requestedPersona: selectedPersona,
          sellerId: selectedSellerId || null,
          customProduct: customProduct.trim() || undefined,
        },
      });

      setConversationId(res.conversationId);
      setLeadName(res.leadName);
      if (typeof window !== "undefined") {
        localStorage.setItem("via_active_sim_id", res.conversationId);
      }
      setMessages([
        {
          id: "m-0",
          sender: "lead",
          text: res.initialMessage,
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      toast.success("Treino iniciado! O Lead enviou a primeira mensagem.");
    } catch (e) {
      toast.error((e as Error).message || "Falha ao iniciar simulação");
    } finally {
      setStarting(false);
    }
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !conversationId || sending) return;

    const userText = inputMessage.trim();
    setInputMessage("");
    setSendError(null);
    setFailedMessage(null);

    const nowTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const newMsg: MessageItem = {
      id: `m-s-${Date.now()}`,
      sender: "seller",
      text: userText,
      time: nowTime,
    };

    setMessages((prev) => [...prev, newMsg]);
    setSending(true);

    try {
      const res = await sendFn({
        data: {
          conversationId,
          messageText: userText,
        },
      });

      const replyTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [
        ...prev,
        {
          id: `m-l-${Date.now()}`,
          sender: "lead",
          text: res.leadReply,
          time: replyTime,
        },
      ]);
      setSendError(null);
      setFailedMessage(null);
    } catch (err) {
      const errMsg = (err as Error).message || "Erro ao receber resposta do lead.";
      setSendError(errMsg);
      setFailedMessage(userText);
      toast.error(errMsg);
    } finally {
      setSending(false);
    }
  }

  async function handleRetryLastMessage() {
    if (!failedMessage || !conversationId || sending) return;

    setSending(true);
    setSendError(null);

    try {
      const res = await sendFn({
        data: {
          conversationId,
          messageText: failedMessage,
        },
      });

      const replyTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [
        ...prev,
        {
          id: `m-l-${Date.now()}`,
          sender: "lead",
          text: res.leadReply,
          time: replyTime,
        },
      ]);
      setSendError(null);
      setFailedMessage(null);
      toast.success("Resposta do Lead recebida!");
    } catch (err) {
      const errMsg = (err as Error).message || "Erro ao receber resposta do lead.";
      setSendError(errMsg);
      toast.error(errMsg);
    } finally {
      setSending(false);
    }
  }

  async function handleFinish() {
    if (!conversationId) return;
    setFinishing(true);
    try {
      const evalRes = await finishFn({
        data: { conversationId },
      });
      if (typeof window !== "undefined") {
        localStorage.removeItem("via_active_sim_id");
      }
      setEvaluation(evalRes);
      toast.success("Simulação avaliada com sucesso pelo AI Coach!");
      onFinishedSession?.();
    } catch (e) {
      toast.error((e as Error).message || "Erro ao processar avaliação do Coach.");
    } finally {
      setFinishing(false);
    }
  }

  function handleReset(askConfirmation = false) {
    if (askConfirmation && messages.length > 1 && !evaluation) {
      const confirmExit = window.confirm(
        "Deseja sair desta conversa de treino? Ela continuará registrada no histórico e você poderá iniciar um novo cenário."
      );
      if (!confirmExit) return;
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("via_active_sim_id");
    }
    setConversationId(null);
    setMessages([]);
    setEvaluation(null);
    setSendError(null);
    setFailedMessage(null);
  }

  // 0. CARREGANDO ESTADO ANTERIOR
  if (loadingActive) {
    return (
      <div className="via-card p-12 flex flex-col items-center justify-center space-y-3 text-muted-foreground animate-pulse">
        <div className="w-8 h-8 rounded-full border-2 border-[color:var(--via-blue)] border-t-transparent animate-spin" />
        <span className="text-sm font-medium">Restaurando sessão de treino em andamento…</span>
      </div>
    );
  }

  // 1. TELA DE FEEDBACK DO COACH (QUANDO FINALIZADA)
  if (evaluation) {
    const isHigh = evaluation.scoreOverall >= 75;
    return (
      <div className="space-y-6">
        <div className="via-card border-2 border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
                <Trophy size={28} />
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-emerald-600 dark:text-emerald-400">
                  Relatório do AI Coach
                </span>
                <h2 className="text-2xl font-bold">Avaliação do Treinamento</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-muted-foreground uppercase">Pontuação Final</div>
                <div className="text-3xl font-black text-foreground">{evaluation.scoreOverall} / 100</div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                  isHigh ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                }`}
              >
                {evaluation.grade === "excelente"
                  ? "Alta Performance"
                  : evaluation.grade === "bom"
                  ? "Bom Padrão"
                  : evaluation.grade === "atencao"
                  ? "Precisa de Ajustes"
                  : "Crítico"}
              </span>
            </div>
          </div>

          {/* Persona Revelada */}
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Lightbulb size={16} />
              <span>Personalidade do Lead Simulado</span>
            </div>
            <p className="text-sm font-bold">{evaluation.personaRevealed.title}</p>
            <p className="text-xs text-muted-foreground">{evaluation.personaRevealed.description}</p>
          </div>

          {/* Resumo Geral */}
          <p className="text-sm text-foreground/90 italic bg-background/60 p-3.5 rounded-lg border border-border/60">
            "{evaluation.summary}"
          </p>

          {/* Radar de Competências */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Zap size={16} className="text-amber-500" /> Competências Avaliadas
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Abertura & Conexão", val: evaluation.stageScores.abertura },
                { label: "Investigação & Dores", val: evaluation.stageScores.descoberta },
                { label: "Geração de Valor", val: evaluation.stageScores.valor },
                { label: "Contorno de Objeções", val: evaluation.stageScores.objecao },
                { label: "Condução ao Fechamento", val: evaluation.stageScores.fechamento },
                { label: "Ritmo & Tom Humano", val: evaluation.stageScores.tom },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="font-bold">{c.val} / 10</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        c.val >= 8 ? "bg-emerald-500" : c.val >= 6 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${c.val * 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pontos Fortes e Gaps */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
              <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 size={16} /> O que você mandou bem
              </h4>
              <ul className="text-xs space-y-1.5 text-foreground/80 list-disc list-inside">
                {evaluation.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
              <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <AlertCircle size={16} /> Onde você pode melhorar
              </h4>
              <ul className="text-xs space-y-1.5 text-foreground/80 list-disc list-inside">
                {evaluation.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Script Recomendado */}
          {evaluation.recommendedScript && evaluation.recommendedScript.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Sparkles size={16} className="text-[color:var(--via-blue)]" /> Sugestão de Scripts Recomendados (Padrão Top Performer)
              </h4>
              <div className="space-y-2">
                {evaluation.recommendedScript.map((script, idx) => (
                  <div key={idx} className="rounded bg-background p-3 text-xs border border-border text-foreground/90 font-mono">
                    "{script}"
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button onClick={() => handleReset(false)} className="via-btn via-btn-primary flex items-center gap-2">
              <RotateCcw size={16} /> Fazer Novo Treino
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. ARENA DE SIMULAÇÃO ATIVA (CHAT ESTILO WHATSAPP)
  if (conversationId) {
    return (
      <div className="space-y-4">
        {/* Header do Chat */}
        <div className="via-card flex items-center justify-between p-3.5 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                {leadName.slice(0, 2).toUpperCase() || "LE"}
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{leadName}</span>
                <span className="text-[10px] rounded bg-muted px-2 py-0.5 text-muted-foreground font-medium">
                  {selectedPersona === "random" ? "🎲 Personalidade Oculta" : PERSONAS_CONFIG.find((p) => p.id === selectedPersona)?.badge}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  {sending ? "Lead está digitando…" : "Online no WhatsApp"}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded border border-border/40">
                  <CheckCircle2 size={11} className="text-emerald-500" /> Salvo automaticamente
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDiscardAndExit}
              disabled={finishing || discarding}
              className="via-btn via-btn-secondary text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              title="Voltar para a área de treinamento sem salvar no histórico"
            >
              <ArrowLeft size={14} /> Voltar para o Treinamento
            </button>
            <button
              onClick={handleFinish}
              disabled={finishing || discarding || messages.length < 2}
              className="via-btn via-btn-primary text-xs flex items-center gap-1.5"
            >
              {finishing ? (
                "Avaliando com IA…"
              ) : (
                <>
                  <Trophy size={14} /> Encerrar e Avaliar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Janela de Mensagens estilo WhatsApp */}
        <div className="rounded-xl border border-border bg-[#efeae2] dark:bg-[#0b141a] p-4 min-h-[420px] max-h-[540px] overflow-y-auto space-y-3">
          <div className="text-center my-2">
            <span className="rounded-full bg-black/10 dark:bg-white/10 px-3 py-1 text-[11px] text-muted-foreground font-medium">
              Simulação de Treino Iniciada · Responda como no WhatsApp real
            </span>
          </div>

          {messages.map((m) => {
            const isSeller = m.sender === "seller";
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isSeller ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3.5 py-2 text-sm shadow-sm relative ${
                    isSeller
                      ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none"
                      : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none border border-border/40"
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground/80">
                    <span>{m.time}</span>
                    {isSeller && <CheckCheck size={12} className="text-[#53bdeb]" />}
                  </div>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              {leadName} está respondendo…
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Aviso de erro com botão de retentativa caso a IA tenha oscilado */}
        {sendError && failedMessage && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 flex-1 min-w-[240px]">
              <AlertCircle size={16} className="shrink-0" />
              <span>{sendError}</span>
            </div>
            <button
              type="button"
              onClick={handleRetryLastMessage}
              disabled={sending}
              className="via-btn via-btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              <RefreshCw size={13} className={sending ? "animate-spin" : ""} />
              {sending ? "Tentando novamente…" : "Tentar novamente"}
            </button>
          </div>
        )}

        {/* Input de Envio estilo WhatsApp */}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Digite sua resposta de vendas para o Lead… (Enter para enviar)"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={sending || finishing}
            className="via-input flex-1 py-2.5 text-sm"
            autoFocus
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || sending || finishing}
            className="via-btn via-btn-primary px-4 py-2.5 flex items-center gap-1.5"
          >
            <Send size={16} /> Enviar
          </button>
        </form>
      </div>
    );
  }

  // 3. TELA DE CONFIGURAÇÃO DO NOVO TREINO
  return (
    <div className="space-y-6">
      <div className="via-card space-y-4">
        <div>
          <span className="via-label">Simulador de Treino</span>
          <h2 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <Brain size={24} className="text-[color:var(--via-blue)]" /> Arena de Roleplay com IA
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Treine atendimentos no WhatsApp em tempo real. A IA encarna um lead realista com dúvidas, objeções e
            personalidade autêntica. No final, o <strong>AI Coach</strong> avalia cada mensagem e dá a sua nota com feedback pedagógico.
          </p>
        </div>

        {/* Seleção do Vendedor participante */}
        <div className="grid md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              Vendedor em Treinamento
            </label>
            <select
              value={selectedSellerId}
              onChange={(e) => setSelectedSellerId(e.target.value)}
              className="via-input w-full text-sm"
            >
              <option value="">Você mesmo / Vendedor ativo</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
              Produto ou Oferta Específica (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Treinamento Avançado R$ 1.997 (ou deixa vazio para usar o Playbook)"
              value={customProduct}
              onChange={(e) => setCustomProduct(e.target.value)}
              className="via-input w-full text-sm"
            />
          </div>
        </div>

        {/* Escolha da Persona do Lead */}
        <div className="pt-2">
          <label className="text-xs font-semibold text-muted-foreground block mb-2">
            Escolha a Personalidade do Lead
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PERSONAS_CONFIG.map((p) => {
              const isSelected = selectedPersona === p.id;
              const isRandom = p.id === "random";
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPersona(p.id)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 space-y-1.5 relative ${
                    isSelected
                      ? isRandom
                        ? "border-purple-500 bg-purple-500/10 shadow-sm"
                        : "border-[color:var(--via-blue)] bg-[color:var(--via-blue)]/10 shadow-sm"
                      : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{p.title}</span>
                    {isSelected && (
                      <CheckCircle2
                        size={16}
                        className={isRandom ? "text-purple-600 dark:text-purple-400" : "text-[color:var(--via-blue)]"}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-border flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Shield size={14} className="text-emerald-500" />
            <span>Conversas sempre dinâmicas e sem repetição (Anti-padrão)</span>
          </div>

          <button
            onClick={handleStart}
            disabled={starting}
            className="via-btn via-btn-primary flex items-center gap-2 px-5 py-2.5"
          >
            {starting ? (
              "Criando cenário de treino…"
            ) : (
              <>
                <Sparkles size={16} /> Iniciar Treino com Lead IA <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
