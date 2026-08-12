import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getWhatsAppInstance } from "@/lib/whatsapp.functions";
import { MessagesSquare, Sparkles, FileText, Inbox, Plug, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/")({
  component: DashboardHome,
});

type StatusCounts = {
  conversations: number;
  messages: number;
  sellers: number;
  prompts: number;
  hasInstance: boolean;
  isConnected: boolean;
};

function DashboardHome() {
  const getInstanceFn = useServerFn(getWhatsAppInstance);
  const q = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async (): Promise<StatusCounts> => {
      const [convs, msgs, sellers, prompts, playbooks, inst] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("sellers").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("prompt_versions").select("id", { count: "exact", head: true }),
        // Playbooks (Tier 1) também contam como "versões de prompt" geradas.
        supabase.from("playbook_snapshots").select("id", { count: "exact", head: true }),
        getInstanceFn({}),
      ]);
      return {
        conversations: convs.count ?? 0,
        messages: msgs.count ?? 0,
        sellers: sellers.count ?? 0,
        prompts: (prompts.count ?? 0) + (playbooks.count ?? 0),
        hasInstance: !!inst,
        isConnected: inst?.status === "connected",
      };
    },
    refetchInterval: 20000,
  });

  const s = q.data;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="via-eyebrow">Painel</p>
          <h1 className="mt-1 text-4xl">Bem-vindo ao Treinador de IAs de Vendas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {s?.isConnected
              ? "WhatsApp conectado. Conversas chegando em tempo real."
              : s?.hasInstance
                ? "Instância criada, mas WhatsApp ainda não conectado."
                : "Conecte um WhatsApp via Evolution pra começar a extrair o DNA do seu time."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/conversations">
            <button
              type="button"
              className="via-btn-pill border border-border px-4 py-2 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Ver conversas
            </button>
          </Link>
          <Link to="/app/settings">
            <Button className="via-btn-pill" size="lg">
              CONFIGURAR
            </Button>
          </Link>
        </div>
      </header>

      {!s?.hasInstance && <ConnectCta />}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Conversas" value={s?.conversations ?? 0} />
        <Kpi label="Mensagens" value={s?.messages ?? 0} />
        <Kpi label="Vendedores ativos" value={s?.sellers ?? 0} />
        <Kpi label="Prompts e playbooks" value={s?.prompts ?? 0} />
      </section>

      <section>
        <p className="via-eyebrow mb-4">Próximos passos</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <NextStep
            icon={<Inbox size={20} strokeWidth={1.75} />}
            title="1. Conecte e importe"
            body="Settings → WhatsApp pra criar a instância Evolution + importar histórico dos últimos meses."
          />
          <NextStep
            icon={<Sparkles size={20} strokeWidth={1.75} />}
            title="2. Marque win/loss e rode o DNA"
            body="Tagueie conversas como ganhas/perdidas em Conversas; depois recalcule o DNA em /app/dna."
          />
          <NextStep
            icon={<FileText size={20} strokeWidth={1.75} />}
            title="3. Exporte prompt ou playbook"
            body="Em Prompts gere o System Prompt do chatbot ou o Playbook em PDF do time."
          />
        </div>
      </section>

      {s?.hasInstance && s.conversations === 0 && (
        <Card className="via-shadow-card">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <MessagesSquare size={22} strokeWidth={1.75} />
            </div>
            <p className="via-eyebrow">Vazio</p>
            <h2 className="text-2xl">Nenhuma conversa por aqui ainda</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Vá em Settings → WhatsApp e clique em "Importar histórico" pra puxar conversas anteriores à conexão.
            </p>
            <Link to="/app/settings">
              <Button className="via-btn-pill mt-2" size="lg">
                IR PRA CONFIGURAÇÕES <ArrowRight size={14} />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ConnectCta() {
  return (
    <Card className="via-shadow-card border-accent/20 bg-accent/5">
      <CardContent className="flex flex-col items-start gap-4 py-6 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-2xl items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Plug size={20} strokeWidth={1.75} />
          </div>
          <div>
            <p className="via-eyebrow">Primeiro passo</p>
            <h2 className="mt-1 text-2xl leading-tight">Conecte seu WhatsApp via Evolution</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sem instância conectada, o sistema não consegue puxar conversas. Configure URL + token da sua
              Evolution em Settings → WhatsApp pra começar.
            </p>
          </div>
        </div>
        <Link to="/app/settings" className="shrink-0">
          <Button className="via-btn-pill" size="lg">
            CONECTAR AGORA <ArrowRight size={16} />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="via-shadow-card rounded-xl border border-border bg-card p-5">
      <p className="via-label">{label}</p>
      <p className="mt-2 text-3xl font-black text-primary" style={{ fontWeight: 900 }}>
        {value}
      </p>
    </div>
  );
}

function NextStep({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="via-shadow-card h-full transition-shadow hover:via-shadow-raised">
      <CardContent className="flex h-full flex-col gap-3 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
          {icon}
        </div>
        <h3 className="text-lg">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
