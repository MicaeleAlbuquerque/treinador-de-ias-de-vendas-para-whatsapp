import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole } from "@/lib/user-role";
import { toast } from "sonner";
import { Copy, Download, FileText, Sparkles, Database, Brain, BookOpen, Trophy, Trash2 } from "lucide-react";
import {
  generateSystemPromptFn, publishPromptVersionFn, generatePlaybookFn,
  generateFewShotFn, generateRagFn, generateFinetuneFn,
  listPromptVersionsFn, listPlaybooksFn, listExportJobsFn,
  deletePromptVersionFn, deletePlaybookFn, deleteExportJobFn,
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
              <Trophy size={16} className="text-foreground" />
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
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 text-sm font-semibold border-b border-border">
            <button onClick={() => setShowPrompt((v) => !v)} className="flex items-center gap-2 hover:opacity-85 transition-opacity">
              <Brain size={14} className="text-[color:var(--via-blue)]" />
              <span className="font-bold text-foreground">System prompt do Playbook</span>
              <span className="text-xs text-muted-foreground">{showPrompt ? "▾" : "▸"}</span>
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(systemPrompt); toast.success("System prompt copiado."); }}
              className="via-btn via-btn-secondary via-btn-sm py-1 text-xs"
            >
              <Copy size={12} /> Copiar
            </button>
          </div>
          {showPrompt && (
            <pre className="via-code-box border-0 rounded-none text-xs whitespace-pre-wrap font-mono p-4 max-h-80 overflow-y-auto leading-relaxed select-text">
              {systemPrompt}
            </pre>
          )}
        </div>
      )}

      {/* Scripts vencedores */}
      {winning.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-2 flex items-center gap-2">
            <span>Scripts vencedores</span>
            <span className="via-badge via-badge-success text-[10px]">{winning.length}</span>
          </div>
          <ul className="space-y-2 text-sm">
            {winning.map((s: any, i: number) => (
              <li key={i} className="rounded-lg border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">{s.category}</div>
                <div className="mt-1 font-medium text-foreground">"{s.script}"</div>
                {s.why && <div className="text-xs text-muted-foreground mt-1.5">{s.why}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Padrões a evitar */}
      {losing.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-2 flex items-center gap-2">
            <span>Padrões a evitar</span>
            <span className="via-badge via-badge-danger text-[10px]">{losing.length}</span>
          </div>
          <ul className="space-y-2 text-sm">
            {losing.map((s: any, i: number) => (
              <li key={i} className="rounded-lg border border-rose-500/30 bg-rose-50/40 dark:bg-rose-950/20 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">{s.category}</div>
                <div className="mt-1 font-medium text-foreground">"{s.script}"</div>
                {s.why_bad && <div className="text-xs text-muted-foreground mt-1.5">{s.why_bad}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pontos de treinamento */}
      {tips.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-2 flex items-center gap-2">
            <span>Pontos de treinamento</span>
            <span className="via-badge via-badge-warning text-[10px]">{tips.length}</span>
          </div>
          <ul className="space-y-2 text-sm">
            {tips.map((t: any, i: number) => {
              const cls = t.priority === "high" ? "border-rose-500/30 bg-rose-50/30 dark:bg-rose-950/20"
                : t.priority === "medium" ? "border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/20"
                : "border-border bg-muted/20";
              return (
                <li key={i} className={`rounded-lg border ${cls} p-3`}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Prioridade: {t.priority ?? "—"}</div>
                  <div className="mt-1 text-foreground"><strong>Gap:</strong> {t.gap}</div>
                  <div className="text-sm mt-1 text-foreground"><strong>Drill:</strong> {t.drill}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Vocabulário + tom */}
      {((vocab.signature_phrases ?? []).length > 0 || (vocab.avoid ?? []).length > 0 || tone.description) && (
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs uppercase font-bold tracking-wide text-muted-foreground">Expressões da marca</div>
            <ul className="mt-2 text-xs space-y-1 list-disc pl-4 text-foreground">
              {(vocab.signature_phrases ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}
            </ul>
            {(vocab.avoid ?? []).length > 0 && (
              <>
                <div className="text-xs uppercase font-bold tracking-wide text-rose-600 dark:text-rose-400 mt-3">Evitar</div>
                <ul className="mt-1 text-xs space-y-1 list-disc pl-4 text-rose-700 dark:text-rose-400 font-medium">
                  {(vocab.avoid ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs uppercase font-bold tracking-wide text-muted-foreground">Tom</div>
            <ul className="mt-2 text-xs space-y-1 text-foreground">
              <li><strong>Formalidade:</strong> {tone.formality ?? "—"}</li>
              <li><strong>Registro:</strong> {tone.register ?? "—"}</li>
              <li><strong>Energia:</strong> {tone.energy ?? "—"}</li>
            </ul>
            {tone.description && <p className="text-xs mt-2 text-muted-foreground leading-relaxed">{tone.description}</p>}
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
  const delFn = useServerFn(deletePromptVersionFn);
  const [tom, setTom] = useState<"formal" | "casual" | "comercial">("comercial");
  const [vertical, setVertical] = useState("");
  const [foco, setFoco] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const listVersions = useServerFn(listPromptVersionsFn);
  const versionsQ = useQuery({
    queryKey: ["prompt-versions", snapshotId],
    queryFn: () => listVersions({ data: { snapshotId } }),
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

  async function removeVersion(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta versão do system prompt?")) return;
    setDeletingId(id);
    try {
      await delFn({ data: { id } });
      toast.success("Versão excluída");
      qc.invalidateQueries({ queryKey: ["prompt-versions", snapshotId] });
      if (id === publishedId) onChange();
    } catch (e) { toast.error((e as Error).message); } finally { setDeletingId(null); }
  }

  function download(text: string, name: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="via-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><Brain size={18} className="text-[color:var(--via-blue)]"/> System Prompt</h2>
        <span className="via-badge via-badge-blue text-[10px]">Tier 2</span>
      </div>

      <div className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tom de Voz</span>
          <div className="via-choice-bar w-full flex">
            {(["comercial", "formal", "casual"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTom(t)}
                className={`via-choice-btn flex-1 py-1.5 capitalize ${tom === t ? "via-choice-btn-active" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vertical</span>
            <input
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="via-input text-xs py-1.5"
              placeholder="ex: imóveis, cursos, b2b..."
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Foco em objeção</span>
            <input
              value={foco}
              onChange={(e) => setFoco(e.target.value)}
              className="via-input text-xs py-1.5"
              placeholder="ex: preço, prazo..."
            />
          </label>
        </div>
      </div>

      <button disabled={busy} onClick={gen} className="via-btn via-btn-primary w-full">
        {busy ? "Gerando…" : "Gerar nova versão"}
      </button>

      {preview && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-foreground">Prévia do prompt gerado</span>
            <div className="flex gap-1.5">
              <button className="via-btn via-btn-secondary via-btn-sm py-1 text-xs" onClick={() => { navigator.clipboard.writeText(preview); toast.success("Copiado"); }}>
                <Copy size={12} /> Copiar
              </button>
              <button className="via-btn via-btn-secondary via-btn-sm py-1 text-xs" onClick={() => download(preview, "system-prompt.txt")}>
                <Download size={12} /> .txt
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={preview}
            className="w-full via-code-box text-xs font-mono p-3 h-52 leading-relaxed focus:outline-none select-text"
          />
        </div>
      )}

      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-t border-border pt-3">
        Versões salvas ({(versionsQ.data ?? []).length})
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {(versionsQ.data ?? []).map((v: any) => (
          <div key={v.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border/70 bg-card p-2">
            <div className="flex-1 truncate">
              <div className="font-bold text-foreground flex items-center gap-1.5">
                <span>{v.name}</span>
                {v.id === publishedId && <span className="via-badge via-badge-success text-[10px]">Publicada</span>}
              </div>
              <div className="text-[11px] text-muted-foreground">{new Date(v.created_at).toLocaleString("pt-BR")}</div>
            </div>
            <div className="flex gap-1 items-center">
              <button className="via-btn via-btn-secondary via-btn-sm py-1 text-xs" onClick={() => setPreview(v.system_prompt)}>Ver</button>
              <button className="via-btn via-btn-secondary via-btn-sm py-1 text-xs" onClick={() => download(v.system_prompt, `prompt-${v.id.slice(0,8)}.txt`)} title="Baixar .txt"><Download size={11}/></button>
              {v.id !== publishedId && <button className="via-btn via-btn-primary via-btn-sm py-1 text-xs" onClick={() => publish(v.id)}>Publicar</button>}
              <button
                disabled={deletingId === v.id}
                className="via-btn via-btn-secondary via-btn-sm py-1 px-1.5 text-muted-foreground hover:text-rose-500 hover:border-rose-500/30 transition-colors"
                onClick={() => removeVersion(v.id)}
                title="Excluir versão"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {(versionsQ.data ?? []).length === 0 && <div className="text-xs text-muted-foreground py-2">Nenhuma versão salva ainda.</div>}
      </div>
    </div>
  );
}

function PlaybookCard({ snapshotId }: { snapshotId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(generatePlaybookFn);
  const delFn = useServerFn(deletePlaybookFn);
  const [format, setFormat] = useState<"pdf" | "markdown">("pdf");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listPlaybooks = useServerFn(listPlaybooksFn);
  const q = useQuery({
    queryKey: ["playbooks", snapshotId],
    queryFn: () => listPlaybooks({ data: { snapshotId } }),
  });
  async function gen() {
    setBusy(true);
    try { await fn({ data: { format } }); toast.success("Playbook gerado"); qc.invalidateQueries({ queryKey: ["playbooks", snapshotId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function removePlaybook(id: string) {
    if (!confirm("Tem certeza que deseja excluir este playbook?")) return;
    setDeletingId(id);
    try {
      await delFn({ data: { id } });
      toast.success("Playbook excluído");
      qc.invalidateQueries({ queryKey: ["playbooks", snapshotId] });
    } catch (e) { toast.error((e as Error).message); } finally { setDeletingId(null); }
  }
  return (
    <div className="via-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen size={18} className="text-[color:var(--via-blue)]"/> Playbook</h2>
        <span className="via-badge via-badge-blue text-[10px]">Exportação</span>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Formato de Exportação</span>
        <div className="flex gap-2 items-center">
          <div className="via-choice-bar flex-1">
            {(["pdf", "markdown"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`via-choice-btn flex-1 py-1.5 uppercase ${format === f ? "via-choice-btn-active" : ""}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button disabled={busy} onClick={gen} className="via-btn via-btn-primary shrink-0">
            {busy ? "Gerando…" : "Gerar"}
          </button>
        </div>
      </div>

      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-t border-border pt-3">
        Arquivos gerados ({(q.data ?? []).length})
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {(q.data ?? []).map((p: any) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border/70 bg-card p-2">
            <div>
              <span className="font-bold text-foreground uppercase">{p.format}</span>
              <span className="text-[11px] text-muted-foreground ml-2">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex gap-1 items-center">
              {p.file_url && <a href={p.file_url} target="_blank" rel="noreferrer" className="via-btn via-btn-secondary via-btn-sm py-1 text-xs"><Download size={11}/> Baixar</a>}
              <button
                disabled={deletingId === p.id}
                className="via-btn via-btn-secondary via-btn-sm py-1 px-1.5 text-muted-foreground hover:text-rose-500 hover:border-rose-500/30 transition-colors"
                onClick={() => removePlaybook(p.id)}
                title="Excluir playbook"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="text-xs text-muted-foreground py-2">Nenhum playbook gerado ainda.</div>}
      </div>
    </div>
  );
}

function FewShotCard({ snapshotId }: { snapshotId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(generateFewShotFn);
  const delFn = useServerFn(deleteExportJobFn);
  const [topN, setTopN] = useState(50);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listJobs = useServerFn(listExportJobsFn);
  const q = useQuery({
    queryKey: ["jobs-fewshot", snapshotId],
    queryFn: () => listJobs({ data: { snapshotId, type: "fewshot" } }),
  });
  async function gen() {
    setBusy(true);
    try { const r = await fn({ data: { topN } }) as any; toast.success(`Few-shot pronto (${r.count} amostras)`); qc.invalidateQueries({ queryKey: ["jobs-fewshot", snapshotId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function removeJob(id: string) {
    if (!confirm("Tem certeza que deseja excluir este dataset?")) return;
    setDeletingId(id);
    try {
      await delFn({ data: { id } });
      toast.success("Dataset excluído");
      qc.invalidateQueries({ queryKey: ["jobs-fewshot", snapshotId] });
    } catch (e) { toast.error((e as Error).message); } finally { setDeletingId(null); }
  }
  return (
    <div className="via-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><FileText size={18} className="text-[color:var(--via-blue)]"/> Few-shot Dataset</h2>
        <span className="via-badge via-badge-blue text-[10px]">Treinamento</span>
      </div>

      <div className="space-y-2">
        <label className="block space-y-1.5 text-sm">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Top N conversas ganhas</span>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min={1}
              max={500}
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="via-input flex-1 py-1.5 text-xs"
            />
            <button disabled={busy} onClick={gen} className="via-btn via-btn-primary shrink-0">
              {busy ? "Gerando…" : "Gerar"}
            </button>
          </div>
        </label>
      </div>

      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-t border-border pt-3">
        Datasets prontos ({(q.data ?? []).length})
      </div>
      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
        {(q.data ?? []).map((j: any) => (
          <div key={j.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border/70 bg-card p-2">
            <div className="text-foreground">{new Date(j.created_at).toLocaleString("pt-BR")}</div>
            <div className="flex gap-1 items-center">
              {j.file_url && <a href={j.file_url} target="_blank" rel="noreferrer" className="via-btn via-btn-secondary via-btn-sm py-1 text-xs"><Download size={11}/> .json</a>}
              <button
                disabled={deletingId === j.id}
                className="via-btn via-btn-secondary via-btn-sm py-1 px-1.5 text-muted-foreground hover:text-rose-500 hover:border-rose-500/30 transition-colors"
                onClick={() => removeJob(j.id)}
                title="Excluir dataset"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="text-xs text-muted-foreground py-2">Nenhum dataset gerado ainda.</div>}
      </div>
    </div>
  );
}

function RagCard({ snapshotId }: { snapshotId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(generateRagFn);
  const delFn = useServerFn(deleteExportJobFn);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listJobs = useServerFn(listExportJobsFn);
  const q = useQuery({
    queryKey: ["jobs-rag", snapshotId],
    queryFn: () => listJobs({ data: { snapshotId, type: "rag" } }),
  });
  async function gen() {
    setBusy(true);
    try { await fn(); toast.success("RAG bundle gerado"); qc.invalidateQueries({ queryKey: ["jobs-rag", snapshotId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function removeJob(id: string) {
    if (!confirm("Tem certeza que deseja excluir este bundle RAG?")) return;
    setDeletingId(id);
    try {
      await delFn({ data: { id } });
      toast.success("Bundle RAG excluído");
      qc.invalidateQueries({ queryKey: ["jobs-rag", snapshotId] });
    } catch (e) { toast.error((e as Error).message); } finally { setDeletingId(null); }
  }
  return (
    <div className="via-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><Database size={18} className="text-[color:var(--via-blue)]"/> RAG Bundle</h2>
        <span className="via-badge via-badge-blue text-[10px]">Knowledge</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        FAQ estruturada + snippets por etapa do funil + objeções vencedoras catalogadas. Ingestion direta para N8N, Typebot ou vetores.
      </p>
      <button disabled={busy} onClick={gen} className="via-btn via-btn-primary w-full">
        {busy ? "Gerando…" : "Gerar bundle RAG"}
      </button>

      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-t border-border pt-3">
        Bundles gerados ({(q.data ?? []).length})
      </div>
      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
        {(q.data ?? []).map((j: any) => (
          <div key={j.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border/70 bg-card p-2">
            <div className="text-foreground">{new Date(j.created_at).toLocaleString("pt-BR")}</div>
            <div className="flex gap-1 items-center">
              {j.file_url && <a href={j.file_url} target="_blank" rel="noreferrer" className="via-btn via-btn-secondary via-btn-sm py-1 text-xs"><Download size={11}/> .json</a>}
              <button
                disabled={deletingId === j.id}
                className="via-btn via-btn-secondary via-btn-sm py-1 px-1.5 text-muted-foreground hover:text-rose-500 hover:border-rose-500/30 transition-colors"
                onClick={() => removeJob(j.id)}
                title="Excluir bundle"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="text-xs text-muted-foreground py-2">Nenhum bundle gerado ainda.</div>}
      </div>
    </div>
  );
}

function FinetuneCard({ snapshotId }: { snapshotId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(generateFinetuneFn);
  const delFn = useServerFn(deleteExportJobFn);
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listJobs = useServerFn(listExportJobsFn);
  const q = useQuery({
    queryKey: ["jobs-ft", snapshotId],
    queryFn: () => listJobs({ data: { snapshotId, types: ["finetune_openai", "finetune_gemini"] } }),
  });
  async function gen() {
    setBusy(true);
    try { await fn({ data: { provider } }); toast.success("Dataset de fine-tuning gerado"); qc.invalidateQueries({ queryKey: ["jobs-ft", snapshotId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function removeJob(id: string) {
    if (!confirm("Tem certeza que deseja excluir este dataset de fine-tuning?")) return;
    setDeletingId(id);
    try {
      await delFn({ data: { id } });
      toast.success("Dataset excluído");
      qc.invalidateQueries({ queryKey: ["jobs-ft", snapshotId] });
    } catch (e) { toast.error((e as Error).message); } finally { setDeletingId(null); }
  }
  return (
    <div className="via-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles size={18} className="text-[color:var(--via-blue)]"/> Fine-tuning</h2>
        <span className="via-badge via-badge-blue text-[10px]">JSONL</span>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Provider de Treinamento</span>
        <div className="flex gap-2 items-center">
          <div className="via-choice-bar flex-1">
            {(["openai", "gemini"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`via-choice-btn flex-1 py-1.5 capitalize ${provider === p ? "via-choice-btn-active" : ""}`}
              >
                {p === "openai" ? "OpenAI (.jsonl)" : "Gemini (.jsonl)"}
              </button>
            ))}
          </div>
          <button disabled={busy} onClick={gen} className="via-btn via-btn-primary shrink-0">
            {busy ? "Gerando…" : "Gerar"}
          </button>
        </div>
      </div>

      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-t border-border pt-3">
        Datasets de Fine-tuning ({(q.data ?? []).length})
      </div>
      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
        {(q.data ?? []).map((j: any) => (
          <div key={j.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border/70 bg-card p-2">
            <div className="text-foreground font-medium">
              <span className="capitalize">{j.type === "finetune_openai" ? "OpenAI" : "Gemini"}</span>
              <span className="text-[11px] text-muted-foreground ml-2">{new Date(j.created_at).toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex gap-1 items-center">
              {j.file_url && <a href={j.file_url} target="_blank" rel="noreferrer" className="via-btn via-btn-secondary via-btn-sm py-1 text-xs"><Download size={11}/> .jsonl</a>}
              <button
                disabled={deletingId === j.id}
                className="via-btn via-btn-secondary via-btn-sm py-1 px-1.5 text-muted-foreground hover:text-rose-500 hover:border-rose-500/30 transition-colors"
                onClick={() => removeJob(j.id)}
                title="Excluir dataset"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {(q.data ?? []).length === 0 && <div className="text-xs text-muted-foreground py-2">Nenhum dataset gerado ainda.</div>}
      </div>
    </div>
  );
}
