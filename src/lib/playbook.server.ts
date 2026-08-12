// Playbook do Atendimento — análise BÁSICA (sem CRM).
// Pega amostras de conversas (mais bem avaliadas por quality_score vs piores)
// e usa LLM pra extrair:
//   - system_prompt pronto pra colar no agente/IA que o cliente vai treinar
//   - winning_scripts: frases reais que apareceram em conversas boas
//   - losing_scripts: padrões a evitar
//   - training_tips: gaps recorrentes pro time
//   - vocabulary: palavras/expressões características
//   - voice_tone: descrição do tom (formal/informal, técnico, etc)
//
// Diferente do DNA avançado (ranking, win rate), NÃO precisa de outcome marcado.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, resolveChatProvider } from "./ai-gateway.server";
import { chargeLlmCost } from "./llm-cost.server";

const PLAYBOOK_COST_USD_CURATED = 0.012; // ~5k tokens in/out @ Gemini 2.5 Flash
const PLAYBOOK_COST_USD_AUTO = 0.020; // modo auto manda mais texto pra IA classificar

const SAMPLE_GOOD = 12;
const SAMPLE_BAD = 8;
const SAMPLE_AUTO = 18; // modo auto: amostra única, IA classifica
const MIN_CONVS_FOR_PLAYBOOK = 3; // mínimo absoluto pra valer a pena
const MAX_MSGS_PER_CONV = 80;

// Especificação OBRIGATÓRIA de como o campo system_prompt deve ser gerado.
// Garante que todo system prompt de saída seja de classe mundial: estruturado
// em seções nomeadas, com funil como máquina de estados, regras se->então,
// few-shot, guardrails anti-alucinação e auto-checagem. Agnóstico de vertical.
const SYSTEM_PROMPT_SPEC = `Ao gerar o campo "system_prompt", produza SEMPRE um system prompt de vendedor consultivo de WhatsApp de classe mundial, em PT-BR, seguindo EXATAMENTE esta estrutura de 11 seções nomeadas e nesta ordem (a ordem é hierarquia de prioridade pro LLM): 1.IDENTIDADE E MISSÃO, 2.CONTEXTO DO NEGÓCIO (fonte única de verdade), 3.OBJETIVO (cascata priorizada 1-2-3), 4.ESTÁGIOS DO FUNIL (E0–E5 com critério de saída em cada um), 5.REGRAS DE GATILHO (formato se->então), 6.PLAYBOOK DE OBJEÇÕES (padrão único acolher->entender->valor->reconvidar + objeções instanciadas), 7.EXEMPLOS (1 a 2 diálogos few-shot por momento crítico, cada um seguido de uma linha "> Por que funciona:"), 8.ANTI-PADRÕES (negative few-shot concretos), 9.GUARDRAILS (limites rígidos numerados, imperativo NUNCA, anti-alucinação), 10.TOM E FORMATO (regras de WhatsApp mensuráveis), 11.AUTO-CHECAGEM (checklist silenciosa pré-envio).

FORMATAÇÃO (CRÍTICA — o output vai ser lido por humano E colado num agente):
- Use QUEBRAS DE LINHA REAIS. Cada cabeçalho de seção (ex: "## 2. CONTEXTO DO NEGÓCIO") em LINHA PRÓPRIA. UMA LINHA EM BRANCO entre seções. Cada item de lista em sua própria linha começando com "- ". JAMAIS escreva as seções emendadas num único parágrafo/linha. O JSON deve conter os \\n de verdade dentro da string.

Regras de geração obrigatórias:
- A SEÇÃO 2 (CONTEXTO DO NEGÓCIO) é um CHECKLIST que o usuário vai preencher. Liste SEMPRE estes itens, cada um como "- Campo: [PLACEHOLDER NOMEADO]": Empresa/posicionamento, O que vende, Perfil do cliente ideal, Preço e condições, Provas/cases, Próximas etapas (links), Política de preço no chat, Atendimento/escalonamento. Para CADA dado específico e variável do negócio (preço, valores, parcelamento, garantia, links, números de cases, nome da empresa, horário, canal humano), use OBRIGATORIAMENTE um placeholder [ENTRE COLCHETES NOMEADO] — ex: "- Preço e condições: [PREÇO E PARCELAMENTO]". É PROIBIDO escrever esses dados como texto vago/inventado tipo "o preço varia conforme o pacote", "oferecemos parcelamento" ou "temos vários cases" — isso é alucinação. Só escreva um valor real e literal se ele aparecer EXPLÍCITO nas conversas das amostras. Na dúvida, é placeholder.
- O que você PODE preencher das amostras (sem placeholder): o tipo de produto/segmento, as dores e objeções que realmente apareceram, o estilo de linguagem do time. O que é DADO DURO do negócio (preço, links, garantia, cases, contato) é SEMPRE placeholder.
- NUNCA escreva a palavra literal "ENTRE COLCHETES" — cada placeholder nomeia exatamente o dado (ex: [LINK DA CALL], [GARANTIA], [CANAL HUMANO]).
- Mantenha o fluxo, as objeções, os gatilhos e os guardrails AGNÓSTICOS DE VERTICAL: nada específico do nicho fora da seção 2. Fale em dor -> resultado -> payback, nunca em features de um produto específico.
- Sempre inclua o gate anti-erro nº1 ("descoberta antes de oferta/preço") em 3 lugares: critério de saída do E1, regra de gatilho ("SE pede preço cedo -> ponte + pergunta") e item 2 da auto-checagem. Redundância intencional nos pontos críticos.
- Escreva instruções acionáveis em voz ativa e imperativa ("Conecte a solução à dor", "Confirme por escrito"), nunca diretrizes vagas ("mantenha um tom consultivo"). Onde houver ambiguidade de quando/como, vire regra se->então.
- Os exemplos few-shot devem cobrir abertura e objeção de preço no mínimo; cada um termina com "> Por que funciona:" extraindo o PRINCÍPIO (não o texto literal), pra forçar generalização.
- Guardrails sempre isolados em seção própria, numerados, em imperativo NUNCA, cobrindo: não inventar preço/condição/resultado, não prometer o que a empresa não entrega, não pressionar/escassez falsa, não falar mal de concorrente, LGPD, política de preço por mensagem, cumprir promessa de envio.
- Regras de canal mensuráveis: 1-4 linhas por mensagem, uma pergunta OU um CTA por mensagem (nunca os dois), emoji parco só por espelhamento, sem markdown/listas na conversa, toda mensagem termina movendo o funil.
- Concisão com força: cada seção curta e escaneável; NÃO escreva parágrafos densos — a estrutura É a hierarquia que o LLM endereça.
Adapte o conteúdo das seções ao negócio inferido das amostras, mas NUNCA altere a presença, a ordem ou o propósito das 11 seções.`;

