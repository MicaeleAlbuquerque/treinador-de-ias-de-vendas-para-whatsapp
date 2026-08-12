// Parses Brazilian WhatsApp .txt exports.
// Line format: `[DD/MM/YYYY, HH:MM] Nome: mensagem` (timestamp may also be `DD/MM/YYYY HH:MM:SS` or with brackets variations).
// Multi-line messages continue until the next timestamped line.

export type ParsedMessage = {
  ts: string; // ISO
  authorName: string;
  text: string;
  isSystem: boolean;
};

const LINE_RE =
  /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*[-\u2013]?\s*([^:]+?):\s?(.*)$/;

const SYSTEM_HINTS = [
  /mensagens.*protegidas/i,
  /mudou o nome do grupo/i,
  /entrou usando/i,
  /você foi adicionado/i,
  /criou o grupo/i,
  /chamada de voz/i,
  /chamada de v[íi]deo/i,
];

function toIso(d: string, m: string, y: string, hh: string, mm: string, ss?: string): string {
  const year = y.length === 2 ? `20${y}` : y;
  const date = new Date(
    Number(year),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    ss ? Number(ss) : 0,
  );
  return date.toISOString();
}

export function parseWhatsAppExport(raw: string): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  const lines = raw.split(/\r?\n/);
  let current: ParsedMessage | null = null;

  for (const line of lines) {
    const m = LINE_RE.exec(line);
    if (m) {
      if (current) out.push(current);
      const [, d, mo, y, hh, mm, ss, author, text] = m;
      const ts = toIso(d!, mo!, y!, hh!, mm!, ss);
      const isSystem = SYSTEM_HINTS.some((re) => re.test(text ?? ""));
      current = {
        ts,
        authorName: (author ?? "").trim(),
        text: (text ?? "").trim(),
        isSystem,
      };
    } else if (current && line.trim()) {
      current.text += "\n" + line.trim();
    }
  }
  if (current) out.push(current);
  return out;
}
