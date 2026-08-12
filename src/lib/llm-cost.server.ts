// LLM cost cap helpers. Every LLM call should pass through chargeLlmCost so we
// honor the daily cap configured in app_settings.llm_cost_cap_usd_day.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChargeArgs = {
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd: number;
  source: "analyze" | "transcribe" | "quality_score" | "other";
};

export class LlmCapHitError extends Error {
  constructor(public cap: number, public used: number) {
    super(`Cap de custo LLM diário atingido (US$ ${used.toFixed(4)} / ${cap.toFixed(2)}).`);
  }
}

export async function getDailyUsageUsd(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin
    .from("llm_usage")
    .select("cost_usd")
    .gte("ts", startOfDay.toISOString());
  return (data ?? []).reduce((acc, r: any) => acc + Number(r.cost_usd ?? 0), 0);
}

export async function getCapUsd(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("llm_cost_cap_usd_day")
    .eq("id", true)
    .maybeSingle();
  return Number(data?.llm_cost_cap_usd_day ?? 5);
}

/** Throws LlmCapHitError when the projected cost exceeds the daily cap. */
export async function assertWithinCap(projectedCost: number): Promise<void> {
  const [used, cap] = await Promise.all([getDailyUsageUsd(), getCapUsd()]);
  if (used + projectedCost > cap) {
    // Best-effort notification to admins on first hit of the day.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("type", "llm_cost_cap_hit")
      .gte("created_at", today.toISOString())
      .limit(1);
    if (!existing || existing.length === 0) {
      await supabaseAdmin.from("notifications").insert({
        type: "llm_cost_cap_hit",
        title: "Cap de custo LLM diário atingido",
        body: `Uso de hoje: US$ ${used.toFixed(4)} (limite US$ ${cap.toFixed(2)}). Ajuste em Configurações → Análise.`,
        audience: "admin",
      });
    }
    throw new LlmCapHitError(cap, used);
  }
}

export async function recordUsage(args: ChargeArgs): Promise<void> {
  await supabaseAdmin.from("llm_usage").insert({
    provider: args.provider,
    model: args.model,
    tokens_in: args.tokensIn ?? 0,
    tokens_out: args.tokensOut ?? 0,
    cost_usd: args.costUsd,
    source: args.source,
  });
}

/** Convenience: assertWithinCap then recordUsage. */
export async function chargeLlmCost(args: ChargeArgs): Promise<void> {
  await assertWithinCap(args.costUsd);
  await recordUsage(args);
}