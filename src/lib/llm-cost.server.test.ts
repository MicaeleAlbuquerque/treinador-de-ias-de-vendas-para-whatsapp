import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedUsage: unknown[] = [];
let mockUsageRows: { cost_usd: number }[] = [];
let mockCap = 5;
let mockNotifications: Array<{ id: string }> = [];

// Builder universal: cada método retorna um proxy que é thenable + suporta novos métodos.
// O Promise resolvido depende de qual tabela e qual cadeia.
type QueryState = {
  table: string;
  hasGte?: boolean;
  hasLimit?: boolean;
  hasMaybeSingle?: boolean;
};

function makeQuery(state: QueryState): any {
  const resolve = (): { data: unknown } => {
    if (state.table === "llm_usage") return { data: mockUsageRows };
    if (state.table === "notifications") return { data: mockNotifications };
    if (state.table === "app_settings") return { data: { llm_cost_cap_usd_day: mockCap } };
    return { data: [] };
  };
  const proxy: any = {
    select: () => makeQuery(state),
    eq: () => makeQuery(state),
    in: () => makeQuery(state),
    gte: () => makeQuery({ ...state, hasGte: true }),
    limit: () => makeQuery({ ...state, hasLimit: true }),
    maybeSingle: async () => resolve(),
    insert: async (row: unknown) => {
      if (state.table === "llm_usage") insertedUsage.push(row);
      if (state.table === "notifications") mockNotifications.push({ id: "n1" });
      return { data: null, error: null };
    },
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
  };
  return proxy;
}

vi.mock("@/integrations/supabase/client.server", () => {
  return {
    supabaseAdmin: {
      from: (table: string) => makeQuery({ table }),
    },
  };
});

beforeEach(() => {
  insertedUsage.length = 0;
  mockUsageRows = [];
  mockNotifications = [];
  mockCap = 5;
});

describe("chargeLlmCost", () => {
  it("registra usage quando dentro do cap", async () => {
    const { chargeLlmCost } = await import("./llm-cost.server");
    await chargeLlmCost({ provider: "google", model: "gemini-2.5-flash", costUsd: 0.001, source: "analyze" });
    expect(insertedUsage).toHaveLength(1);
  });

  it("lança LlmCapHitError quando estoura o cap", async () => {
    mockUsageRows = [{ cost_usd: 4.99 }];
    mockCap = 5;
    const { chargeLlmCost, LlmCapHitError } = await import("./llm-cost.server");
    await expect(
      chargeLlmCost({ provider: "google", model: "gemini-2.5-flash", costUsd: 0.5, source: "transcribe" }),
    ).rejects.toBeInstanceOf(LlmCapHitError);
    expect(insertedUsage).toHaveLength(0);
  });

  it("respeita cap configurado mais alto", async () => {
    mockUsageRows = [{ cost_usd: 9.0 }];
    mockCap = 20;
    const { chargeLlmCost } = await import("./llm-cost.server");
    await chargeLlmCost({ provider: "openai", model: "whisper-1", costUsd: 1.0, source: "transcribe" });
    expect(insertedUsage).toHaveLength(1);
  });
});
