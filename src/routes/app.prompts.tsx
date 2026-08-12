import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole } from "@/lib/user-role";
import { toast } from "sonner";
import { Copy, Download, FileText, Sparkles, Database, Brain, BookOpen, Trophy } from "lucide-react";
import {
  generateSystemPromptFn, publishPromptVersionFn, generatePlaybookFn,
  generateFewShotFn, generateRagFn, generateFinetuneFn,
} from "@/lib/exports.functions";
import { getCurrentPlaybook } from "@/lib/playbook.functions";

export const Route = createFileRoute("/app/prompts")({ component: PromptsPage });

function PromptsPage() {
  const qc = useQueryClient();
  const { role } = useMyRole();
  const isAdmin = role === "admin";

  const settingsQ = useQuery({
    queryKey: ["prompts-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings")
        .select("current_dna_snapshot_id, published_prompt_version_id").eq("id", true).maybeSingle();
      return data;
    },
  });
  const snapId = settingsQ.data?.current_dna_snapshot_id ?? null;

  const snapQ = useQuery({
    queryKey: ["prompts-snap", snapId],
    enabled: !!snapId,
    queryFn: async () => {
      const { data } = await supabase.from("dna_snapshots")
        .select("id, created_at, total_conversations_analyzed").eq("id", snapId!).single();
      return data;
    },
  });

  // Playbook (Tier 1) — base de export que não exige CRM/DNA.
  const getPlaybookFn = useServerFn(getCurrentPlaybook);
  const playbookQ = useQuery({ queryKey: ["prompts-playbook"], queryFn: () => getPlaybookFn({}) });
  const playbook = playbookQ.data as any | null;

  const header = (
    <header>
      <span className="via-label">Exportação</span>
      <h1 className="mt-1 text-3xl">Prompts e artefatos</h1>
    </header>
  );

  // Sem DNA e sem Playbook: nada pra exportar ainda.
  if (!snapId && !playbook && !playbookQ.isLoading) {
    return (
      <div className="space-y-4">
        {header}
        <div className="via-card text-center py-12 space-y-3">
          <Sparkles className="mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Nada pra exportar ainda. Gere um <strong>Playbook</strong> em{" "}
            <Link to="/app/dna" className="underline">DNA</Link> (basta ter conversas importadas) pra liberar a
            exportação do system prompt. Os formatos avançados (few-shot, RAG, fine-tuning) precisam do DNA avançado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      {/* Tier 1 — export a partir do Playbook (sem CRM). */}
      {playbook && <PlaybookExportCard playbook={playbook} />}

      {/* Tier 2 — exports avançados, exigem DNA snapshot. */}
      {snapId ? (
        isAdmin ? (
          <>
            <div className="flex items-center gap-2 pt-2">
              <Trophy size={16} className="text-[color:var(--via-navy)]" />
              <h2 className="text-lg font-semibold">Exports avançados (DNA Tier 2)</h2>
              <span className="text-xs text-muted-foreground">
                snapshot <Link to="/app/dna" className="underline">{snapId.slice(0, 8)}</Link>
                {snapQ.data && ` · ${snapQ.data.total_conversations_analyzed} conversas`}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SystemPromptCard snapshotId={snapId} publishedId={settingsQ.data?.published_prompt_version_id ?? null} onChange={() => qc.invalidateQueries({ queryKey: ["prompts-settings"] })} />
              <PlaybookCard snapshotId={snapId} />
              <FewShotCard snapshotId={snapId} />
              <RagCard snapshotId={snapId} />
              <FinetuneCard snapshotId={snapId} />
            </div>
          </>
        ) : (
          <div className="via-card text-sm text-muted-foreground">Apenas administradores podem gerar os artefatos avançados.</div>
        )
      ) : (
        <div className="via-card border-dashed text-sm text-muted-foreground">
          <strong>Exports avançados</strong> (versões de system prompt, Playbook PDF, few-shot, RAG, fine-tuning JSONL)
          ficam disponíveis quando você gera o <Link to="/app/dna" className="underline">DNA avançado</Link> (Tier 2 —
          requer Won/Lost ou análise IA). Por enquanto, use a exportação do Playbook acima.
        </div>
      )}
    </div>
  );
}

