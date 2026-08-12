// Helpers de LLM. Dois provedores de chat:
//   1. OpenAI (BYOK) — PRIORITÁRIO quando há chave cadastrada em app_secrets.
//   2. Lovable AI Gateway (Gemini) — FALLBACK (LOVABLE_API_KEY auto-provisionado).
// Transcrição de áudio continua via Gemini (input_audio) ou Whisper BYOK.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
// Modelo OpenAI usado pra gerar os outputs (quality_score, playbook, DNA) quando
// há BYOK. gpt-4o-mini: ótimo custo/qualidade pra análise de texto em PT-BR.
const OPENAI_CHAT_MODEL = "gpt-4o-mini";
const GEMINI_CHAT_MODEL = "google/gemini-2.5-flash";

export type LlmProvider = "openai" | "google";

export type ResolvedProvider = {
  provider: LlmProvider;
  model: string; // rótulo pra registrar custo/snapshot (sem prefixo de gateway)
  apiModel: string; // id do modelo pra mandar na request
  openaiKey: string | null;
};

function requireKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente. Provisione Lovable AI Gateway.");
  return key;
}

// Lê a chave OpenAI BYOK do cofre (app_secrets singleton id=true). Retorna null
// se não houver chave válida (>=20 chars).
async function loadOpenAIKey(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("app_secrets")
      .select("openai_api_key")
      .eq("id", true)
      .maybeSingle();
    const key = (data as { openai_api_key?: string | null } | null)?.openai_api_key ?? null;
    return key && key.trim().length >= 20 ? key.trim() : null;
  } catch {
    return null;
  }
}

// Decide qual provider usar: OpenAI quando há BYOK; senão Lovable AI (Gemini).
// Chame UMA vez por operação e reaproveite (passe via opts.resolved) pra evitar
// re-consultar o cofre e pra cobrar o custo no provider certo.
export async function resolveChatProvider(): Promise<ResolvedProvider> {
  const openaiKey = await loadOpenAIKey();
  if (openaiKey) {
    return { provider: "openai", model: OPENAI_CHAT_MODEL, apiModel: OPENAI_CHAT_MODEL, openaiKey };
  }
  return { provider: "google", model: "gemini-2.5-flash", apiModel: GEMINI_CHAT_MODEL, openaiKey: null };
}

async function callOpenAIChat(
  opts: { systemPrompt: string; userPrompt: string; responseFormat?: "text" | "json"; temperature?: number },
  key: string,
  model: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.responseFormat === "json") body.response_format = { type: "json_object" };
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI chat failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Chat unificado: prioriza OpenAI (BYOK), com Lovable AI (Gemini) como fallback.
 * Retorna o texto + o provider/model EFETIVAMENTE usado (após eventual fallback),
 * pra o caller registrar custo e persistir corretamente. */
export async function chatCompletion(opts: {
  systemPrompt: string;
  userPrompt: string;
  responseFormat?: "text" | "json";
  temperature?: number;
  resolved?: ResolvedProvider;
}): Promise<{ text: string; provider: LlmProvider; model: string }> {
  const resolved = opts.resolved ?? (await resolveChatProvider());
  if (resolved.provider === "openai" && resolved.openaiKey) {
    try {
      const text = await callOpenAIChat(opts, resolved.openaiKey, resolved.apiModel);
      return { text, provider: "openai", model: resolved.model };
    } catch (e) {
      console.warn(`[ai] OpenAI falhou, caindo pro Lovable AI (Gemini): ${(e as Error).message}`);
    }
  }
  const text = await chatCompletionGemini({
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    responseFormat: opts.responseFormat,
    temperature: opts.temperature,
  });
  return { text, provider: "google", model: "gemini-2.5-flash" };
}

/** Calls Gemini with an inline audio payload and returns plain-text transcription. */
export async function transcribeAudioWithGemini(audioBase64: string, mimeType: string): Promise<string> {
  const key = requireKey();
  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content:
          "Você transcreve áudios em português brasileiro. Devolva apenas o texto transcrito, sem comentários adicionais.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcreva o áudio a seguir." },
          {
            type: "input_audio",
            input_audio: { data: audioBase64, format: mimeType.split("/")[1] ?? "ogg" },
          },
        ],
      },
    ],
  };
  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "raw-fetch",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini transcribe failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Chat completion via Lovable AI Gateway (Gemini). Retorna texto bruto.
 * Quando responseFormat = "json", instrui o modelo a devolver JSON estrito.
 */
export async function chatCompletionGemini(opts: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  responseFormat?: "text" | "json";
  temperature?: number;
}): Promise<string> {
  const key = requireKey();
  const body: Record<string, unknown> = {
    model: opts.model ?? "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "raw-fetch",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini chat failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Busca web via OpenAI Responses API (tool web_search). Só funciona com BYOK
 * OpenAI. Retorna { ok, text } — ok=false se não há chave ou a API falhar, pra
 * o caller cair num fallback sem pesquisa. */
export async function searchWithOpenAI(prompt: string): Promise<{ ok: boolean; text: string }> {
  const key = await loadOpenAIKey();
  if (!key) return { ok: false, text: "" };
  // A Responses API trocou o nome do tool entre versões; tenta os dois.
  for (const toolType of ["web_search", "web_search_preview"]) {
    try {
      const res = await fetch(`${OPENAI_BASE}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-4o", input: prompt, tools: [{ type: toolType }] }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      let text: string = data.output_text ?? "";
      if (!text && Array.isArray(data.output)) {
        for (const item of data.output) {
          for (const c of item?.content ?? []) {
            if (typeof c?.text === "string") text += c.text;
          }
        }
      }
      if (text.trim()) return { ok: true, text: text.trim() };
    } catch {
      // tenta o próximo tool type
    }
  }
  return { ok: false, text: "" };
}

/** Calls OpenAI Whisper API directly using a user-provided BYOK key. */
export async function transcribeAudioWithWhisper(
  audioBytes: ArrayBuffer,
  filename: string,
  byokKey: string,
): Promise<string> {
  const form = new FormData();
  const blob = new Blob([audioBytes], { type: "audio/ogg" });
  form.append("file", blob, filename);
  form.append("model", "whisper-1");
  form.append("language", "pt");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${byokKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Whisper failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? "";
}