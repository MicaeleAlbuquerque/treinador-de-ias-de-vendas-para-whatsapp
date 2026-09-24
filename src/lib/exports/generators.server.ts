// Server-only generators for the 5 export formats.
// All read from a DNA snapshot and return serializable payloads.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsPDF } from "jspdf";

type SnapshotBundle = {
  snapshot: any;
  scores: any[]; // with seller_name
  objections: any[];
  antipatterns: any[];
};

export async function loadSnapshotBundle(snapshotId: string): Promise<SnapshotBundle> {
  const [{ data: snapshot }, { data: scores }, { data: objections }, { data: antipatterns }] = await Promise.all([
    supabaseAdmin.from("dna_snapshots").select("*").eq("id", snapshotId).single(),
    supabaseAdmin.from("seller_dna_scores").select("*").eq("snapshot_id", snapshotId).order("score", { ascending: false }),
    supabaseAdmin.from("dna_objections").select("*").eq("snapshot_id", snapshotId).order("win_rate", { ascending: false }),
    supabaseAdmin.from("dna_antipatterns").select("*").eq("snapshot_id", snapshotId).order("lift", { ascending: false }).limit(20),
  ]);
  if (!snapshot) throw new Error("Snapshot não encontrado");
  const sellerIds = [...new Set((scores ?? []).map((s: any) => s.seller_id))];
  const nameById = new Map<string, string>();
  if (sellerIds.length > 0) {
    const { data: ss } = await supabaseAdmin.from("sellers").select("id, name").in("id", sellerIds);
    for (const s of ss ?? []) nameById.set(s.id, s.name);
  }
  const scoresWithName = (scores ?? []).map((s: any) => ({ ...s, seller_name: nameById.get(s.seller_id) ?? "Vendedor" }));
  return { snapshot, scores: scoresWithName, objections: objections ?? [], antipatterns: antipatterns ?? [] };
}

// ========== System Prompt ==========
export type PromptParams = {
  tom?: "formal" | "casual" | "comercial";
  foco_em_objecao?: string | null;
  canal?: string;
  vertical?: string;
};

export function buildSystemPrompt(bundle: SnapshotBundle, p: PromptParams): string {
  const tom = p.tom ?? "comercial";
  const vertical = p.vertical?.trim() || "vendas em geral";
  const canal = p.canal ?? "whatsapp";
  const top = bundle.scores.find((s) => s.is_top_performer) ?? bundle.scores[0];
  const topName = top?.seller_name ?? "vendedor referência";
  const topWin = top ? Math.round((Number(top.win_rate) || 0) * 100) : 0;
  const avgFrt = top?.avg_first_response_minutes != null ? Number(top.avg_first_response_minutes).toFixed(0) : "—";

  const objList = bundle.objections
    .filter((o) => !p.foco_em_objecao || o.category === p.foco_em_objecao)
    .slice(0, 5);
  const antiList = bundle.antipatterns.slice(0, 10);

  const tomGuide = {
    formal: "Use português formal, trate o lead por você, evite gírias.",
    casual: "Use tom leve e próximo, contrações ('tá', 'pra') quando natural.",
    comercial: "Direto ao ponto, foco em valor e próximos passos.",
  }[tom];

  return [
    `# Persona`,
    `Você é um vendedor sênior do setor de ${vertical}, atuando via ${canal}.`,
    `Seu perfil de referência é ${topName} (win rate ${topWin}%, 1ª resposta em ${avgFrt} min).`,
    ``,
    `# Diretrizes de tom`,
    `- ${tomGuide}`,
    `- Mensagens curtas (≤ 3 linhas) sempre que possível.`,
    `- Termine cada resposta com 1 pergunta ou 1 CTA claro.`,
    ``,
    `# Top objeções e respostas vencedoras`,
    ...(objList.length === 0
      ? ["(sem objeções catalogadas ainda)"]
      : objList.map((o, i) => `${i + 1}. [${o.category}] ${o.seller_response} (win rate ${Math.round((Number(o.win_rate) || 0) * 100)}%, ${o.sample_size} amostras)`)),
    ``,
    `# Evite estes padrões (antipadrão observado em conversas perdidas)`,
    ...(antiList.length === 0
      ? ["(sem antipadrões detectados)"]
      : antiList.map((a, i) => `${i + 1}. "${a.ngram}" (lift ${Number(a.lift).toFixed(2)}×)`)),
    ``,
    `# Cadência ideal`,
    `- Responda a 1ª mensagem do lead em até ${avgFrt} minutos quando possível.`,
    `- Não envie mais que 3 mensagens consecutivas sem resposta do lead.`,
    ``,
    `# Regras gerais`,
    `- Nunca prometa o que não pode cumprir.`,
    `- Personalize cada resposta com o que o lead disse antes.`,
    `- Se o lead pedir desconto, peça contexto antes de ceder.`,
  ].join("\n");
}