// Monta o Playbook completo em Markdown (client-side, a partir do snapshot Tier 1).
function playbookToMarkdown(pb: any): string {
  const lines: string[] = [];
  lines.push("# Playbook do Atendimento");
  if (pb.generated_at) lines.push(`> Gerado em ${new Date(pb.generated_at).toLocaleString("pt-BR")} · ${pb.conversations_analyzed ?? "?"} amostras (${pb.good_samples ?? 0} boas / ${pb.bad_samples ?? 0} fracas)`);
  if (pb.summary) lines.push("\n## Resumo\n" + pb.summary);
  lines.push("\n## System Prompt\n```\n" + (pb.system_prompt ?? "") + "\n```");
  const win = (pb.winning_scripts ?? []) as any[];
  if (win.length) lines.push("\n## Scripts vencedores\n" + win.map((s) => `- **[${s.category}]** "${s.script}" — ${s.why}`).join("\n"));
  const lose = (pb.losing_scripts ?? []) as any[];
  if (lose.length) lines.push("\n## Padrões a evitar\n" + lose.map((s) => `- **[${s.category}]** "${s.script}" — ${s.why_bad}`).join("\n"));
  const tips = (pb.training_tips ?? []) as any[];
  if (tips.length) lines.push("\n## Pontos de treinamento\n" + tips.map((t) => `- **(${t.priority})** ${t.gap} → ${t.drill}`).join("\n"));
  const vocab = pb.vocabulary ?? {};
  if ((vocab.signature_phrases ?? []).length || (vocab.avoid ?? []).length) {
    lines.push("\n## Vocabulário");
    if ((vocab.signature_phrases ?? []).length) lines.push("**Expressões da marca:** " + vocab.signature_phrases.join(", "));
    if ((vocab.avoid ?? []).length) lines.push("**Evitar:** " + vocab.avoid.join(", "));
  }
  const tone = pb.voice_tone ?? {};
  if (tone.description) lines.push(`\n## Tom\n${tone.formality ?? "—"} · ${tone.register ?? "—"} · ${tone.energy ?? "—"}\n${tone.description}`);
  return lines.join("\n");
}

