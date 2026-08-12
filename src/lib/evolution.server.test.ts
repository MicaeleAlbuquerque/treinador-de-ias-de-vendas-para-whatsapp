import { describe, it, expect } from "vitest";
import { normalizeChat } from "./evolution.server";

// Shapes reais capturados via "Diagnóstico bruto" na Evolution API v2 nova,
// que usa @lid (LinkedID) em conversas 1-on-1. Regressão: antes o parser
// rejeitava @lid e descartava ~99% dos chats individuais.

describe("normalizeChat — Evolution v2 @lid", () => {
  it("aceita chat individual em @lid e extrai PN de remoteJidAlt", () => {
    const chat = {
      id: "cmpphbjfk4qjbqj4qwtnruqkd",
      remoteJid: "207992582574252@lid",
      pushName: "Cliente Fulano",
      lastMessage: {
        key: {
          id: "AC4316E32CCA4315BA5FE8D053BC74B9",
          fromMe: false,
          remoteJid: "207992582574252@lid",
          remoteJidAlt: "554899229304@s.whatsapp.net",
          addressingMode: "lid",
        },
      },
    };
    const r = normalizeChat(chat);
    expect(r).not.toBeNull();
    // Busca de mensagens usa o @lid EXATO (é o que casa na tabela Message).
    expect(r!.remote_jid).toBe("207992582574252@lid");
    // Número real pra exibição/dedup vem do remoteJidAlt.
    expect(r!.lead_phone).toBe("554899229304");
    expect(r!.is_group).toBe(false);
    expect(r!.display_name).toBe("Cliente Fulano");
  });

  it("aceita chat individual clássico em @s.whatsapp.net", () => {
    const r = normalizeChat({
      remoteJid: "5512981632768@s.whatsapp.net",
      pushName: "Maria",
    });
    expect(r!.remote_jid).toBe("5512981632768@s.whatsapp.net");
    expect(r!.lead_phone).toBe("5512981632768");
    expect(r!.is_group).toBe(false);
  });

  it("marca grupo e não tenta extrair telefone", () => {
    const r = normalizeChat({
      remoteJid: "120363402779852350@g.us",
      pushName: "Grupo Codex",
    });
    expect(r!.is_group).toBe(true);
    expect(r!.lead_phone).toBeNull();
  });

  it("descarta cuid interno sem @ (não é JID)", () => {
    expect(normalizeChat({ remoteJid: "cmpphbjfk4qjbqj4qwtnruqkd" })).toBeNull();
    expect(normalizeChat({ id: "cmpphbjfk4qjbqj4qwtnruqkd" })).toBeNull();
  });

  it("usa o número do @lid como identificador quando não há PN alternativo", () => {
    const r = normalizeChat({ remoteJid: "207992582574252@lid", pushName: "Sem PN" });
    expect(r!.remote_jid).toBe("207992582574252@lid");
    // Sem remoteJidAlt: cai pro número do próprio lid (identificador estável).
    expect(r!.lead_phone).toBe("207992582574252");
  });
});
