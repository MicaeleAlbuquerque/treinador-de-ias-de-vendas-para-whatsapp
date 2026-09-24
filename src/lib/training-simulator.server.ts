// Simulador de Treinamento de Vendas (Roleplay com IA)
// Permite aos vendedores treinarem contra leads simulados pela IA em tempo real no WhatsApp.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, resolveChatProvider } from "./ai-gateway.server";
import { chargeLlmCost } from "./llm-cost.server";

export type PersonaType = "random" | "preco" | "cetico" | "apressado" | "indeciso" | "aberto";

export interface PersonaConfig {
  id: PersonaType;
  title: string;
  badge: string;
  description: string;
  systemPromptGoal: string;
}

export const PERSONAS: Record<PersonaType, PersonaConfig> = {
  random: {
    id: "random",
    title: "🎲 Personalidade Oculta (Surpresa)",
    badge: "Aleatório",
    description: "Você não saberá a personalidade de antemão. Terá que diagnosticar o perfil, temperamento e objeções durante o diálogo!",
    systemPromptGoal: "Atue com uma personalidade realista e desafiadora sem revelar seu padrão.",
  },
  preco: {
    id: "preco",
    title: "Lead Focado em Preço / Comparador",
    badge: "Preço",
    description: "Pergunta o preço logo de início. Se você falar o valor sem antes gerar valor e fazer perguntas, ele diz 'tá caro' ou some.",
    systemPromptGoal: "Insista em saber o preço logo de início ('quanto custa?', 'me manda a tabela'). Só revele sua dor se o vendedor fizer boas perguntas de diagnóstico sem ser evasivo.",
  },
  cetico: {
    id: "cetico",
    title: "Lead Cético / Medo de Errar",
    badge: "Cético",
    description: "Já comprou soluções parecidas no passado e se decepcionou. Exige provas, garantias e desconfia de promessas fáceis.",
    systemPromptGoal: "Desconfie de soluções milagrosas. Mencione que já tentou algo parecido antes e não funcionou. Questione garantias, suporte e cases reais.",
  },
  apressado: {
    id: "apressado",
    title: "Lead Apressado / Direto ao Ponto",
    badge: "Apressado",
    description: "Mensagens muito curtas, quer respostas diretas. Se o vendedor mandar textões longos ou enrolar, ele perde o interesse rapidamente.",
    systemPromptGoal: "Responda de forma extremamente curta e ágil. Demonstre que está sem tempo e odeia textões. Recompense quem for direto ao ponto.",
  },
  indeciso: {
    id: "indeciso",
    title: "Lead Indeciso / 'Falar com Sócio ou Esposa'",
    badge: "Indeciso",
    description: "Gosta da solução mas trava no momento do fechamento. Joga a decisão para terceiros ou para 'o próximo mês'.",
    systemPromptGoal: "Mostre muito interesse, mas ao se aproximar do fechamento, levante a objeção de que precisa falar com sócio/esposa ou esperar o próximo mês.",
  },
  aberto: {
    id: "aberto",
    title: "Lead Aberto / Pronto para Comprar",
    badge: "Receptivo",
    description: "Tem uma dor real e orçamento, mas precisa que o vendedor conduza com segurança, clareza e firmeza para fechar o pedido.",
    systemPromptGoal: "Tenha uma dor clara para resolver. Seja colaborativo nas respostas, mas exija firmeza e clareza nos próximos passos para fechar.",
  },
};

