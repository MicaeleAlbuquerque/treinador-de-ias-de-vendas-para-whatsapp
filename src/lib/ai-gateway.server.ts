// Helpers de LLM. Dois provedores de chat:
//   1. OpenAI (BYOK) — PRIORITÁRIO quando há chave cadastrada em app_secrets ou .env.
//   2. Google Gemini / Lovable Gateway — FALLBACK quando há chave configurada.
// Transcrição de áudio continua via Gemini (input_audio) ou Whisper BYOK.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import fs from "node:fs";
import path from "node:path";

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
// Modelo OpenAI usado pra gerar os outputs (quality_score, playbook, DNA) quando
// há BYOK. gpt-4o-mini: ótimo custo/qualidade pra análise de texto em PT-BR.
const OPENAI_CHAT_MODEL = "gpt-4o-mini";
const GEMINI_CHAT_MODEL = "google/gemini-2.5-flash";
const GEMINI_DIRECT_MODEL = readEnvVar("GEMINI_MODEL") || "gemini-3.6-flash";

export type LlmProvider = "openai" | "google";

export type ResolvedProvider = {
  provider: LlmProvider;
  model: string; // rótulo pra registrar custo/snapshot (sem prefixo de gateway)
  apiModel: string; // id do modelo pra mandar na request
  openaiKey: string | null;
};

// Lê a variável de process.env ou diretamente do arquivo .env como fallback
// (garante que variáveis adicionadas após o início do servidor sejam lidas sem precisar reiniciar)
function readEnvVar(name: string): string | null {
  const val = process.env[name];
  if (val && val.trim().length > 0) {
    return val.trim();
  }
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const [k, ...v] = trimmed.split("=");
        if (k.trim() === name) {
          const raw = v.join("=").trim().replace(/^["']|["']$/g, "").trim();
          if (raw.length > 0) return raw;
        }
      }
    }
  } catch {
    // fallback se não puder ler disco
  }
  return null;
}

export function loadGeminiKey(): string | null {
  const key = readEnvVar("GEMINI_API_KEY") || readEnvVar("GOOGLE_API_KEY");
  return key && key.length >= 10 ? key : null;
}

export function loadLovableKey(): string | null {
  const key = readEnvVar("LOVABLE_API_KEY");
  return key && key.length >= 10 ? key : null;
}

