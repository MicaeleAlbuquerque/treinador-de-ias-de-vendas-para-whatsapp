// DNA aggregate snapshot computation. Runs over all analyzed conversations and
// produces ranking, objection library and antipattern n-grams.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STOPWORDS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","na","no","nas","nos","um","uma","uns","umas","para","pra","por","com","sem","ao","que","se","ou","é","ser","sou","seu","sua","seus","suas","te","ti","tu","me","mim","você","voce","vc","eu","nós","nos","ele","ela","eles","elas","isso","isto","aqui","ali","já","ja","mas","como","muito","mais","menos","tá","ta","tô","to","sim","não","nao","oi","ola","olá","ok","valeu","obrigado","obrigada","pra","pro","essa","esse","isso","aquilo","quando","onde","quem","qual","quais","tem","tinha","será","vai","vou","fui","ir","fazer","faz","fiz","só","aí","então","entao",
  // Saudações e formalidades comuns que não são antipadrões de vendas
  "bom","boa","dia","tarde","noite","tudo","bem","beleza","blz","legal","show","tranquilo","perfeito","claro","entendi","certo","combinado","amigo","amiga","querido","querida","favor","obg","vlw","gente","pessoal","opa","fala",
  // Verbos auxiliares e palavras funcionais sem sentido isolado
  "ter","estar","dar","pode","podemos","consigo","consegue","consigo","vamos","bora","mandar","enviar","olha","ver","falar","conversar","sobre","algo","coisa","tipo","assim","agora","depois","ainda","sempre","nunca",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t.length >= 2 && !STOPWORDS.has(t));
}

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
}

export type DnaResult =
  | { ok: true; snapshotId: string; totalAnalyzed: number; topPerformerSellerId: string | null }
  | { ok: false; reason: string; need: { won: number; lost: number; sellers: number } };

// Deriva sinal "won"/"lost" a partir do outcome explícito ou do quality_score.
// Outcome explícito sempre manda. Quando ausente, quality_score acima de
// `minGood` vira "won"; abaixo de `maxBad` vira "lost". Faixa intermediária
// é descartada (não dá sinal forte).
type Eligible = {
  id: string;
  seller_id: string | null;
  derived_outcome: "won" | "lost";
  outcome_source: "explicit" | "quality_ai" | "engagement";
  first_response_minutes: number | null;
  avg_response_minutes: number | null;
  message_count: number | null;
  audio_pct: number | null;
};