// ========== Playbook (PDF + Markdown) ==========
export function buildPlaybookMarkdown(bundle: SnapshotBundle): string {
  const top = bundle.scores.find((s) => s.is_top_performer) ?? bundle.scores[0];
  const lines: string[] = [];
  lines.push(`# Playbook de Vendas`);
  lines.push(``);
  lines.push(`_Snapshot ${bundle.snapshot.id} · ${new Date(bundle.snapshot.created_at).toLocaleString("pt-BR")}_`);
  lines.push(``);
  lines.push(`## Top performer`);
  if (top) {
    lines.push(`- **${top.seller_name}** — win rate ${Math.round((Number(top.win_rate) || 0) * 100)}%, ${top.total_conversations} conversas`);
    if (top.avg_first_response_minutes != null) lines.push(`- 1ª resposta média: ${Number(top.avg_first_response_minutes).toFixed(0)} min`);
  }
  lines.push(``);
  lines.push(`## Ranking completo`);
  for (const s of bundle.scores) {
    lines.push(`- ${s.seller_name}: score ${Number(s.score).toFixed(3)}, win rate ${Math.round((Number(s.win_rate) || 0) * 100)}%`);
  }
  lines.push(``);
  lines.push(`## Etapas do funil (distribuição do top performer)`);
  const dist = (top?.stage_distribution as Record<string, number>) ?? {};
  for (const st of ["abertura", "qualificacao", "valor", "objecao", "fechamento"]) {
    lines.push(`- **${st}**: ${dist[st] ?? 0} mensagens`);
  }
  lines.push(``);
  lines.push(`## Biblioteca de objeções vencedoras`);
  for (const o of bundle.objections.slice(0, 20)) {
    lines.push(`### ${o.category} (${Math.round((Number(o.win_rate) || 0) * 100)}% win, ${o.sample_size} amostras)`);
    lines.push(`> ${o.seller_response}`);
    lines.push(``);
  }
  lines.push(`## Antipadrão (evite)`);
  for (const a of bundle.antipatterns) {
    lines.push(`- "${a.ngram}" — lift ${Number(a.lift).toFixed(2)}×`);
  }
  lines.push(``);
  lines.push(`## Cadência ideal`);
  const avg = top?.avg_first_response_minutes != null ? Number(top.avg_first_response_minutes).toFixed(0) : "—";
  lines.push(`- 1ª resposta em até ${avg} minutos.`);
  lines.push(`- Lead response rate alvo: ${top ? Math.round((Number(top.lead_response_rate) || 0) * 100) : "—"}%`);
  return lines.join("\n");
}