// Lê a chave OpenAI BYOK do .env ou do cofre (app_secrets singleton id=true). Retorna null
// se não houver chave válida (>=20 chars) ou se o toggle estiver desligado.
export async function loadOpenAIKey(): Promise<string | null> {
  const envKey = readEnvVar("OPENAI_API_KEY");
  if (envKey && envKey.length >= 20) {
    return envKey;
  }
  try {
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("has_openai_byok")
      .eq("id", true)
      .maybeSingle();
    if (settings && (settings as any).has_openai_byok === false) {
      return null;
    }
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

// Decide qual provider usar: OpenAI quando há BYOK; senão Google Gemini.
// Chame UMA vez por operação e reaproveite (passe via opts.resolved) pra evitar
// re-consultar o cofre e pra cobrar o custo no provider certo.
export async function resolveChatProvider(): Promise<ResolvedProvider> {
  const openaiKey = await loadOpenAIKey();
  if (openaiKey) {
    return { provider: "openai", model: OPENAI_CHAT_MODEL, apiModel: OPENAI_CHAT_MODEL, openaiKey };
  }
  return { provider: "google", model: GEMINI_DIRECT_MODEL, apiModel: GEMINI_CHAT_MODEL, openaiKey: null };
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
    let friendlyMessage = `OpenAI (${res.status}): ${detail.slice(0, 200)}`;
    try {
      const parsed = JSON.parse(detail);
      const code = parsed?.error?.code;
      const type = parsed?.error?.type;
      const msg = parsed?.error?.message;
      if (code === "credit_balance_exhausted" || type === "insufficient_quota" || res.status === 429) {
        friendlyMessage =
          "A chave OpenAI cadastrada está sem créditos (cota esgotada). Recarregue seus créditos em platform.openai.com ou configure uma chave Gemini (GEMINI_API_KEY no arquivo .env).";
      } else if (code === "invalid_api_key" || res.status === 401) {
        friendlyMessage =
          "A chave OpenAI cadastrada é inválida ou expirou. Atualize sua chave em Configurações → Conta da IA.";
      } else if (msg) {
        friendlyMessage = `Erro na OpenAI (${res.status}): ${msg}`;
      }
    } catch {
      // fallback
    }
    const err = new Error(friendlyMessage);
    (err as any).status = res.status;
    throw err;
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callDirectGeminiChat(
  opts: { systemPrompt: string; userPrompt: string; responseFormat?: "text" | "json"; temperature?: number },
  key: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DIRECT_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const body: Record<string, unknown> = {
    system_instruction: {
      parts: [{ text: opts.systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: opts.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
    },
  };

  const maxRetries = 4;
  let lastErrorMsg = "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      }

      const detail = await res.text();
      let msg = `Google Gemini (${res.status}): ${detail.slice(0, 200)}`;
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.error?.message) {
          msg = `Google Gemini (${res.status}): ${parsed.error.message}`;
        }
      } catch {
        // fallback
      }
      lastErrorMsg = msg;

      // Se for 503 (alta demanda transitória do Google) ou 429, aguarda e tenta novamente
      if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
        const delayMs = attempt * 1800;
        console.warn(`[ai] Gemini ${res.status} (tentativa ${attempt}/${maxRetries}), aguardando ${delayMs}ms antes de tentar novamente...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw new Error(lastErrorMsg);
    } catch (e: any) {
      lastErrorMsg = e.message || String(e);
      if (attempt < maxRetries && (lastErrorMsg.includes("503") || lastErrorMsg.includes("429") || lastErrorMsg.includes("timeout") || lastErrorMsg.includes("fetch failed"))) {
        const delayMs = attempt * 1800;
        console.warn(`[ai] Gemini falhou com: "${lastErrorMsg}" (tentativa ${attempt}/${maxRetries}), aguardando ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw e;
    }
  }

  throw new Error(lastErrorMsg);
}

async function callLovableAiChat(
  opts: { systemPrompt: string; userPrompt: string; responseFormat?: "text" | "json"; temperature?: number },
  key: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "google/gemini-2.5-flash",
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
    throw new Error(`Lovable AI Gateway failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Chat unificado: prioriza OpenAI (BYOK), com Gemini direto ou Lovable AI como fallback.
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
  let lastError: Error | null = null;

  if (resolved.provider === "openai" && resolved.openaiKey) {
    try {
      const text = await callOpenAIChat(opts, resolved.openaiKey, resolved.apiModel);
      return { text, provider: "openai", model: resolved.model };
    } catch (e) {
      lastError = e as Error;
      console.warn(`[ai] OpenAI falhou: ${lastError.message}`);
    }
  }

  // Fallback 1: Direct Google Gemini API (GEMINI_API_KEY ou GOOGLE_API_KEY)
  const geminiKey = loadGeminiKey();
  if (geminiKey) {
    try {
      const text = await callDirectGeminiChat(opts, geminiKey);
      return { text, provider: "google", model: GEMINI_DIRECT_MODEL };
    } catch (e) {
      console.warn(`[ai] Gemini direto falhou: ${(e as Error).message}`);
      if (!lastError) lastError = e as Error;
    }
  }

  // Fallback 2: Lovable AI Gateway (LOVABLE_API_KEY)
  const lovableKey = loadLovableKey();
  if (lovableKey) {
    try {
      const text = await callLovableAiChat(opts, lovableKey);
      return { text, provider: "google", model: "gemini-2.5-flash" };
    } catch (e) {
      console.warn(`[ai] Lovable Gateway falhou: ${(e as Error).message}`);
      if (!lastError) lastError = e as Error;
    }
  }

  // Se houve erro no provedor configurado, lança a mensagem real para o usuário entender o motivo
  if (lastError) {
    throw lastError;
  }

  throw new Error(
    "Nenhum provedor de IA disponível. Configure sua chave OpenAI em Configurações → Conta da IA (e garanta créditos ativos) ou adicione GEMINI_API_KEY no arquivo .env."
  );
}

/** Calls Gemini with an inline audio payload and returns plain-text transcription. */
export async function transcribeAudioWithGemini(audioBase64: string, mimeType: string): Promise<string> {
  const geminiKey = loadGeminiKey();
  if (geminiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DIRECT_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const body = {
      system_instruction: {
        parts: [
          {
            text: "Você transcreve áudios em português brasileiro. Devolva apenas o texto transcrito, sem comentários adicionais.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcreva o áudio a seguir." },
            {
              inlineData: {
                mimeType: mimeType || "audio/ogg",
                data: audioBase64,
              },
            },
          ],
        },
      ],
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    }
  }

  const lovableKey = loadLovableKey();
  if (lovableKey) {
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
        "Lovable-API-Key": lovableKey,
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

  throw new Error("Nenhuma chave para transcrição de áudio configurada (GEMINI_API_KEY ou Whisper BYOK).");
}

/** Chat completion via Gemini (direto ou Lovable Gateway). Retorna texto bruto.
 * Quando responseFormat = "json", instrui o modelo a devolver JSON estrito.
 */
export async function chatCompletionGemini(opts: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  responseFormat?: "text" | "json";
  temperature?: number;
}): Promise<string> {
  const geminiKey = loadGeminiKey();
  if (geminiKey) {
    return await callDirectGeminiChat(opts, geminiKey);
  }
  const lovableKey = loadLovableKey();
  if (lovableKey) {
    return await callLovableAiChat(opts, lovableKey);
  }
  throw new Error(
    "Nenhuma chave Gemini disponível. Configure GEMINI_API_KEY no arquivo .env."
  );
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