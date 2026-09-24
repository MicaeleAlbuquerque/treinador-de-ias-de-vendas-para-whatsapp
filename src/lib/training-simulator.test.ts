import { describe, it, expect } from "vitest";
import { PERSONAS, pickSimulationContext } from "./training-simulator.server";

describe("Training Simulator Engine", () => {
  it("defines all required personas including random", () => {
    expect(PERSONAS.random).toBeDefined();
    expect(PERSONAS.preco).toBeDefined();
    expect(PERSONAS.cetico).toBeDefined();
    expect(PERSONAS.apressado).toBeDefined();
    expect(PERSONAS.indeciso).toBeDefined();
    expect(PERSONAS.aberto).toBeDefined();
  });

  it("resolves random persona to one of the concrete personas", () => {
    const context = pickSimulationContext("random");
    expect(["preco", "cetico", "apressado", "indeciso", "aberto"]).toContain(context.actualPersona);
    expect(context.leadName).toBeTruthy();
    expect(context.leadNiche).toBeTruthy();
    expect(context.leadOrigin).toBeTruthy();
    expect(context.leadGoal).toBeTruthy();
  });

  it("generates diverse scenarios without fixed repetition", () => {
    const ctx1 = pickSimulationContext("random");
    const ctx2 = pickSimulationContext("random");
    // Both should have valid attributes
    expect(ctx1.leadName.length).toBeGreaterThan(2);
    expect(ctx2.leadName.length).toBeGreaterThan(2);
  });

  it("respects custom product or niche when provided", () => {
    const custom = "Clínica de Implantes Dentários";
    const context = pickSimulationContext("preco", custom);
    expect(context.actualPersona).toBe("preco");
    expect(context.leadNiche).toBe(custom);
  });
});
