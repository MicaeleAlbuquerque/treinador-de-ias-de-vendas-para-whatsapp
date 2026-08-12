import { describe, it, expect } from "vitest";
import { parseWhatsAppExport } from "./whatsapp-parser";

describe("parseWhatsAppExport", () => {
  it("parsa formato BR padrão com colchetes", () => {
    const txt = `[15/01/2026, 14:32] Carla: Oi Marcelo, tudo bem?
[15/01/2026, 14:35] Marcelo: Tudo, e contigo?
[15/01/2026, 14:36] Carla: Tenho uma proposta legal pra te mostrar.`;
    const r = parseWhatsAppExport(txt);
    expect(r).toHaveLength(3);
    expect(r[0]!.authorName).toBe("Carla");
    expect(r[0]!.text).toContain("Oi Marcelo");
    expect(r[1]!.authorName).toBe("Marcelo");
  });

  it("agrupa linhas continuação (multi-line) na mensagem anterior", () => {
    const txt = `[15/01/2026, 14:32] Carla: linha 1
linha 2
linha 3
[15/01/2026, 14:35] Marcelo: ok`;
    const r = parseWhatsAppExport(txt);
    expect(r).toHaveLength(2);
    expect(r[0]!.text).toContain("linha 1");
    expect(r[0]!.text).toContain("linha 2");
    expect(r[0]!.text).toContain("linha 3");
  });

  it("marca mensagens de sistema como isSystem", () => {
    const txt = `[15/01/2026, 14:32] Sistema: As mensagens são protegidas com criptografia
[15/01/2026, 14:33] Carla: Oi`;
    const r = parseWhatsAppExport(txt);
    expect(r[0]!.isSystem).toBe(true);
    expect(r[1]!.isSystem).toBe(false);
  });

  it("retorna array vazio para texto sem matches", () => {
    expect(parseWhatsAppExport("texto sem timestamps")).toEqual([]);
    expect(parseWhatsAppExport("")).toEqual([]);
  });
});
