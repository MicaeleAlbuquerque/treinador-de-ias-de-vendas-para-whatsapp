// Server Functions para a Arena de Treinamento e Roleplay com IA
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  startSimulationSession,
  replyAsSimulationLead,
  evaluateSimulation,
  loadActiveSimulationSession,
  discardSimulationSession,
  deleteSimulationSession,
  PERSONAS,
  type PersonaType,
} from "./training-simulator.server";

export const getSimulationPersonas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return Object.values(PERSONAS);
  });

export const startSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { requestedPersona: string; sellerId?: string | null; customProduct?: string }) =>
    z
      .object({
        requestedPersona: z.enum(["random", "preco", "cetico", "apressado", "indeciso", "aberto"]),
        sellerId: z.string().uuid().nullable().optional(),
        customProduct: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return await startSimulationSession({
      requestedPersona: data.requestedPersona as PersonaType,
      sellerId: data.sellerId ?? null,
      customProduct: data.customProduct,
    });
  });

export const sendSimulationMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string; messageText: string }) =>
    z
      .object({
        conversationId: z.string().uuid(),
        messageText: z.string().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const leadReply = await replyAsSimulationLead(data.conversationId, data.messageText);
    return { leadReply };
  });

export const finishSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const evaluation = await evaluateSimulation(data.conversationId);
    return evaluation;
  });

export const listSimulationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: convs, error } = await supabaseAdmin
      .from("conversations")
      .select("id, lead_name_anon, quality_score, outcome, created_at, message_count, seller_id, sellers ( id, name )")
      .eq("source", "simulation")
      .not("quality_score", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);

    return (convs ?? []).map((c: any) => ({
      id: c.id,
      title: c.lead_name_anon,
      score: c.quality_score,
      outcome: c.outcome,
      sellerName: c.sellers?.name || "Vendedor",
      createdAt: c.created_at,
      messageCount: c.message_count,
    }));
  });

export const getActiveSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d?: { conversationId?: string | null }) =>
    z
      .object({
        conversationId: z.string().uuid().nullable().optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data }) => {
    return await loadActiveSimulationSession(data?.conversationId ?? null);
  });

export const discardSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) =>
    z
      .object({
        conversationId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return await discardSimulationSession(data.conversationId);
  });

export const deleteSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { conversationId: string }) =>
    z
      .object({
        conversationId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return await deleteSimulationSession(data.conversationId);
  });