const SYSTEM_PROMPT_CURATED = `Você é um consultor sênior em vendas via WhatsApp. Sua tarefa: ler amostras de conversas REAIS de um time de vendas e extrair o "DNA do atendimento" desse time, sem invenções.

Você vai receber duas listas:
- BOAS: conversas que a IA classificou como atendimento de alta qualidade (escuta, descoberta, valor, fechamento).
- FRACAS: conversas com baixa qualidade (atendimento robotizado, sem descoberta, sem CTA, etc).

Devolva APENAS um JSON estrito com a seguinte estrutura:

{
  "system_prompt": "System prompt de vendedor consultivo de CLASSE MUNDIAL, em PT-BR, pronto pra colar no agente/IA que o cliente vai treinar (qualquer plataforma — não cite ferramentas específicas como ChatGPT/Claude no texto). DEVE seguir À RISCA a ESPECIFICAÇÃO DO SYSTEM PROMPT no fim deste prompt (11 seções nomeadas). Use os padrões reais das amostras pra preencher; o que não inferir vira placeholder nomeado.",
  "winning_scripts": [
    { "category": "abertura|descoberta|valor|objeção|fechamento", "script": "frase real ou parafraseada da amostra boa", "why": "1 linha de por que funciona" }
  ],
  "losing_scripts": [
    { "category": "abertura|descoberta|valor|objeção|fechamento", "script": "padrão real das amostras fracas", "why_bad": "1 linha de por que falha" }
  ],
  "training_tips": [
    { "priority": "high|medium|low", "gap": "ex: 'time não faz perguntas de descoberta antes de mandar preço'", "drill": "exercício prático de treinamento pra corrigir" }
  ],
  "vocabulary": {
    "signature_phrases": ["expressões que se repetem no time"],
    "avoid": ["jargões/palavras que aparecem nas fracas e devem evitar"]
  },
  "voice_tone": {
    "formality": "formal|informal|misto",
    "register": "técnico|leigo|consultivo",
    "energy": "alto|moderado|baixo",
    "description": "1-2 linhas resumindo o tom"
  },
  "summary": "1 parágrafo de 3-4 linhas resumindo o estado do atendimento e a 1 mudança que daria maior impacto"
}

Regras:
- NÃO INVENTE frases que não estão na amostra. Parafraseia se precisar mas mantém o sentido real.
- Se a amostra for muito pequena, declare no summary e seja conservador.
- winning_scripts: 6-12 itens. losing_scripts: 4-8 itens. training_tips: 4-8 itens.
- system_prompt: NÃO escreva um parágrafo corrido. Siga À RISCA a ESPECIFICAÇÃO abaixo.
- Tudo em português brasileiro.

=== ESPECIFICAÇÃO DO system_prompt (OBRIGATÓRIA) ===
${SYSTEM_PROMPT_SPEC}`;