// Gerador de variações dinâmicas para nunca haver conversas repetidas
const RANDOM_NAMES = ["Lucas Rocha", "Camila Mendonça", "Rafael Queiroz", "Beatriz Fontes", "Diego Ramos", "Patrícia Nogueira", "Thiago Alencar", "Larissa Prado", "Eduardo Silveira", "Juliana Meireles"];
const RANDOM_NICHES = [
  "Clínica médica / estética",
  "Imobiliária e locação de imóveis",
  "Software e tecnologia B2B",
  "Escritório de advocacia",
  "E-commerce de moda e varejo",
  "Consultoria financeira e contabilidade",
  "Empresa de energia solar",
  "Escola de cursos e treinamentos",
  "Distribuidora e indústria de peças",
  "Agência de marketing digital",
];
const RANDOM_ORIGINS = [
  "vi um anúncio no Instagram",
  "um amigo meu recomendou vocês",
  "pesquisei no Google e achei o site de vocês",
  "vi um post no LinkedIn sobre os resultados de vocês",
  "recebi o contato de vocês por indicação",
];
const RANDOM_GOALS = [
  "preciso aumentar a taxa de conversão das vendas urgentemente",
  "estamos perdendo muitos leads que chegam no WhatsApp",
  "minha equipe demora muito pra responder e não bate a meta",
  "preciso estruturar um processo de vendas que não dependa só de mim",
  "estamos com faturamento estagnado há 4 meses e preciso destravar",
];

export interface SimulationContext {
  actualPersona: PersonaType;
  leadName: string;
  leadNiche: string;
  leadOrigin: string;
  leadGoal: string;
  playbookContext: string;
}

// Carrega o contexto do playbook ativo para alimentar a IA
async function getPlaybookContext(): Promise<string> {
  try {
    const { data: snapshot } = await supabaseAdmin
      .from("playbook_snapshots")
      .select("system_prompt, summary, winning_scripts, training_tips")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!snapshot) return "Empresa de vendas e serviços consultivos de alto padrão via WhatsApp.";

    const parts: string[] = [];
    if (snapshot.summary) {
      parts.push(`Resumo do negócio: ${snapshot.summary}`);
    }
    if (snapshot.training_tips && Array.isArray(snapshot.training_tips)) {
      parts.push(`Orientações do time: ${(snapshot.training_tips as string[]).slice(0, 3).join("; ")}`);
    }
    return parts.join("\n") || "Empresa de vendas e serviços consultivos.";
  } catch {
    return "Empresa de vendas e serviços consultivos.";
  }
}

export function pickSimulationContext(requestedPersona: PersonaType, customNiche?: string): SimulationContext {
  let actualPersona = requestedPersona;
  if (actualPersona === "random") {
    const pool: PersonaType[] = ["preco", "cetico", "apressado", "indeciso", "aberto"];
    actualPersona = pool[Math.floor(Math.random() * pool.length)]!;
  }

  const leadName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]!;
  const leadNiche = customNiche || RANDOM_NICHES[Math.floor(Math.random() * RANDOM_NICHES.length)]!;
  const leadOrigin = RANDOM_ORIGINS[Math.floor(Math.random() * RANDOM_ORIGINS.length)]!;
  const leadGoal = RANDOM_GOALS[Math.floor(Math.random() * RANDOM_GOALS.length)]!;

  return {
    actualPersona,
    leadName,
    leadNiche,
    leadOrigin,
    leadGoal,
    playbookContext: "",
  };
}