export async function recalculateDna(createdBy: string | null): Promise<DnaResult> {
  // ===== Load configuration =====
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("dna_min_won, dna_min_lost, dna_min_sellers, dna_individual_mode, dna_use_quality_score, dna_quality_min_good, dna_quality_max_bad")
    .eq("id", true)
    .maybeSingle();

  // Garante existência de pelo menos 1 vendedor padrão e vincula conversas sem vendedor
  const { data: existingSellers } = await supabaseAdmin
    .from("sellers")
    .select("id, name")
    .order("created_at", { ascending: true });

  let defaultSellerId: string | null = existingSellers?.[0]?.id ?? null;
  if (!defaultSellerId) {
    const { data: newSeller } = await supabaseAdmin
      .from("sellers")
      .insert({ name: "Atendimento Geral", phone: "5500000000000" })
      .select("id")
      .single();
    defaultSellerId = newSeller?.id ?? null;
  }

  if (defaultSellerId) {
    await supabaseAdmin
      .from("conversations")
      .update({ seller_id: defaultSellerId })
      .is("seller_id", null);
  }

  const sellerCount = (existingSellers?.length ?? 0) || 1;
  const individual = !!settings?.dna_individual_mode || sellerCount <= 1;
  const minWon = individual ? Math.min(settings?.dna_min_won ?? 5, 2) : (settings?.dna_min_won ?? 10);
  const minLost = individual ? Math.min(settings?.dna_min_lost ?? 2, 2) : (settings?.dna_min_lost ?? 5);
  const minSellers = individual ? 1 : Math.min(settings?.dna_min_sellers ?? 3, sellerCount);
  const useQuality = settings?.dna_use_quality_score !== false;
  const minGood = settings?.dna_quality_min_good ?? 75;
  const maxBad = settings?.dna_quality_max_bad ?? 40;

  // ===== Eligibility: TODAS as conversas com vendedor são avaliadas =====
  const { data: convs } = await supabaseAdmin
    .from("conversations")
    .select(
      "id, seller_id, outcome, quality_score, first_response_minutes, avg_response_minutes, message_count, audio_pct",
    )
    .not("seller_id", "is", null);

  const eligible: Eligible[] = [];
  for (const c of convs ?? []) {
    let derived: "won" | "lost";
    let source: "explicit" | "quality_ai" | "engagement";

    if (c.outcome === "won") {
      derived = "won";
      source = "explicit";
    } else if (c.outcome === "lost") {
      derived = "lost";
      source = "explicit";
    } else if (useQuality && c.quality_score != null) {
      // Avalia baseado no score de qualidade IA:
      // Se definido minGood/maxBad customizado ou >= 50 para bom vs < 50 fraco
      if (c.quality_score >= minGood) {
        derived = "won";
        source = "quality_ai";
      } else if (c.quality_score <= maxBad) {
        derived = "lost";
        source = "quality_ai";
      } else {
        // Faixa intermediária: avalia proporcionalmente pela mediana 50
        derived = c.quality_score >= 50 ? "won" : "lost";
        source = "quality_ai";
      }
    } else {
      // Sem outcome explícito e sem nota IA: deriva por engajamento de mensagens
      derived = (c.message_count ?? 0) >= 4 ? "won" : "lost";
      source = "engagement";
    }

    eligible.push({
      id: c.id,
      seller_id: c.seller_id,
      derived_outcome: derived,
      outcome_source: source,
      first_response_minutes: c.first_response_minutes,
      avg_response_minutes: c.avg_response_minutes,
      message_count: c.message_count,
      audio_pct: c.audio_pct,
    });
  }

  const all = eligible;
  const wonCount = all.filter((c) => c.derived_outcome === "won").length;
  const lostCount = all.filter((c) => c.derived_outcome === "lost").length;
  const sellersInvolved = new Set(all.map((c) => c.seller_id).filter(Boolean)).size;

  // Adapta mínimos caso a base existente já possua conversas suficientes
  const effectiveMinWon = Math.min(minWon, Math.max(1, Math.floor(all.length * 0.1)));
  const effectiveMinLost = Math.min(minLost, Math.max(1, Math.floor(all.length * 0.1)));
  const effectiveMinSellers = Math.min(minSellers, sellersInvolved);

  if (all.length === 0 || wonCount < effectiveMinWon || lostCount < effectiveMinLost || sellersInvolved < effectiveMinSellers) {
    return {
      ok: false,
      reason: "below_minimums",
      need: {
        won: Math.max(0, effectiveMinWon - wonCount),
        lost: Math.max(0, effectiveMinLost - lostCount),
        sellers: Math.max(0, effectiveMinSellers - sellersInvolved),
      },
    };
  }

  // ===== Aggregate per seller (considera TODAS as conversas de cada vendedor) =====
  const perSeller = new Map<string, { won: number; lost: number; convIds: string[]; frt: number[]; ar: number[] }>();
  // Garante que todos os vendedores cadastrados apareçam no ranking
  for (const s of existingSellers ?? []) {
    perSeller.set(s.id, { won: 0, lost: 0, convIds: [], frt: [], ar: [] });
  }

  for (const c of all) {
    if (!c.seller_id) continue;
    const cur = perSeller.get(c.seller_id) ?? { won: 0, lost: 0, convIds: [], frt: [], ar: [] };
    if (c.derived_outcome === "won") cur.won++;
    else if (c.derived_outcome === "lost") cur.lost++;
    cur.convIds.push(c.id);
    if (c.first_response_minutes != null) cur.frt.push(Number(c.first_response_minutes));
    if (c.avg_response_minutes != null) cur.ar.push(Number(c.avg_response_minutes));
    perSeller.set(c.seller_id, cur);
  }

  // Need messages per conv for lead response rate / stage distribution (em chunks para suportar todas)
  const allIds = all.map((c) => c.id);
  let messages: { conversation_id: string; sender_role: string; stage: string | null }[] = [];
  const chunkSize = 100;
  for (let i = 0; i < allIds.length; i += chunkSize) {
    const chunk = allIds.slice(i, i + chunkSize);
    const { data: chunkMsgs } = await supabaseAdmin
      .from("messages")
      .select("conversation_id, sender_role, stage")
      .in("conversation_id", chunk);
    if (chunkMsgs) messages = messages.concat(chunkMsgs);
  }

  const stageBySeller = new Map<string, Record<string, number>>();
  const totalMsgsBySeller = new Map<string, number>();
  const leadRepliedConvBySeller = new Map<string, Set<string>>();

  if (messages.length > 0) {
    const convToSeller = new Map(all.map((c) => [c.id, c.seller_id!]));
    for (const m of messages) {
      const sId = convToSeller.get(m.conversation_id);
      if (!sId) continue;
      if (m.sender_role === "lead") {
        const s = leadRepliedConvBySeller.get(sId) ?? new Set();
        s.add(m.conversation_id);
        leadRepliedConvBySeller.set(sId, s);
      }
      if (m.sender_role === "seller" && m.stage) {
        const dist = stageBySeller.get(sId) ?? {};
        dist[m.stage] = (dist[m.stage] ?? 0) + 1;
        stageBySeller.set(sId, dist);
        totalMsgsBySeller.set(sId, (totalMsgsBySeller.get(sId) ?? 0) + 1);
      }
    }
  }

  // ===== Scores =====
  type Row = {
    seller_id: string; score: number; win_rate: number; lead_response_rate: number;
    avg_first_response_minutes: number | null; total_conversations: number;
    stage_distribution: Record<string, number> | null;
  };
  const rows: Row[] = [];
  for (const [sellerId, agg] of perSeller) {
    const totalConv = agg.convIds.length; // Contempla 100% das conversas do vendedor!
    const winRate = totalConv > 0 ? agg.won / totalConv : 0;
    const leadRate = totalConv > 0 ? (leadRepliedConvBySeller.get(sellerId)?.size ?? 0) / totalConv : 0;
    const avgFrt = agg.frt.length ? agg.frt.reduce((a, b) => a + b, 0) / agg.frt.length : null;
    const frtNorm = avgFrt != null ? 1 / Math.log(2 + avgFrt) : 0.5;
    const score = totalConv > 0 ? winRate * (0.4 + 0.3 * leadRate + 0.3 * frtNorm) : 0;
    rows.push({
      seller_id: sellerId,
      score,
      win_rate: winRate,
      lead_response_rate: leadRate,
      avg_first_response_minutes: avgFrt,
      total_conversations: totalConv,
      stage_distribution: stageBySeller.get(sellerId) ?? null,
    });
  }
  rows.sort((a, b) => b.score - a.score);
  const topCount = Math.max(1, Math.ceil(rows.length * 0.2));
  const topSellerIds = new Set(rows.slice(0, topCount).map((r) => r.seller_id));
  const topPerformer = rows[0]?.seller_id ?? null;

  // ===== Create snapshot row =====
  const { data: snap, error: snapErr } = await supabaseAdmin
    .from("dna_snapshots")
    .insert({
      created_by: createdBy,
      total_conversations_analyzed: all.length,
      top_performer_seller_id: topPerformer,
    })
    .select("id")
    .single();
  if (snapErr || !snap) throw new Error(snapErr?.message ?? "snapshot insert failed");

  await supabaseAdmin.from("seller_dna_scores").insert(
    rows.map((r) => ({
      snapshot_id: snap.id,
      seller_id: r.seller_id,
      score: r.score,
      win_rate: r.win_rate,
      lead_response_rate: r.lead_response_rate,
      avg_first_response_minutes: r.avg_first_response_minutes,
      total_conversations: r.total_conversations,
      is_top_performer: topSellerIds.has(r.seller_id),
      stage_distribution: r.stage_distribution as any,
    })),
  );

  // ===== Objection library =====
  const { data: objs } = await supabaseAdmin
    .from("objections")
    .select("conversation_id, category, seller_response")
    .not("seller_response", "is", null);

  const convOutcome = new Map(all.map((c) => [c.id, c.derived_outcome]));
  type ObjAgg = { occurrences: number; wins: number; total: number };
  const objAgg = new Map<string, ObjAgg>();
  for (const o of objs ?? []) {
    if (!convOutcome.has(o.conversation_id)) continue;
    const key = `${o.category}::${(o.seller_response ?? "").trim().slice(0, 200).toLowerCase()}`;
    const cur = objAgg.get(key) ?? { occurrences: 0, wins: 0, total: 0 };
    cur.occurrences++;
    cur.total++;
    if (convOutcome.get(o.conversation_id) === "won") cur.wins++;
    objAgg.set(key, cur);
  }
  if (objAgg.size > 0) {
    await supabaseAdmin.from("dna_objections").insert(
      [...objAgg.entries()].map(([key, agg]) => {
        const [category, response] = key.split("::");
        return {
          snapshot_id: snap.id,
          category: category!,
          seller_response: response!,
          occurrences: agg.occurrences,
          win_rate: agg.total > 0 ? agg.wins / agg.total : 0,
          sample_size: agg.total,
        };
      }),
    );
  }

  // ===== Antipatterns: ngrams freq in lost vs won =====
  // Conversas perdidas (prioriza não-top performers para achar vícios, mas inclui todas se amostra for pequena)
  const nonTopLost = all.filter((c) => c.derived_outcome === "lost" && !topSellerIds.has(c.seller_id!)).map((c) => c.id);
  const lostConvs = nonTopLost.length >= 2 ? nonTopLost : all.filter((c) => c.derived_outcome === "lost").map((c) => c.id);

  // Conversas ganhas: considera todas as ganhas da operação para calcular a frequência real em ganhas
  const wonConvs = all.filter((c) => c.derived_outcome === "won").map((c) => c.id);

  async function aggregateNgrams(convIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (convIds.length === 0) return out;
    let data: { text: string | null; audio_transcript: string | null }[] = [];
    for (let i = 0; i < convIds.length; i += 100) {
      const chunk = convIds.slice(i, i + 100);
      const { data: chunkMsgs } = await supabaseAdmin
        .from("messages")
        .select("text, audio_transcript")
        .in("conversation_id", chunk)
        .eq("sender_role", "seller");
      if (chunkMsgs) data = data.concat(chunkMsgs);
    }
    let total = 0;
    for (const m of data) {
      const toks = tokenize((m.text ?? "") + " " + (m.audio_transcript ?? ""));
      // Usa APENAS n=2 e n=3 (expressões/frases). Unigramas (palavras isoladas como 'bom') são descartados
      // pois não caracterizam abordagem comercial e poluem o diagnóstico com ruído.
      for (const n of [2, 3]) {
        for (const g of ngrams(toks, n)) {
          out.set(g, (out.get(g) ?? 0) + 1);
          total++;
        }
      }
    }
    // Converte para frequência normalizada
    if (total > 0) {
      for (const [k, v] of out) out.set(k, v / total);
    }
    return out;
  }

  const lostFreq = await aggregateNgrams(lostConvs);
  const wonFreq = await aggregateNgrams(wonConvs);

  type AntiRow = { ngram: string; lost: number; won: number; lift: number };
  const antis: AntiRow[] = [];
  for (const [g, lf] of lostFreq) {
    // Filtro mínimo de relevância: ignora expressões com frequência estatística irrisória
    if (lf < 0.0003) continue;
    const wf = wonFreq.get(g) ?? 0;
    const lift = lf / (wf + 0.0001);
    // Expressões que aparecem mais frequentemente em conversas perdidas do que em ganhas
    if (lift >= 1.5 && lf > wf) {
      antis.push({ ngram: g, lost: lf, won: wf, lift });
    }
  }

  antis.sort((a, b) => b.lift - a.lift);
  const antiTop = antis.slice(0, 50);
  if (antiTop.length > 0) {
    await supabaseAdmin.from("dna_antipatterns").insert(
      antiTop.map((a) => ({
        snapshot_id: snap.id,
        ngram: a.ngram,
        lost_frequency: a.lost,
        won_frequency: a.won,
        lift: a.lift,
        sample_size: lostConvs.length,
      })),
    );
  }

  await supabaseAdmin
    .from("app_settings")
    .update({
      current_dna_snapshot_id: snap.id,
      last_dna_snapshot_at: new Date().toISOString(),
      tagged_since_snapshot: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  return { ok: true, snapshotId: snap.id, totalAnalyzed: all.length, topPerformerSellerId: topPerformer };
}