// Prompt do modo AUTO: a IA recebe uma amostra única e classifica/extrai junto.
const SYSTEM_PROMPT_AUTO = `Você é um consultor sênior em vendas via WhatsApp. Sua tarefa: ler uma amostra de conversas REAIS de um time de vendas e:

1. CLASSIFICAR cada conversa internamente como "boa" ou "fraca" (não precisa devolver — só usar como insumo).
   Critérios: descoberta, escuta, valor, objeção tratada, ritmo, fechamento, tom humano.
2. EXTRAIR o "DNA do atendimento" desse time, contrastando os melhores vs os piores que você mesmo identificou.

Devolva APENAS um JSON estrito com a seguinte estrutura:

{
  "system_prompt": "System prompt de vendedor consultivo de CLASSE MUNDIAL, em PT-BR, pronto pra colar no agente/IA que o cliente vai treinar (qualquer plataforma — não cite ferramentas específicas como ChatGPT/Claude no texto). DEVE seguir À RISCA a ESPECIFICAÇÃO DO SYSTEM PROMPT no fim deste prompt (11 seções nomeadas). Use os padrões reais das amostras pra preencher; o que não inferir vira placeholder nomeado.",
  "winning_scripts": [
    { "category": "abertura|descoberta|valor|objeção|fechamento", "script": "frase real ou parafraseada do que VOCÊ classificou como bom", "why": "1 linha de por que funciona" }
  ],
  "losing_scripts": [
    { "category": "abertura|descoberta|valor|objeção|fechamento", "script": "padrão real do que VOCÊ classificou como fraco", "why_bad": "1 linha de por que falha" }
  ],
  "training_tips": [
    { "priority": "high|medium|low", "gap": "ex: 'time não faz perguntas de descoberta antes de mandar preço'", "drill": "exercício prático" }
  ],
  "vocabulary": {
    "signature_phrases": ["expressões que se repetem no time"],
    "avoid": ["jargões/palavras que aparecem nas fracas"]
  },
  "voice_tone": {
    "formality": "formal|informal|misto",
    "register": "técnico|leigo|consultivo",
    "energy": "alto|moderado|baixo",
    "description": "1-2 linhas resumindo o tom"
  },
  "auto_classification": {
    "good_count": <quantas você considerou boas>,
    "bad_count": <quantas você considerou fracas>,
    "neutral_count": <quantas eram inconclusivas>
  },
  "summary": "1 parágrafo de 3-4 linhas resumindo o estado do atendimento e a 1 mudança que daria maior impacto. Inclua uma frase tipo 'Esta análise foi feita em modo automático — pra refinar, marque algumas conversas como ganhas no CRM ou use o painel de avaliação de qualidade.'"
}

Regras:
- NÃO INVENTE frases. Parafraseia se precisar mas mantém o sentido real.
- Se a amostra for muito pequena/ambígua, declare no summary.
- winning_scripts: 6-12 itens. losing_scripts: 4-8 itens. training_tips: 4-8 itens.
- system_prompt: NÃO escreva um parágrafo corrido. Siga À RISCA a ESPECIFICAÇÃO abaixo.
- Tudo em português brasileiro.

=== ESPECIFICAÇÃO DO system_prompt (OBRIGATÓRIA) ===
${SYSTEM_PROMPT_SPEC}`;

function formatConversationSample(conv: {
  id: string;
  quality_score: number | null;
  messages: Array<{ sender_role: string; text: string | null; audio_transcript: string | null }>;
}): string {
  const msgs = conv.messages.slice(0, MAX_MSGS_PER_CONV);
  const lines = msgs.map((m) => {
    const who = m.sender_role === "seller" ? "V" : "L";
    const body = (m.text ?? m.audio_transcript ?? "[mídia]").slice(0, 400);
    return `[${who}] ${body}`;
  });
  return `--- Conversa ${conv.id.slice(0, 8)} (score ${conv.quality_score ?? "?"}) ---\n${lines.join("\n")}`;
}

