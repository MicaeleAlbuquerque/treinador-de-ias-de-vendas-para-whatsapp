import { describe, it, expect } from "vitest";
import { anonymizeText, buildSellerWhitelist, maskPhone } from "./anonymize.server";

describe("anonymizeText", () => {
  it("mascara CPF nos formatos comuns", () => {
    const r = anonymizeText("Meu CPF é 123.456.789-09 e o seu é 12345678909.");
    expect(r.anonymized).not.toContain("123.456.789-09");
    expect(r.anonymized).not.toContain("12345678909");
    expect(r.anonymized).toContain("[CPF]");
    expect(r.replacements.filter((x) => x.type === "cpf").length).toBeGreaterThanOrEqual(2);
  });

  it("mascara email", () => {
    const r = anonymizeText("Manda pra cliente@dominio.com.br");
    expect(r.anonymized).toContain("[EMAIL]");
    expect(r.anonymized).not.toContain("cliente@dominio.com.br");
  });

  it("mascara telefone BR (com e sem DDI)", () => {
    const r = anonymizeText("Me chama no (11) 99999-1234 ou +55 11 99999 1234");
    expect(r.anonymized.match(/\[TELEFONE\]/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it("mascara cartão de crédito válido (Luhn) mas não inválido", () => {
    const valid = "4111 1111 1111 1111"; // VISA test, Luhn-valid
    const invalid = "4111 1111 1111 1112";
    const r1 = anonymizeText(`Cartão ${valid}`);
    const r2 = anonymizeText(`Sequência ${invalid}`);
    expect(r1.anonymized).toContain("[CARTÃO]");
    expect(r2.anonymized).toContain(invalid);
  });

  it("mascara valor monetário em BRL", () => {
    const r = anonymizeText("Cobramos R$ 1.500,00 por mês.");
    expect(r.anonymized).toContain("[VALOR]");
    expect(r.anonymized).not.toContain("R$ 1.500,00");
  });

  it("PRESERVA nomes/telefones em whitelist (vendedores)", () => {
    const sellers = [{ name: "Carla Mendes", phone: "+55 11 99999-1234" }];
    const wl = buildSellerWhitelist(sellers);
    const r = anonymizeText("A Carla Mendes vai te ligar no +55 11 99999-1234.", wl);
    expect(r.anonymized).toContain("Carla Mendes");
    expect(r.anonymized).toContain("+55 11 99999-1234");
  });

  it("retorna string vazia para input null/empty", () => {
    expect(anonymizeText(null).anonymized).toBe("");
    expect(anonymizeText("").anonymized).toBe("");
  });
});

describe("maskPhone", () => {
  it("mantém últimos 4 dígitos", () => {
    expect(maskPhone("+55 11 99999-1234")).toBe("***-1234");
    expect(maskPhone("12")).toBe("****");
  });
});
