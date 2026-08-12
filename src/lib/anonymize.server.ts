// Server-only anonymization utility. Used by webhook ingestion and upload parser.
// Strategy: regex masking with seller whitelist. Names/phones of registered sellers
// are preserved. PII (CPF, cards, emails, phones, money) is replaced by tokens.

export type AnonReplacement = { type: string; original: string; replacement: string };

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const EMAIL_RE = /[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const BR_PHONE_RE = /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const MONEY_RE = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g;

function luhn(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i]!, 10);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export type SellerForWhitelist = { name: string; phone: string };

export function buildSellerWhitelist(sellers: SellerForWhitelist[]): string[] {
  const wl: string[] = [];
  for (const s of sellers) {
    if (s.name) {
      wl.push(s.name);
      const parts = s.name.split(/\s+/).filter((p) => p.length > 2);
      for (const p of parts) wl.push(p);
    }
    if (s.phone) {
      wl.push(s.phone);
      wl.push(s.phone.replace(/\D/g, ""));
    }
  }
  return wl;
}

export function anonymizeText(
  input: string | null | undefined,
  whitelist: string[] = [],
): { anonymized: string; replacements: AnonReplacement[] } {
  if (!input) return { anonymized: input ?? "", replacements: [] };
  const replacements: AnonReplacement[] = [];
  const wlNormalized = new Set(
    whitelist.map((s) => s.toLowerCase().trim()).filter(Boolean),
  );
  const wlDigits = new Set(
    whitelist
      .map((s) => s.replace(/\D/g, ""))
      .filter((s) => s.length >= 8),
  );

  let out = input;

  out = out.replace(CPF_RE, (m) => {
    replacements.push({ type: "cpf", original: m, replacement: "[CPF]" });
    return "[CPF]";
  });

  out = out.replace(CARD_RE, (m) => {
    if (!luhn(m)) return m;
    replacements.push({ type: "card", original: m, replacement: "[CARTÃO]" });
    return "[CARTÃO]";
  });

  out = out.replace(EMAIL_RE, (m) => {
    if (wlNormalized.has(m.toLowerCase())) return m;
    replacements.push({ type: "email", original: m, replacement: "[EMAIL]" });
    return "[EMAIL]";
  });

  out = out.replace(BR_PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (wlDigits.has(digits)) return m;
    if (wlNormalized.has(m.toLowerCase().trim())) return m;
    replacements.push({ type: "phone", original: m, replacement: "[TELEFONE]" });
    return "[TELEFONE]";
  });

  out = out.replace(MONEY_RE, (m) => {
    replacements.push({ type: "money", original: m, replacement: "[VALOR]" });
    return "[VALOR]";
  });

  return { anonymized: out, replacements };
}

/** Anonymizes only digits — used to mask the lead phone before storing. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  const tail = digits.slice(-4);
  return `***-${tail}`;
}

// Telefone válido: 6-20 dígitos, com "+" opcional no início (E.164).
// Aceita "5511987654321" e "+5511987654321". Rejeita cuids e qualquer
// coisa com letras.
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^\+?\d{6,20}$/.test(phone);
}