function downloadText(text: string, name: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function PlaybookExportCard({ playbook }: { playbook: any }) {
  const systemPrompt: string = playbook.system_prompt ?? "";
  const winning = (playbook.winning_scripts ?? []) as any[];
  const losing = (playbook.losing_scripts ?? []) as any[];
  const tips = (playbook.training_tips ?? []) as any[];
  const vocab = playbook.vocabulary ?? {};
  const tone = playbook.voice_tone ?? {};
  const [showPrompt, setShowPrompt] = useState(true);
  return (
    <div className="via-card space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen size={18} className="text-[color:var(--via-blue)]" />
        <h2 className="text-lg font-bold">Playbook do Atendimento (Tier 1 · sem CRM)</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        A partir do Playbook ativo gerado na aba <Link to="/app/dna" className="underline">DNA</Link>. Pronto pra colar
        num agente IA ou compartilhar com o time.
      </p>

      {playbook.summary && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Resumo</div>
          <p>{playbook.summary}</p>
          {playbook.generated_at && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Gerado em {new Date(playbook.generated_at).toLocaleString("pt-BR")}
              {playbook.conversations_analyzed != null && ` · ${playbook.conversations_analyzed} amostras (${playbook.good_samples ?? 0} boas / ${playbook.bad_samples ?? 0} fracas)`}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="via-btn via-btn-primary"
          onClick={() => { navigator.clipboard.writeText(systemPrompt); toast.success("System prompt copiado."); }}
          disabled={!systemPrompt}
        >
          <Copy size={14} /> Copiar system prompt
        </button>
        <button className="via-btn via-btn-secondary" onClick={() => downloadText(systemPrompt, "system-prompt.txt")} disabled={!systemPrompt}>
          <Download size={14} /> .txt
        </button>
        <button className="via-btn via-btn-secondary" onClick={() => downloadText(playbookToMarkdown(playbook), "playbook.md", "text/markdown")}>
          <Download size={14} /> Playbook completo (.md)
        </button>
      </div>

      {/* System prompt */}
      {systemPrompt && (
        <div className="rounded-lg border border-border">
          <button onClick={() => setShowPrompt((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 bg-muted/30 text-sm font-semibold">
            <Brain size={14} /> System prompt {showPrompt ? "▾" : "▸"}
          </button>
          {showPrompt && (
            <pre className="text-xs whitespace-pre-wrap font-mono bg-background p-3 max-h-72 overflow-y-auto">{systemPrompt}</pre>
          )}
        </div>
      )}

      {/* Scripts vencedores */}
      {winning.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">Scripts vencedores ({winning.length})</div>
          <ul className="space-y-2 text-sm">
            {winning.map((s: any, i: number) => (
              <li key={i} className="rounded border border-green-200 bg-green-50/40 dark:bg-green-950/20 p-2">
                <div className="text-[11px] uppercase tracking-wide text-green-700 dark:text-green-400">{s.category}</div>
                <div className="mt-1">"{s.script}"</div>
                {s.why && <div className="text-xs text-muted-foreground mt-1">{s.why}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Padrões a evitar */}
      {losing.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">Padrões a evitar ({losing.length})</div>
          <ul className="space-y-2 text-sm">
            {losing.map((s: any, i: number) => (
              <li key={i} className="rounded border border-red-200 bg-red-50/40 dark:bg-red-950/20 p-2">
                <div className="text-[11px] uppercase tracking-wide text-red-700 dark:text-red-400">{s.category}</div>
                <div className="mt-1">"{s.script}"</div>
                {s.why_bad && <div className="text-xs text-muted-foreground mt-1">{s.why_bad}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pontos de treinamento */}
      {tips.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">Pontos de treinamento ({tips.length})</div>
          <ul className="space-y-2 text-sm">
            {tips.map((t: any, i: number) => {
              const cls = t.priority === "high" ? "border-red-200 bg-red-50/30 dark:bg-red-950/20"
                : t.priority === "medium" ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/20"
                : "border-border bg-muted/20";
              return (
                <li key={i} className={`rounded border ${cls} p-2`}>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Prioridade: {t.priority ?? "—"}</div>
                  <div className="mt-1"><strong>Gap:</strong> {t.gap}</div>
                  <div className="text-sm mt-1"><strong>Drill:</strong> {t.drill}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Vocabulário + tom */}
      {((vocab.signature_phrases ?? []).length > 0 || (vocab.avoid ?? []).length > 0 || tone.description) && (
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Expressões da marca</div>
            <ul className="mt-1 text-xs space-y-1 list-disc pl-4">
              {(vocab.signature_phrases ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}
            </ul>
            {(vocab.avoid ?? []).length > 0 && (
              <>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mt-3">Evitar</div>
                <ul className="mt-1 text-xs space-y-1 list-disc pl-4 text-red-700 dark:text-red-400">
                  {(vocab.avoid ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </>
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Tom</div>
            <ul className="mt-1 text-xs space-y-1">
              <li><strong>Formalidade:</strong> {tone.formality ?? "—"}</li>
              <li><strong>Registro:</strong> {tone.register ?? "—"}</li>
              <li><strong>Energia:</strong> {tone.energy ?? "—"}</li>
            </ul>
            {tone.description && <p className="text-xs mt-2 text-muted-foreground">{tone.description}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function SystemPromptCard({ snapshotId, publishedId, onChange }: { snapshotId: string; publishedId: string | null; onChange: () => void }) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateSystemPromptFn);
  const pubFn = useServerFn(publishPromptVersionFn);
  const [tom, setTom] = useState<"formal" | "casual" | "comercial">("comercial");
  const [vertical, setVertical] = useState("");
  const [foco, setFoco] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>("");

  const versionsQ = useQuery({
    queryKey: ["prompt-versions", snapshotId],
    queryFn: async () => {
      const { data } = await supabase.from("prompt_versions").select("*").eq("dna_snapshot_id", snapshotId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function gen() {
    setBusy(true);
    try {
      const r = await genFn({ data: { parameters: { tom, vertical, foco_em_objecao: foco || null } } });
      setPreview((r as any).version.system_prompt);
      toast.success("Versão gerada");
      qc.invalidateQueries({ queryKey: ["prompt-versions", snapshotId] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function publish(versionId: string) {
    try { await pubFn({ data: { versionId } }); toast.success("Versão publicada como padrão"); qc.invalidateQueries({ queryKey: ["prompt-versions", snapshotId] }); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  }

  function download(text: string, name: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="via-card space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2"><Brain size={18}/> System Prompt</h2>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Tom</span>
          <select value={tom} onChange={(e) => setTom(e.target.value as any)} className="w-full border rounded px-2 py-1">
            <option value="comercial">Comercial</option><option value="formal">Formal</option><option value="casual">Casual</option>
          </select></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Vertical</span>
          <input value={vertical} onChange={(e) => setVertical(e.target.value)} className="w-full border rounded px-2 py-1" placeholder="ex: imóveis" /></label>
        <label className="space-y-1 col-span-2"><span className="text-xs text-muted-foreground">Foco em objeção (opcional, categoria)</span>
          <input value={foco} onChange={(e) => setFoco(e.target.value)} className="w-full border rounded px-2 py-1" placeholder="preço, prazo, ..." /></label>
      </div>
      <button disabled={busy} onClick={gen} className="via-btn via-btn-primary">{busy ? "Gerando…" : "Gerar versão"}</button>
      {preview && (
        <div className="space-y-2">
          <textarea readOnly value={preview} className="w-full text-xs font-mono border rounded p-2 h-48" />
          <div className="flex gap-2">
            <button className="via-btn via-btn-secondary text-xs" onClick={() => { navigator.clipboard.writeText(preview); toast.success("Copiado"); }}><Copy size={12} /> Copiar</button>
            <button className="via-btn via-btn-secondary text-xs" onClick={() => download(preview, "system-prompt.txt")}><Download size={12} /> .txt</button>
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground border-t border-border pt-2">Versões ({(versionsQ.data ?? []).length})</div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {(versionsQ.data ?? []).map((v: any) => (
          <div key={v.id} className="flex items-center justify-between gap-2 text-xs border-b border-border py-1">
            <div className="flex-1 truncate">
              <div className="font-bold">{v.name} {v.id === publishedId && <span className="text-green-700">★ publicada</span>}</div>
              <div className="text-muted-foreground">{new Date(v.created_at).toLocaleString("pt-BR")}</div>
            </div>
            <div className="flex gap-1">
              <button className="via-btn via-btn-secondary text-xs" onClick={() => setPreview(v.system_prompt)}>Ver</button>
              <button className="via-btn via-btn-secondary text-xs" onClick={() => download(v.system_prompt, `prompt-${v.id.slice(0,8)}.txt`)}><Download size={10}/></button>
              {v.id !== publishedId && <button className="via-btn via-btn-primary text-xs" onClick={() => publish(v.id)}>Publicar</button>}
            </div>
          </div>
        ))}
        {(versionsQ.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">Nenhuma versão ainda.</div>}
      </div>
    </div>
  );
}

function PlaybookCard({ snapshotId }: { snapshotId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(generatePlaybookFn);
  const [format, setFormat] = useState<"pdf" | "markdown">("pdf");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["playbooks", snapshotId],
    queryFn: async () => {
      const { data } = await supabase.from("playbooks").select("*").eq("dna_snapshot_id", snapshotId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  async function gen() {
    setBusy(true);
    try { await fn({ data: { format } }); toast.success("Playbook gerado"); qc.invalidateQueries({ queryKey: ["playbooks", snapshotId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="via-card space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen size={18}/> Playbook</h2>
      <div className="flex gap-2 items-end">
        <label className="space-y-1 text-sm flex-1"><span className="text-xs text-muted-foreground">Formato</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as any)} className="w-full border rounded px-2 py-1">
            <option value="pdf">PDF</option><option value="markdown">Markdown</option>
          </select></label>
        <button disabled={busy} onClick={gen} className="via-btn via-btn-primary">{busy ? "Gerando…" : "Gerar"}</button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {(q.data ?? []).map((p: any) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs border-b border-border py-1">
            <div>{p.format.toUpperCase()} · {new Date(p.created_at).toLocaleString("pt-BR")}</div>
            {p.file_url && <a href={p.file_url} target="_blank" rel="noreferrer" className="via-btn via-btn-secondary text-xs"><Download size={10}/> Baixar</a>}
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">Nenhum playbook ainda.</div>}
      </div>
    </div>
  );
}

function FewShotCard({ snapshotId }: { snapshotId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(generateFewShotFn);
  const [topN, setTopN] = useState(50);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["jobs-fewshot", snapshotId],
    queryFn: async () => {
      const { data } = await supabase.from("export_jobs").select("*").eq("dna_snapshot_id", snapshotId).eq("type", "fewshot").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });
  async function gen() {
    setBusy(true);
    try { const r = await fn({ data: { topN } }) as any; toast.success(`Few-shot pronto (${r.count} amostras)`); qc.invalidateQueries({ queryKey: ["jobs-fewshot", snapshotId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="via-card space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2"><FileText size={18}/> Few-shot dataset</h2>
      <div className="flex gap-2 items-end">
        <label className="space-y-1 text-sm flex-1"><span className="text-xs text-muted-foreground">Top N conversas ganhas</span>
          <input type="number" min={1} max={500} value={topN} onChange={(e) => setTopN(Number(e.target.value))} className="w-full border rounded px-2 py-1" /></label>
        <button disabled={busy} onClick={gen} className="via-btn via-btn-primary">{busy ? "Gerando…" : "Gerar"}</button>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {(q.data ?? []).map((j: any) => (
          <div key={j.id} className="flex items-center justify-between gap-2 text-xs border-b border-border py-1">
            <div>{new Date(j.created_at).toLocaleString("pt-BR")}</div>
            {j.file_url && <a href={j.file_url} target="_blank" rel="noreferrer" className="via-btn via-btn-secondary text-xs"><Download size={10}/> .json</a>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RagCard({ snapshotId }: { snapshotId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(generateRagFn);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["jobs-rag", snapshotId],
    queryFn: async () => {
      const { data } = await supabase.from("export_jobs").select("*").eq("dna_snapshot_id", snapshotId).eq("type", "rag").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });
  async function gen() {
    setBusy(true);
    try { await fn(); toast.success("RAG bundle gerado"); qc.invalidateQueries({ queryKey: ["jobs-rag", snapshotId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="via-card space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2"><Database size={18}/> RAG bundle</h2>
      <p className="text-xs text-muted-foreground">FAQ + snippets por etapa + objeções vencedoras. Ingestion direta em N8N, Typebot, etc.</p>
      <button disabled={busy} onClick={gen} className="via-btn via-btn-primary">{busy ? "Gerando…" : "Gerar bundle"}</button>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {(q.data ?? []).map((j: any) => (
          <div key={j.id} className="flex items-center justify-between gap-2 text-xs border-b border-border py-1">
            <div>{new Date(j.created_at).toLocaleString("pt-BR")}</div>
            {j.file_url && <a href={j.file_url} target="_blank" rel="noreferrer" className="via-btn via-btn-secondary text-xs"><Download size={10}/> .json</a>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FinetuneCard({ snapshotId }: { snapshotId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(generateFinetuneFn);
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["jobs-ft", snapshotId],
    queryFn: async () => {
      const { data } = await supabase.from("export_jobs").select("*").eq("dna_snapshot_id", snapshotId).in("type", ["finetune_openai", "finetune_gemini"]).order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });
  async function gen() {
    setBusy(true);
    try { await fn({ data: { provider } }); toast.success("Dataset de fine-tuning gerado"); qc.invalidateQueries({ queryKey: ["jobs-ft", snapshotId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="via-card space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles size={18}/> Fine-tuning</h2>
      <div className="flex gap-2 items-end">
        <label className="space-y-1 text-sm flex-1"><span className="text-xs text-muted-foreground">Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value as any)} className="w-full border rounded px-2 py-1">
            <option value="openai">OpenAI (.jsonl chat)</option>
            <option value="gemini">Gemini (.jsonl)</option>
          </select></label>
        <button disabled={busy} onClick={gen} className="via-btn via-btn-primary">{busy ? "Gerando…" : "Gerar"}</button>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {(q.data ?? []).map((j: any) => (
          <div key={j.id} className="flex items-center justify-between gap-2 text-xs border-b border-border py-1">
            <div>{j.type === "finetune_openai" ? "OpenAI" : "Gemini"} · {new Date(j.created_at).toLocaleString("pt-BR")}</div>
            {j.file_url && <a href={j.file_url} target="_blank" rel="noreferrer" className="via-btn via-btn-secondary text-xs"><Download size={10}/> .jsonl</a>}
          </div>
        ))}
      </div>
    </div>
  );
}