type PlaybookResponse = {
  system_prompt: string;
  winning_scripts: Array<{ category: string; script: string; why: string }>;
  losing_scripts: Array<{ category: string; script: string; why_bad: string }>;
  training_tips: Array<{ priority: string; gap: string; drill: string }>;
  vocabulary: { signature_phrases: string[]; avoid: string[] };
  voice_tone: { formality: string; register: string; energy: string; description: string };
  summary: string;
};

export type GeneratePlaybookResult =
  | { ok: true; mode: "curated" | "auto"; snapshotId: string; good: number; bad: number; total: number }
  | { ok: false; reason: "no_conversations"; have: number };

type Sample = {
  id: string;
  quality_score: number | null;
  messages: Array<{ sender_role: string; text: string | null; audio_transcript: string | null }>;
};

async function loadMessagesFor(ids: string[]): Promise<Map<string, Sample["messages"]>> {
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("conversation_id, sender_role, text, audio_transcript, ts")
    .in("conversation_id", ids)
    .order("ts", { ascending: true });
  const out = new Map<string, Sample["messages"]>();
  for (const m of messages ?? []) {
    const list = out.get(m.conversation_id) ?? [];
    list.push({ sender_role: m.sender_role, text: m.text, audio_transcript: m.audio_transcript });
    out.set(m.conversation_id, list);
  }
  return out;
}