/** Inicia uma nova sessão de simulação e devolve a mensagem de abertura do Lead */
export async function startSimulationSession(opts: {
  sellerId: string | null;
  requestedPersona: PersonaType;
  customProduct?: string;
}): Promise<{
  conversationId: string;
  leadName: string;
  initialMessage: string;
  personaTitle: string;
  personaBadge: string;
}> {
  const simContext = pickSimulationContext(opts.requestedPersona, opts.customProduct);
  const playbook = await getPlaybookContext();
  simContext.playbookContext = playbook;

  const personaConfig = PERSONAS[simContext.actualPersona];

  // Gera a primeira mensagem do Lead dinamicamente
  const systemPrompt = `Você é um potencial cliente (LEAD) brasileiro iniciando contato via WhatsApp com uma empresa.
Você NÃO é o vendedor. Você é o CLIENTE.

SEU PERFIL:
- Nome: ${simContext.leadName}
- Seu nicho / empresa: ${simContext.leadNiche}
- Como conheceu a empresa: ${simContext.leadOrigin}
- Sua dor ou intenção: ${simContext.leadGoal}
- Sua personalidade: ${personaConfig.systemPromptGoal}

REGRAS:
1. Escreva a PRIMEIRA mensagem que você envia no WhatsApp para iniciar o contato.
2. Seja natural, informal e humano, como uma pessoa real no WhatsApp do Brasil (ex: "Oi", "Boa tarde", sem emojis exagerados, 1 ou 2 frases curtas).
3. Não dê todas as informações de bandeja. Inicie o contato conforme sua personalidade.
4. Responda APENAS o texto da mensagem. Nada mais.`;

  const resolved = await resolveChatProvider();
  await chargeLlmCost({ provider: resolved.provider, model: resolved.model, costUsd: 0.001, source: "other" });

  const { text: initialMsg } = await chatCompletion({
    resolved,
    systemPrompt,
    userPrompt: "Gere a sua primeira mensagem de contato no WhatsApp.",
    temperature: 0.7, // maior variedade para nunca repetir
  });

  const cleanedMsg = initialMsg.replace(/^["']|["']$/g, "").trim() || "Oi, boa tarde! Gostaria de mais informações sobre o produto de vocês.";

  // Cria a conversa no Supabase marcada como simulation
  const now = new Date().toISOString();
  const leadPhone = `+5500${Date.now().toString().slice(-8)}`;

  const { data: conv, error: convErr } = await supabaseAdmin
    .from("conversations")
    .insert({
      seller_id: opts.sellerId,
      lead_phone: leadPhone,
      lead_name_anon: `Lead ${simContext.leadName} (${simContext.leadNiche})`,
      source: "simulation",
      first_msg_at: now,
      last_msg_at: now,
      message_count: 1,
      analysis_status: "done",
      vocabulary: {
        simulation_context: simContext,
        requested_persona: opts.requestedPersona,
      } as any,
    })
    .select("id")
    .single();

  if (convErr || !conv) throw new Error(convErr?.message || "Falha ao criar simulação");

  // Grava a 1ª mensagem do Lead
  await supabaseAdmin.from("messages").insert({
    conversation_id: conv.id,
    sender_role: "lead",
    ts: now,
    media_type: "text",
    text: cleanedMsg,
    stage: "abertura",
    stage_confidence: 1,
    raw: { sim_role: "lead" } as any,
  });

  return {
    conversationId: conv.id,
    leadName: simContext.leadName,
    initialMessage: cleanedMsg,
    personaTitle: PERSONAS[opts.requestedPersona].title,
    personaBadge: PERSONAS[opts.requestedPersona].badge,
  };
}

/** Gera a próxima resposta do Lead IA após a mensagem do vendedor */
export async function replyAsSimulationLead(conversationId: string, sellerMessage: string): Promise<string> {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id, vocabulary")
    .eq("id", conversationId)
    .single();

  if (!conv) throw new Error("Simulação não encontrada");

  // 1. Busca mensagens atuais da conversa para verificar histórico e evitar duplicações
  const { data: existingMessages } = await supabaseAdmin
    .from("messages")
    .select("sender_role, text, ts")
    .eq("conversation_id", conversationId)
    .order("ts", { ascending: true });

  const history = existingMessages ? [...existingMessages] : [];
  const lastMsg = history[history.length - 1];
  const trimmedSellerMsg = sellerMessage.trim();

  // Se a última mensagem já for do vendedor com o mesmo texto (ex: se houve erro 503 na chamada anterior),
  // não inserimos em duplicidade no banco, apenas geramos a resposta que ficou pendente.
  const isAlreadyLastSellerMsg =
    lastMsg &&
    lastMsg.sender_role === "seller" &&
    (lastMsg.text ?? "").trim() === trimmedSellerMsg;

  if (!isAlreadyLastSellerMsg) {
    const now = new Date().toISOString();
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversationId,
      sender_role: "seller",
      ts: now,
      media_type: "text",
      text: trimmedSellerMsg,
      raw: { sim_role: "seller" } as any,
    });
    history.push({
      sender_role: "seller",
      text: trimmedSellerMsg,
      ts: now,
    });
  }

  const simContext: SimulationContext = (conv.vocabulary as any)?.simulation_context || pickSimulationContext("preco");
  const personaConfig = PERSONAS[simContext.actualPersona] || PERSONAS.preco;

  const systemPrompt = `Você é um CLIENTE (LEAD) conversando com um VENDEDOR pelo WhatsApp.
Você NÃO é o vendedor e NUNCA aja como vendedor ou assistente de IA. Você é o lead ${simContext.leadName}.

SEU PERFIL:
- Nome: ${simContext.leadName}
- Ramo: ${simContext.leadNiche}
- Sua dor / necessidade: ${simContext.leadGoal}
- Sua personalidade: ${personaConfig.systemPromptGoal}

REGRAS DE CONDUTA NO WHATSAPP:
1. Responda como uma pessoa real brasileira no WhatsApp: seja conversacional, use frases curtas (1 a 3 linhas no máximo).
2. Não seja bajulador. Se o vendedor fez uma boa pergunta, responda. Se ele jogou um textão ou preço sem explicar nada, reaja com frieza ou desinteresse.
3. Se o vendedor conduzir bem (entender sua dor, explicar valor, passar segurança e propor um próximo passo concreto), mostre-se inclinado a fechar ou agendar.
4. Se o vendedor for insistente demais ou não responder suas dúvidas, mostre hesitação.
5. Devolva APENAS o texto da sua mensagem de WhatsApp, sem aspas e sem explicações.`;

  const transcript = history
    .map((m) => `${m.sender_role === "seller" ? "[VENDEDOR]" : `[LEAD ${simContext.leadName}]`}: ${m.text}`)
    .join("\n");

  const userPrompt = `Histórico recente da conversa:\n${transcript}\n\nResponda agora como o Lead ${simContext.leadName}:`;

  const resolved = await resolveChatProvider();
  await chargeLlmCost({ provider: resolved.provider, model: resolved.model, costUsd: 0.001, source: "other" });

  const { text: leadReply } = await chatCompletion({
    resolved,
    systemPrompt,
    userPrompt,
    temperature: 0.6,
  });

  const cleanedReply = leadReply.replace(/^["']|["']$/g, "").trim() || "Entendi. E como funciona na prática?";

  // Grava a resposta do Lead
  const replyTs = new Date(Date.now() + 1000).toISOString();
  await supabaseAdmin.from("messages").insert({
    conversation_id: conversationId,
    sender_role: "lead",
    ts: replyTs,
    media_type: "text",
    text: cleanedReply,
    raw: { sim_role: "lead" } as any,
  });

  // Atualiza message_count na conversa
  await supabaseAdmin
    .from("conversations")
    .update({
      message_count: history.length + 2,
      last_msg_at: replyTs,
    })
    .eq("id", conversationId);

  return cleanedReply;
}

export interface ActiveSimulationSession {
  hasActiveSession: boolean;
  conversationId: string | null;
  leadName: string;
  requestedPersona: PersonaType;
  actualPersona: PersonaType;
  personaTitle: string;
  personaBadge: string;
  messages: Array<{
    id: string;
    sender: "lead" | "seller";
    text: string;
    time: string;
  }>;
  customProduct?: string;
  evaluation?: SimulationEvaluationResult | null;
}

/** Carrega os dados de uma sessão de simulação ativa especificamente solicitada */
export async function loadActiveSimulationSession(conversationId?: string | null): Promise<ActiveSimulationSession> {
  const emptyResult: ActiveSimulationSession = {
    hasActiveSession: false,
    conversationId: null,
    leadName: "",
    requestedPersona: "random",
    actualPersona: "preco",
    personaTitle: "",
    personaBadge: "",
    messages: [],
  };

  // Se não foi passado um ID de conversa ativo do usuário, abre na Área de Treinamento normal
  if (!conversationId) {
    return emptyResult;
  }

  const { data: conv, error } = await supabaseAdmin
    .from("conversations")
    .select("id, lead_name_anon, vocabulary, quality_breakdown, created_at, seller_id")
    .eq("source", "simulation")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !conv) {
    return emptyResult;
  }

  const simContext: SimulationContext = (conv.vocabulary as any)?.simulation_context;
  const requestedPersona: PersonaType = (conv.vocabulary as any)?.requested_persona || "random";
  const actualPersona: PersonaType = simContext?.actualPersona || "preco";
  const personaConfig = PERSONAS[requestedPersona] || PERSONAS.preco;

  // Busca todas as mensagens da simulação
  const { data: msgRows } = await supabaseAdmin
    .from("messages")
    .select("id, sender_role, text, ts")
    .eq("conversation_id", conv.id)
    .order("ts", { ascending: true });

  const messages = (msgRows ?? []).map((m) => ({
    id: m.id,
    sender: (m.sender_role === "seller" ? "seller" : "lead") as "lead" | "seller",
    text: m.text ?? "",
    time: m.ts
      ? new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "",
  }));

  return {
    hasActiveSession: true,
    conversationId: conv.id,
    leadName: simContext?.leadName || (conv.lead_name_anon ?? "").replace(/^Lead\s*/i, "").split(" ")[0] || "Cliente",
    requestedPersona,
    actualPersona,
    personaTitle: personaConfig.title,
    personaBadge: personaConfig.badge,
    messages,
    customProduct: simContext?.leadGoal,
    evaluation: (conv.quality_breakdown as any) || null,
  };
}

export interface SimulationEvaluationResult {
  scoreOverall: number;
  grade: "excelente" | "bom" | "atencao" | "critico";
  outcome: "won" | "lost";
  stageScores: {
    abertura: number;
    descoberta: number;
    valor: number;
    objecao: number;
    fechamento: number;
    tom: number;
  };
  highlights: string[];
  gaps: string[];
  recommendedScript: string[];
  summary: string;
  personaRevealed: {
    title: string;
    description: string;
  };
}

/** Descarta ou apaga completamente uma simulação do histórico */
export async function deleteSimulationSession(conversationId: string): Promise<boolean> {
  // Apaga avaliações e jobs relacionados
  await supabaseAdmin.from("coach_evaluations").delete().eq("conversation_id", conversationId);
  await supabaseAdmin.from("quality_score_jobs").delete().eq("conversation_id", conversationId);
  await supabaseAdmin.from("messages").delete().eq("conversation_id", conversationId);

  // Apaga a conversa da simulação
  const { error } = await supabaseAdmin.from("conversations").delete().eq("id", conversationId);
  if (error) {
    // Se houver restrição de FK, marca como excluída para nunca mais aparecer no histórico
    await supabaseAdmin
      .from("conversations")
      .update({ source: "simulation_discarded" as any, quality_score: null })
      .eq("id", conversationId);
  }
  return true;
}

/** Descarta completamente uma simulação não finalizada para que não seja salva no histórico */
export async function discardSimulationSession(conversationId: string): Promise<boolean> {
  return await deleteSimulationSession(conversationId);
}

/** Avalia detalhadamente o vendedor ao final da simulação */
export async function evaluateSimulation(conversationId: string): Promise<SimulationEvaluationResult> {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id, seller_id, vocabulary")
    .eq("id", conversationId)
    .single();

  if (!conv) throw new Error("Conversa de simulação não encontrada");

  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("sender_role, text, ts")
    .eq("conversation_id", conversationId)
    .order("ts", { ascending: true });

  const history = messages ?? [];
  const simContext: SimulationContext = (conv.vocabulary as any)?.simulation_context || pickSimulationContext("preco");
  const personaConfig = PERSONAS[simContext.actualPersona] || PERSONAS.preco;

  const transcript = history
    .map((m) => `${m.sender_role === "seller" ? "[VENDEDOR]" : `[LEAD ${simContext.leadName}]`}: ${m.text}`)
    .join("\n");

  const systemPrompt = `Você é o AI Coach de Vendas sênior especializado em atendimento consultivo de alta conversão pelo WhatsApp em português do Brasil.
Você está avaliando o desempenho de um VENDEDOR em um treino simulado contra um Lead de perfil "${personaConfig.title}".

DADOS DO CENÁRIO DO TREINO:
- Perfil do Lead: ${personaConfig.title} (${personaConfig.description})
- Segmento do Lead: ${simContext.leadNiche}
- Dor que o Lead tinha: ${simContext.leadGoal}

CRITÉRIOS DE AVALIAÇÃO (0 a 10 cada):
1. abertura: acolhimento, simpatia e gancho inicial sem ser robótico.
2. descoberta: fez perguntas inteligentes para entender a dor e a situação do cliente antes de empurrar o produto?
3. valor: apresentou benefícios reais e adaptados à realidade do cliente, e não apenas uma lista de características ou preço solto?
4. objecao: contornou as dúvidas e resistências com segurança, empatia e sem discutir?
5. fechamento: conduziu com clareza para o próximo passo (link, call, pedido)?
6. tom: tom de voz humano, seguro, assertivo e no ritmo certo do WhatsApp.

RETORNE APENAS UM JSON ESTRITO NO FORMATO:
{
  "scoreOverall": 0-100,
  "outcome": "won" | "lost",
  "stageScores": {
    "abertura": 0-10,
    "descoberta": 0-10,
    "valor": 0-10,
    "objecao": 0-10,
    "fechamento": 0-10,
    "tom": 0-10
  },
  "highlights": ["3 a 4 pontos fortes concretos do que o vendedor fez bem"],
  "gaps": ["3 a 4 falhas, omissões ou oportunidades perdidas pelo vendedor"],
  "recommendedScript": ["2 a 3 exemplos práticos de mensagens ideais que o vendedor poderia ter enviado nos momentos de maior atrito ou fechamento"],
  "summary": "1 a 2 frases resumindo a maturidade comercial do vendedor neste atendimento"
}`;

  const userPrompt = `Analise a transcrição deste treino simulado:\n\n${transcript}\n\nResponda apenas em JSON estrito.`;

  const resolved = await resolveChatProvider();
  await chargeLlmCost({ provider: resolved.provider, model: resolved.model, costUsd: 0.003, source: "other" });

  const { text: evalRaw } = await chatCompletion({
    resolved,
    systemPrompt,
    userPrompt,
    responseFormat: "json",
    temperature: 0.2,
  });

  let parsed: any;
  try {
    parsed = JSON.parse(evalRaw);
  } catch {
    const cleaned = evalRaw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Falha ao processar avaliação pedagógica da IA.");
    parsed = JSON.parse(match[0]);
  }

  const scoreOverall = Math.max(0, Math.min(100, Number(parsed.scoreOverall ?? 70)));
  let grade: "excelente" | "bom" | "atencao" | "critico" = "bom";
  if (scoreOverall >= 85) grade = "excelente";
  else if (scoreOverall >= 70) grade = "bom";
  else if (scoreOverall >= 50) grade = "atencao";
  else grade = "critico";

  const result: SimulationEvaluationResult = {
    scoreOverall,
    grade,
    outcome: parsed.outcome === "won" ? "won" : "lost",
    stageScores: {
      abertura: Number(parsed.stageScores?.abertura ?? 7),
      descoberta: Number(parsed.stageScores?.descoberta ?? 7),
      valor: Number(parsed.stageScores?.valor ?? 7),
      objecao: Number(parsed.stageScores?.objecao ?? 7),
      fechamento: Number(parsed.stageScores?.fechamento ?? 7),
      tom: Number(parsed.stageScores?.tom ?? 7),
    },
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : ["Boa disposição no atendimento."],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : ["Pode aprofundar mais nas perguntas de diagnóstico."],
    recommendedScript: Array.isArray(parsed.recommendedScript) ? parsed.recommendedScript : [],
    summary: String(parsed.summary || "Atendimento avaliado com sucesso."),
    personaRevealed: {
      title: personaConfig.title,
      description: personaConfig.description,
    },
  };

  // Salva no banco de dados da conversa
  await supabaseAdmin
    .from("conversations")
    .update({
      quality_score: scoreOverall,
      quality_breakdown: result as any,
      outcome: result.outcome,
      quality_evaluated_at: new Date().toISOString(),
      quality_model: resolved.model,
      quality_provider: resolved.provider,
    })
    .eq("id", conversationId);

  return result;
}