export function buildPlaybookPdf(bundle: SnapshotBundle): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const md = buildPlaybookMarkdown(bundle);
  const lines = doc.splitTextToSize(md.replace(/[#>*_`]/g, ""), 500);
  let y = 40;
  doc.setFontSize(11);
  for (const ln of lines) {
    if (y > 800) { doc.addPage(); y = 40; }
    doc.text(String(ln), 40, y);
    y += 14;
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

// ========== Few-shot ==========
export async function buildFewShot(snapshotId: string, topN: number) {
  const { scores } = await loadSnapshotBundle(snapshotId);
  const topSellerIds = scores.filter((s) => s.is_top_performer).map((s) => s.seller_id);
  if (topSellerIds.length === 0) return [];

  const { data: convs } = await supabaseAdmin
    .from("conversations")
    .select("id, seller_id, outcome")
    .eq("outcome", "won")
    .in("seller_id", topSellerIds)
    .limit(topN);
  const convIds = (convs ?? []).map((c) => c.id);
  if (convIds.length === 0) return [];

  const { data: msgs } = await supabaseAdmin
    .from("messages")
    .select("conversation_id, sender_role, text, audio_transcript, stage, ts")
    .in("conversation_id", convIds)
    .order("ts", { ascending: true });

  const byConv = new Map<string, any[]>();
  for (const m of msgs ?? []) {
    const arr = byConv.get(m.conversation_id) ?? [];
    arr.push(m);
    byConv.set(m.conversation_id, arr);
  }

  const samples: any[] = [];
  for (const convId of convIds) {
    const ms = byConv.get(convId) ?? [];
    for (let i = 1; i < ms.length; i++) {
      const prev = ms[i - 1];
      const cur = ms[i];
      if (prev.sender_role === "lead" && cur.sender_role === "seller") {
        samples.push({
          context: `Etapa: ${cur.stage ?? "desconhecida"}`,
          lead_message: prev.text ?? prev.audio_transcript ?? "",
          seller_response: cur.text ?? cur.audio_transcript ?? "",
          outcome: "won",
          stage: cur.stage ?? null,
        });
      }
    }
  }
  return samples;
}

// ========== RAG ==========
export async function buildRagBundle(snapshotId: string) {
  const bundle = await loadSnapshotBundle(snapshotId);
  const snippets: Record<string, string[]> = { abertura: [], qualificacao: [], valor: [], objecao: [], fechamento: [] };

  const topSellerIds = bundle.scores.filter((s) => s.is_top_performer).map((s) => s.seller_id);
  if (topSellerIds.length > 0) {
    const { data: convs } = await supabaseAdmin
      .from("conversations").select("id").eq("outcome", "won").in("seller_id", topSellerIds).limit(50);
    const convIds = (convs ?? []).map((c) => c.id);
    if (convIds.length > 0) {
      const { data: msgs } = await supabaseAdmin
        .from("messages").select("text, audio_transcript, stage")
        .in("conversation_id", convIds).eq("sender_role", "seller").not("stage", "is", null);
      for (const m of msgs ?? []) {
        const s = m.stage as string;
        if (snippets[s] && (m.text || m.audio_transcript)) snippets[s].push((m.text ?? m.audio_transcript ?? "").slice(0, 280));
      }
      for (const k of Object.keys(snippets)) snippets[k] = [...new Set(snippets[k])].slice(0, 15);
    }
  }

  const objByCategory = new Map<string, string[]>();
  for (const o of bundle.objections) {
    const arr = objByCategory.get(o.category) ?? [];
    arr.push(o.seller_response);
    objByCategory.set(o.category, arr);
  }

  return {
    metadata: { snapshot_id: snapshotId, created_at: new Date().toISOString() },
    faq: bundle.objections.slice(0, 20).map((o) => ({ question: `Lead diz: ${o.category}`, answer: o.seller_response })),
    snippets_by_stage: snippets,
    objections: [...objByCategory.entries()].map(([category, winning_responses]) => ({ category, winning_responses })),
  };
}

// ========== Fine-tuning ==========
export async function buildFinetuneJsonl(snapshotId: string, provider: "openai_chat" | "gemini", systemPrompt: string): Promise<string> {
  const samples = await buildFewShot(snapshotId, 200);
  const out: string[] = [];
  for (const s of samples) {
    if (provider === "openai_chat") {
      out.push(JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: s.lead_message },
          { role: "assistant", content: s.seller_response },
        ],
      }));
    } else {
      out.push(JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: s.lead_message }] },
          { role: "model", parts: [{ text: s.seller_response }] },
        ],
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }));
    }
  }
  return out.join("\n");
}

// ========== Storage upload helper ==========
export async function uploadExport(path: string, body: Uint8Array | string, contentType: string): Promise<string> {
  const buf = typeof body === "string" ? new TextEncoder().encode(body) : body;
  let { error } = await supabaseAdmin.storage.from("exports").upload(path, buf, { contentType, upsert: true });
  if (error && error.message.toLowerCase().includes("not found")) {
    await supabaseAdmin.storage.createBucket("exports", { public: false });
    const retry = await supabaseAdmin.storage.from("exports").upload(path, buf, { contentType, upsert: true });
    error = retry.error;
  }
  if (error) throw new Error(error.message);
  const { data: signed, error: e2 } = await supabaseAdmin.storage.from("exports").createSignedUrl(path, 60 * 60 * 24 * 7);
  if (e2 || !signed) throw new Error(e2?.message ?? "signed url failed");
  return signed.signedUrl;
}