export async function generatePlaybook(generatedBy: string | null): Promise<GeneratePlaybookResult> {
  // Thresholds de qualidade (mesmos do DNA). Garante que "boas" e "fracas" sejam
  // realmente distintas — sem isso, com poucas avaliações, as MESMAS conversas
  // entravam nas duas listas e poluíam o contraste enviado à IA.
  const { data: cfg } = await supabaseAdmin
    .from("app_settings")
    .select("dna_quality_min_good, dna_quality_max_bad")
    .eq("id", true)
    .maybeSingle();
  const minGood = (cfg as any)?.dna_quality_min_good ?? 75;
  const maxBad = (cfg as any)?.dna_quality_max_bad ?? 40;

  // ===== Decide modo: CURATED (tem quality_score curado) vs AUTO (IA classifica) =====
  const { data: goodConvs } = await supabaseAdmin
    .from("conversations")
    .select("id, quality_score, message_count")
    .gte("quality_score", minGood)
    .gte("message_count", 4)
    .order("quality_score", { ascending: false })
    .limit(SAMPLE_GOOD);

  const { data: badConvs } = await supabaseAdmin
    .from("conversations")
    .select("id, quality_score, message_count")
    .lte("quality_score", maxBad)
    .gte("message_count", 4)
    .order("quality_score", { ascending: true })
    .limit(SAMPLE_BAD);

  const goods = goodConvs ?? [];
  const bads = badConvs ?? [];
  const curatedAvailable = goods.length + bads.length;

  // Threshold pra modo curated: pelo menos 6 amostras avaliadas (3 boas + 3 fracas)
  const useCurated = curatedAvailable >= 6 && goods.length >= 2 && bads.length >= 2;

  // Provider OpenAI BYOK (prioritário) > Lovable AI (Gemini). Resolve uma vez.
  const resolved = await resolveChatProvider();

  let mode: "curated" | "auto";
  let parsed: PlaybookResponse;
  let goodSamples: Sample[] = [];
  let badSamples: Sample[] = [];
  let conversationsAnalyzed: number;
  // Provider/model EFETIVAMENTE usado (pode mudar por fallback) — grava no snapshot.
  let usedProvider = resolved.provider;
  let usedModel = resolved.model;

  if (useCurated) {
    mode = "curated";
    const allIds = [...goods.map((c) => c.id), ...bads.map((c) => c.id)];
    const msgs = await loadMessagesFor(allIds);
    goodSamples = goods.map((c) => ({ id: c.id, quality_score: c.quality_score, messages: msgs.get(c.id) ?? [] }));
    badSamples = bads.map((c) => ({ id: c.id, quality_score: c.quality_score, messages: msgs.get(c.id) ?? [] }));
    conversationsAnalyzed = goodSamples.length + badSamples.length;

    await chargeLlmCost({
      provider: resolved.provider, model: resolved.model,
      costUsd: PLAYBOOK_COST_USD_CURATED, source: "analyze",
    });

    const userPrompt = `Amostras de conversas REAIS (já anonimizadas):

===== BOAS (alta qualidade) =====
${goodSamples.map(formatConversationSample).join("\n\n") || "(nenhuma)"}

===== FRACAS (baixa qualidade) =====
${badSamples.map(formatConversationSample).join("\n\n") || "(nenhuma)"}

Extraia o DNA do atendimento conforme instruído. Devolva APENAS o JSON.`;

    const { text: raw, provider, model } = await chatCompletion({
      resolved,
      systemPrompt: SYSTEM_PROMPT_CURATED,
      userPrompt,
      responseFormat: "json",
      temperature: 0.3,
    });
    usedProvider = provider;
    usedModel = model;
    parsed = parseJsonLoose(raw);
  } else {
    // ===== Modo AUTO: pega amostra representativa, IA classifica e extrai =====
    mode = "auto";
    const { data: autoConvs } = await supabaseAdmin
      .from("conversations")
      .select("id, quality_score, message_count, last_msg_at")
      .gte("message_count", 4)
      .order("last_msg_at", { ascending: false, nullsFirst: false })
      .limit(SAMPLE_AUTO);

    const sample = autoConvs ?? [];
    if (sample.length < MIN_CONVS_FOR_PLAYBOOK) {
      return { ok: false, reason: "no_conversations", have: sample.length };
    }

    const msgs = await loadMessagesFor(sample.map((c) => c.id));
    const autoSamples: Sample[] = sample.map((c) => ({
      id: c.id, quality_score: c.quality_score, messages: msgs.get(c.id) ?? [],
    }));
    conversationsAnalyzed = autoSamples.length;

    await chargeLlmCost({
      provider: resolved.provider, model: resolved.model,
      costUsd: PLAYBOOK_COST_USD_AUTO, source: "analyze",
    });

    const userPrompt = `Amostra de ${autoSamples.length} conversas REAIS (já anonimizadas).
Sua tarefa é classificar internamente cada uma como boa/fraca e extrair o DNA contrastando os dois grupos.

${autoSamples.map(formatConversationSample).join("\n\n")}

Devolva APENAS o JSON conforme instruído (inclua auto_classification).`;

    const { text: raw, provider, model } = await chatCompletion({
      resolved,
      systemPrompt: SYSTEM_PROMPT_AUTO,
      userPrompt,
      responseFormat: "json",
      temperature: 0.3,
    });
    usedProvider = provider;
    usedModel = model;
    parsed = parseJsonLoose(raw);
  }

  if (!parsed.system_prompt) throw new Error("Resposta da IA sem 'system_prompt'.");

  // Conta good/bad pra registro do snapshot
  const goodCount = mode === "curated" ? goodSamples.length : ((parsed as any).auto_classification?.good_count ?? 0);
  const badCount = mode === "curated" ? badSamples.length : ((parsed as any).auto_classification?.bad_count ?? 0);

  const { data: snap, error } = await supabaseAdmin
    .from("playbook_snapshots")
    .insert({
      generated_by: generatedBy,
      conversations_analyzed: conversationsAnalyzed,
      good_samples: goodCount,
      bad_samples: badCount,
      system_prompt: parsed.system_prompt,
      winning_scripts: (parsed.winning_scripts ?? []) as never,
      losing_scripts: (parsed.losing_scripts ?? []) as never,
      training_tips: (parsed.training_tips ?? []) as never,
      vocabulary: (parsed.vocabulary ?? { signature_phrases: [], avoid: [] }) as never,
      voice_tone: (parsed.voice_tone ?? {}) as never,
      summary: parsed.summary ?? null,
      model: `${usedModel} (${mode})`,
      provider: usedProvider,
      cost_usd: mode === "auto" ? PLAYBOOK_COST_USD_AUTO : PLAYBOOK_COST_USD_CURATED,
    })
    .select("id")
    .single();
  if (error || !snap) throw new Error(error?.message ?? "Falha ao salvar playbook.");

  await supabaseAdmin
    .from("app_settings")
    .upsert({ id: true, current_playbook_snapshot_id: snap.id } as never, { onConflict: "id" });

  return {
    ok: true,
    mode,
    snapshotId: snap.id,
    good: goodCount,
    bad: badCount,
    total: conversationsAnalyzed,
  };
}

function parseJsonLoose(raw: string): PlaybookResponse {
  try {
    return JSON.parse(raw) as PlaybookResponse;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Resposta da IA não retornou JSON válido.");
    return JSON.parse(match[0]) as PlaybookResponse;
  }
}
