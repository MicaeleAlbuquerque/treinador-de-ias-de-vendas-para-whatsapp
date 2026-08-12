import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildSystemPrompt, buildPlaybookMarkdown, buildPlaybookPdf, buildFewShot,
  buildRagBundle, buildFinetuneJsonl, loadSnapshotBundle, uploadExport, type PromptParams,
} from "./exports/generators.server";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Apenas administradores.");
}

async function currentSnapshotId(): Promise<string> {
  const { data } = await supabaseAdmin.from("app_settings").select("current_dna_snapshot_id").eq("id", true).maybeSingle();
  if (!data?.current_dna_snapshot_id) throw new Error("Nenhum snapshot DNA disponível. Gere um em /app/dna primeiro.");
  return data.current_dna_snapshot_id;
}

// ---------- System Prompt ----------
export const generateSystemPromptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name?: string; parameters: PromptParams }) =>
    z.object({
      name: z.string().min(1).max(120).optional(),
      parameters: z.object({
        tom: z.enum(["formal", "casual", "comercial"]).optional(),
        foco_em_objecao: z.string().nullable().optional(),
        canal: z.string().max(40).optional(),
        vertical: z.string().max(120).optional(),
      }),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const snapshotId = await currentSnapshotId();
    const bundle = await loadSnapshotBundle(snapshotId);
    const prompt = buildSystemPrompt(bundle, data.parameters);
    const { data: row, error } = await supabaseAdmin.from("prompt_versions").insert({
      dna_snapshot_id: snapshotId,
      name: data.name ?? `Versão ${new Date().toLocaleString("pt-BR")}`,
      system_prompt: prompt,
      parameters: data.parameters as any,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { ok: true, version: row };
  });

export const publishPromptVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { versionId: string }) =>
    z.object({ versionId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    await supabaseAdmin.from("prompt_versions").update({ is_published: false }).neq("id", data.versionId);
    await supabaseAdmin.from("prompt_versions").update({ is_published: true }).eq("id", data.versionId);
    await supabaseAdmin.from("app_settings").update({ published_prompt_version_id: data.versionId, updated_at: new Date().toISOString() }).eq("id", true);
    return { ok: true };
  });

// ---------- Playbook ----------
export const generatePlaybookFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { format: "pdf" | "markdown" }) =>
    z.object({ format: z.enum(["pdf", "markdown"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const snapshotId = await currentSnapshotId();
    const bundle = await loadSnapshotBundle(snapshotId);
    const ts = Date.now();
    let url: string;
    if (data.format === "markdown") {
      const md = buildPlaybookMarkdown(bundle);
      url = await uploadExport(`${snapshotId}/playbook-${ts}.md`, md, "text/markdown; charset=utf-8");
    } else {
      const pdf = buildPlaybookPdf(bundle);
      url = await uploadExport(`${snapshotId}/playbook-${ts}.pdf`, pdf, "application/pdf");
    }
    const { data: row, error } = await supabaseAdmin.from("playbooks").insert({
      dna_snapshot_id: snapshotId, format: data.format, file_url: url, created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { ok: true, playbook: row };
  });

// ---------- Few-shot ----------
export const generateFewShotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { topN: number }) =>
    z.object({ topN: z.number().int().min(1).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const snapshotId = await currentSnapshotId();
    const samples = await buildFewShot(snapshotId, data.topN);
    const ts = Date.now();
    const url = await uploadExport(`${snapshotId}/fewshot-${ts}.json`, JSON.stringify(samples, null, 2), "application/json");
    await supabaseAdmin.from("export_jobs").insert({ type: "fewshot", dna_snapshot_id: snapshotId, status: "done", file_url: url, created_by: context.userId, finished_at: new Date().toISOString() });
    return { ok: true, url, count: samples.length };
  });

// ---------- RAG ----------
export const generateRagFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const snapshotId = await currentSnapshotId();
    const rag = await buildRagBundle(snapshotId);
    const ts = Date.now();
    const url = await uploadExport(`${snapshotId}/rag-${ts}.json`, JSON.stringify(rag, null, 2), "application/json");
    await supabaseAdmin.from("export_jobs").insert({ type: "rag", dna_snapshot_id: snapshotId, status: "done", file_url: url, created_by: context.userId, finished_at: new Date().toISOString() });
    return { ok: true, url };
  });

// ---------- Fine-tune ----------
export const generateFinetuneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: "openai" | "gemini" }) =>
    z.object({ provider: z.enum(["openai", "gemini"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const snapshotId = await currentSnapshotId();
    const bundle = await loadSnapshotBundle(snapshotId);
    // Use most recent published prompt as system prompt; else generate a default one.
    const { data: pub } = await supabaseAdmin.from("prompt_versions")
      .select("system_prompt").eq("dna_snapshot_id", snapshotId).eq("is_published", true).maybeSingle();
    const systemPrompt = pub?.system_prompt ?? buildSystemPrompt(bundle, {});
    const provider = data.provider === "openai" ? "openai_chat" : "gemini";
    const jsonl = await buildFinetuneJsonl(snapshotId, provider as any, systemPrompt);
    const ts = Date.now();
    const url = await uploadExport(`${snapshotId}/finetune-${data.provider}-${ts}.jsonl`, jsonl, "application/jsonl");
    await supabaseAdmin.from("export_jobs").insert({
      type: data.provider === "openai" ? "finetune_openai" : "finetune_gemini",
      dna_snapshot_id: snapshotId, status: "done", file_url: url, created_by: context.userId, finished_at: new Date().toISOString(),
    });
    return { ok: true, url };
  });