import { describe, it, expect } from "vitest";
import { minutesRespectingBizHours, type BizHours } from "./analyze.server";

describe("minutesRespectingBizHours", () => {
  const defaultBh: BizHours = {
    start: "09:00",
    end: "18:00",
    days: [1, 2, 3, 4, 5], // Seg a Sex
    tz: "America/Sao_Paulo",
  };

  it("calcula delta correto quando a resposta ocorre no mesmo dia dentro do horário comercial", () => {
    // Segunda-feira (10 de Nov 2025): 10:00 às 10:45 (-03:00)
    const from = "2025-11-10T10:00:00-03:00";
    const to = "2025-11-10T10:45:00-03:00";
    const result = minutesRespectingBizHours(from, to, defaultBh);
    expect(result).toBe(45);
  });

  it("ignora tempo antes do início do expediente", () => {
    // Segunda-feira: 08:00 às 09:30 (expediente inicia 09:00 -> 30 min úteis)
    const from = "2025-11-10T08:00:00-03:00";
    const to = "2025-11-10T09:30:00-03:00";
    const result = minutesRespectingBizHours(from, to, defaultBh);
    expect(result).toBe(30);
  });

  it("ignora tempo após o fim do expediente", () => {
    // Segunda-feira: 17:30 às 19:00 (expediente fecha 18:00 -> 30 min úteis)
    const from = "2025-11-10T17:30:00-03:00";
    const to = "2025-11-10T19:00:00-03:00";
    const result = minutesRespectingBizHours(from, to, defaultBh);
    expect(result).toBe(30);
  });

  it("calcula corretamente resposta cruzando a noite (segunda para terça)", () => {
    // Segunda 17:00 (60 min até 18:00) até Terça 10:00 (60 min de 09:00 a 10:00) -> 120 min úteis
    const from = "2025-11-10T17:00:00-03:00";
    const to = "2025-11-11T10:00:00-03:00";
    const result = minutesRespectingBizHours(from, to, defaultBh);
    expect(result).toBe(120);
  });

  it("desconta o fim de semana completo (sexta para segunda)", () => {
    // Sexta-feira (14 de Nov 2025) 17:30 (30 min até 18:00) até Segunda (17 de Nov 2025) 09:15 (15 min) -> 45 min
    const from = "2025-11-14T17:30:00-03:00";
    const to = "2025-11-17T09:15:00-03:00";
    const result = minutesRespectingBizHours(from, to, defaultBh);
    expect(result).toBe(45);
  });

  it("retorna 0 se a mensagem e resposta ocorrerem ambas no fim de semana ou fora do expediente", () => {
    // Sábado 14:00 até Sábado 15:00
    const from = "2025-11-15T14:00:00-03:00";
    const to = "2025-11-15T15:00:00-03:00";
    const result = minutesRespectingBizHours(from, to, defaultBh);
    expect(result).toBe(0);
  });

  it("retorna 0 se 'to' for anterior ou igual a 'from'", () => {
    const from = "2025-11-10T10:00:00-03:00";
    const to = "2025-11-10T09:00:00-03:00";
    expect(minutesRespectingBizHours(from, to, defaultBh)).toBe(0);
    expect(minutesRespectingBizHours(from, from, defaultBh)).toBe(0);
  });
});
