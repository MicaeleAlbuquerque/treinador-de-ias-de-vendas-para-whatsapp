import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, signOut } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Field } from "./auth.sign-in";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Loader2,
  QrCode,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Plus,
  Copy,
  Webhook,
  Trash2,
  Activity,
  Download,
  Globe,
  KeyRound,
  Tag,
  BookOpen,
} from "lucide-react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getWhatsAppInstance,
  createWhatsAppInstance,
  refreshWhatsAppInstance,
  getWhatsAppInstanceState,
  disconnectWhatsAppInstance,
  diagnoseWhatsAppInstance,
  importWhatsAppHistory,
  processSyncQueueNow,
  cleanupInvalidConversations,
  probeEvolutionApi,
  upsertSeller,
  deleteSeller,
  saveBusinessHours,
  saveOpenAIByok,
} from "@/lib/whatsapp.functions";
import {
  getPipedriveAuthUrl,
  disconnectPipedrive,
  syncPipedriveNow,
  getPipedriveStatus,
  savePipedriveCredentials,
} from "@/lib/pipedrive.functions";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

type Tab = "account" | "company" | "whatsapp" | "sellers" | "hours" | "ai" | "integracoes";

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("whatsapp");
  // Single-tenant interno: todas as abas sempre visíveis para qualquer usuário autenticado.
  const tabs: { id: Tab; label: string }[] = [
    { id: "whatsapp", label: "WhatsApp" },
    { id: "sellers", label: "Vendedores" },
    { id: "hours", label: "Horário comercial" },
    { id: "ai", label: "Conta da IA" },
    { id: "integracoes", label: "Integrações" },
    { id: "company", label: "Empresa" },
    { id: "account", label: "Conta" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <span className="via-label">Configurações</span>
        <h1 className="mt-1 text-3xl">Preferências</h1>
      </header>
      <div className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-wide border-b-2 ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "account" && <AccountSettings />}
      {tab === "company" && <CompanySettings />}
      {tab === "whatsapp" && <WhatsAppSettings />}
      {tab === "sellers" && <SellersSettings />}
      {tab === "hours" && <BusinessHoursSettings />}
      {tab === "ai" && <AIAccountSettings />}
      {tab === "integracoes" && <IntegrationsSettings />}
    </div>
  );
}

function IntegrationsSettings() {
  const qc = useQueryClient();
  const getUrlFn = useServerFn(getPipedriveAuthUrl);
  const disconnectFn = useServerFn(disconnectPipedrive);
  const syncFn = useServerFn(syncPipedriveNow);
  const getStatusFn = useServerFn(getPipedriveStatus);
  const saveCredsFn = useServerFn(savePipedriveCredentials);
  const [busy, setBusy] = useState(false);
  const [editingCreds, setEditingCreds] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const statusQ = useQuery({
    queryKey: ["pipedrive-status"],
    queryFn: () => getStatusFn({}),
  });

  const connQ = useQuery({
    queryKey: ["pipedrive-conn"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pipedrive_connections")
        .select("id, company_id, api_domain, scopes, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const statsQ = useQuery({
    queryKey: ["pipedrive-stats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("outcome_source", "pipedrive")
        .gte("outcome_at", since);
      return count ?? 0;
    },
  });

  async function connect() {
    setBusy(true);
    try {
      const { url } = await getUrlFn({});
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!confirm("Desconectar Pipedrive?")) return;
    setBusy(true);
    try {
      await disconnectFn({});
      toast.success("Desconectado");
      qc.invalidateQueries({ queryKey: ["pipedrive-conn"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function syncNow() {
    setBusy(true);
    try {
      const r = await syncFn({});
      toast.success(`Sincronizado: ${r.changed} alteradas / ${r.processed} verificadas`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveCreds() {
    setBusy(true);
    try {
      await saveCredsFn({ data: { clientId: clientId.trim(), clientSecret: clientSecret.trim() } });
      toast.success("Credenciais salvas.");
      setEditingCreds(false);
      setClientId("");
      setClientSecret("");
      qc.invalidateQueries({ queryKey: ["pipedrive-status"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function clearCreds() {
    if (!confirm("Apagar credenciais Pipedrive salvas?")) return;
    setBusy(true);
    try {
      await saveCredsFn({ data: { clientId: "", clientSecret: "" } });
      toast.success("Credenciais removidas.");
      qc.invalidateQueries({ queryKey: ["pipedrive-status"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  const conn = connQ.data as any;
  const status = statusQ.data;
  const credsReady = !!(status?.hasCredsInDb || status?.hasCredsInEnv);

  return (
    <section className="space-y-4">
      <div className="via-card space-y-3">
        <h2 className="text-lg font-bold">Pipedrive</h2>
        <p className="text-sm text-muted-foreground">
          Cruza conversas com deals do Pipedrive por telefone. Outcome (won/lost) é puxado automaticamente.
        </p>

        {/* Credenciais OAuth */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Credenciais OAuth do app Pipedrive</div>
            {credsReady && !editingCreds && (
              <span className="text-xs text-green-600">Configurado</span>
            )}
          </div>
          {status?.redirectUri && (
            <div className="text-xs text-muted-foreground">
              Registre este redirect URI no seu app Pipedrive:
              <code className="block mt-1 break-all bg-background border border-border rounded px-2 py-1 text-[11px]">
                {status.redirectUri}
              </code>
            </div>
          )}
          {!editingCreds ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {credsReady ? (
                <>
                  <div className="text-xs text-muted-foreground self-center">
                    Client ID: <code>{status?.clientIdMasked ?? "(via env)"}</code>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditingCreds(true)}>Alterar</Button>
                  {status?.hasCredsInDb && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={clearCreds} disabled={busy}>
                      Limpar
                    </Button>
                  )}
                </>
              ) : (
                <Button size="sm" onClick={() => setEditingCreds(true)}>Configurar credenciais</Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <label className="block">
                <span className="via-label">Client ID</span>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="ex: 1234abcd5678efgh"
                />
              </label>
              <label className="block">
                <span className="via-label">Client Secret</span>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="secret do seu app Pipedrive"
                />
              </label>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveCreds} disabled={busy || !clientId.trim() || !clientSecret.trim()}>
                  Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditingCreds(false); setClientId(""); setClientSecret(""); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Conexão OAuth */}
        {!conn ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={connect}
              disabled={busy || !credsReady}
              className="via-btn via-btn-primary"
              title={credsReady ? "" : "Configure as credenciais antes."}
            >
              Conectar Pipedrive
            </button>
            {!credsReady && (
              <span className="text-xs text-muted-foreground">Configure as credenciais primeiro.</span>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Empresa:</span> {conn.company_id ?? "—"}</div>
            <div><span className="text-muted-foreground">Domínio:</span> {conn.api_domain ?? "—"}</div>
            <div><span className="text-muted-foreground">Escopos:</span> {(conn.scopes ?? []).join(", ")}</div>
            <div className="text-xs text-muted-foreground">
              {statsQ.data ?? 0} conversas com outcome puxado do Pipedrive nas últimas 24h.
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={syncNow} disabled={busy} className="via-btn via-btn-secondary">Sincronizar agora</button>
              <button onClick={disconnect} disabled={busy} className="via-btn via-btn-secondary">Desconectar</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AccountSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("display_name").eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profileQuery.data?.display_name) setDisplayName(profileQuery.data.display_name);
  }, [profileQuery.data]);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
    setSavingName(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Nome atualizado.");
    qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
  }

  const [sendingReset, setSendingReset] = useState(false);

  async function savePwd(e: FormEvent) {
    e.preventDefault();
    if (!password || password.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPwd(false);
    if (error) { toast.error(error.message); return; }
    setPassword("");
    toast.success("Senha atualizada com sucesso.");
  }

  async function sendResetLink() {
    if (!user?.email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setSendingReset(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Link de redefinição enviado para ${user.email}`);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={saveName} className="via-card space-y-4">
        <h3 className="text-lg">Perfil</h3>
        <Field label="Nome de exibição" type="text" value={displayName} onChange={setDisplayName} required />
        <p className="text-xs text-muted-foreground">E-mail: <span className="font-mono">{user?.email}</span></p>
        <button type="submit" disabled={savingName} className="via-btn via-btn-primary">
          {savingName ? "Salvando…" : "Salvar"}
        </button>
      </form>
      <form onSubmit={savePwd} className="via-card space-y-4">
        <h3 className="text-lg">Mudar senha</h3>
        <p className="text-xs text-muted-foreground">
          Defina uma nova senha diretamente abaixo ou solicite um link de recuperação por e-mail.
        </p>
        <Field label="Nova senha" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="submit" disabled={savingPwd || !password} className="via-btn via-btn-primary">
            {savingPwd ? "Salvando…" : "Atualizar senha"}
          </button>
          <button
            type="button"
            onClick={sendResetLink}
            disabled={sendingReset}
            className="via-btn via-btn-secondary"
          >
            {sendingReset ? "Enviando…" : "Enviar link por e-mail"}
          </button>
        </div>
      </form>
      <div className="via-card">
        <h3 className="text-lg">Sessão</h3>
        <p className="text-sm text-muted-foreground mt-1">Encerre a sessão neste navegador.</p>
        <button type="button" onClick={async () => { await signOut(); navigate({ to: "/" }); }}
          className="via-btn via-btn-secondary mt-4">Sair</button>
      </div>
    </div>
  );
}

function CompanySettings() {
  const qc = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["app-settings-full"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("company_name, logo_url").limit(1).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setCompanyName(settingsQuery.data.company_name ?? "");
      setLogoUrl(settingsQuery.data.logo_url ?? "");
    }
  }, [settingsQuery.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ company_name: companyName || null, logo_url: logoUrl || null, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Empresa atualizada.");
    qc.invalidateQueries({ queryKey: ["app-settings"] });
    qc.invalidateQueries({ queryKey: ["app-settings-full"] });
    qc.invalidateQueries({ queryKey: ["app-settings-company"] });
  }

  return (
    <form onSubmit={save} className="via-card space-y-4">
      <h3 className="text-lg">Identidade da empresa</h3>
      <p className="text-xs text-muted-foreground">Aparece no topo do painel. Apenas cosmético.</p>
      <Field label="Nome da empresa" type="text" value={companyName} onChange={setCompanyName} />
      <Field label="URL do logo (opcional)" type="url" value={logoUrl} onChange={setLogoUrl} />
      <button type="submit" disabled={saving} className="via-btn via-btn-primary">
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}

function WhatsAppSettings() {
  const qc = useQueryClient();
  const getInstanceFn = useServerFn(getWhatsAppInstance);
  const disconnectFn = useServerFn(disconnectWhatsAppInstance);
  const diagnoseFn = useServerFn(diagnoseWhatsAppInstance);
  const importFn = useServerFn(importWhatsAppHistory);
  const processQueueFn = useServerFn(processSyncQueueNow);
  const cleanupFn = useServerFn(cleanupInvalidConversations);
  const probeFn = useServerFn(probeEvolutionApi);
  const refreshFn = useServerFn(refreshWhatsAppInstance);
  const [busy, setBusy] = useState(false);
  const [probeResult, setProbeResult] = useState<any | null>(null);
  const [importDays, setImportDays] = useState(30);
  const [importMaxChats, setImportMaxChats] = useState(50);
  const [diagnosisFor, setDiagnosisFor] = useState<{ id: string; data: any | null; loading: boolean } | null>(null);
  const [pairFor, setPairFor] = useState<{ id: string; name: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const instQ = useQuery({
    queryKey: ["whatsapp-instance"],
    queryFn: () => getInstanceFn({}),
    refetchInterval: 5000,
  });
  const sellersQ = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data } = await supabase.from("sellers").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });

  async function onDisconnect(id: string) {
    if (!confirm("Excluir esta instância? Remove a conexão atual e libera pra você conectar uma nova (ex: pra demonstrar do zero). As conversas já importadas não são apagadas.")) return;
    setBusy(true);
    try {
      await disconnectFn({ data: { instanceId: id } });
      qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
      toast.success("Instância excluída. Você já pode criar uma nova.");
    }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onDiagnose(id: string) {
    setDiagnosisFor({ id, data: null, loading: true });
    try {
      const r = await diagnoseFn({ data: { instanceId: id } });
      setDiagnosisFor({ id, data: r, loading: false });
    } catch (e) {
      toast.error((e as Error).message);
      setDiagnosisFor({ id, data: { error: (e as Error).message }, loading: false });
    }
  }

  async function onImport(id: string) {
    if (!confirm(`Importar até ${importMaxChats} conversas dos últimos ${importDays} dias? Pode levar alguns minutos pra volumes grandes.`)) return;
    setBusy(true);
    // Toast informativo enquanto roda
    const toastId = toast.loading(`Importando histórico… até ${importMaxChats} conversas. Acompanhe a barra de progresso abaixo.`);
    // Refresh agressivo do SyncJobsList enquanto importa
    const refreshInterval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["sync-jobs", id] });
    }, 1500);
    try {
      const r = await importFn({ data: { instanceId: id, days: importDays, maxChats: importMaxChats } });
      toast.dismiss(toastId);
      if (r.status === "done") {
        toast.success(`Importado: ${r.chatsImported}/${r.chatsFound} chats, ${r.messagesImported} mensagens, ${r.audiosQueued} áudios.`);
      } else {
        toast.error(`Falhou: ${r.error ?? "erro desconhecido"}. Clique "Processar pendentes" pra retomar.`);
      }
      qc.invalidateQueries({ queryKey: ["sync-jobs", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.dismiss(toastId);
      const msg = (e as Error).message;
      // Timeout do serverless: o job continua rodando, só perdemos a conexão.
      const isTimeout = msg.includes("timeout") || msg.includes("aborted") || msg.includes("Failed to fetch");
      if (isTimeout) {
        toast.warning(`A conexão foi cortada por timeout do servidor, mas a importação CONTINUA rodando em background. Aguarde a barra abaixo concluir ou clique "Processar pendentes" pra retomar.`, { duration: 10000 });
      } else {
        toast.error(msg);
      }
    } finally {
      clearInterval(refreshInterval);
      setBusy(false);
    }
  }

  async function onProcessQueue(id: string) {
    setBusy(true);
    try {
      const r = await processQueueFn({ data: { instanceId: id } });
      if (r.processed === 0) {
        toast.info("Nenhum job pendente.");
      } else if (r.failed > 0) {
        toast.warning(`Processados: ${r.processed} (${r.failed} falhas).`);
      } else {
        toast.success(`Processados: ${r.processed} job(s).`);
      }
      qc.invalidateQueries({ queryKey: ["sync-jobs", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onProbe(id: string) {
    setBusy(true);
    setProbeResult(null);
    const toastId = toast.loading("Sondando a Evolution (resposta crua)…");
    try {
      const r = await probeFn({ data: { instanceId: id } });
      setProbeResult(r);
      toast.dismiss(toastId);
      toast.success("Diagnóstico pronto. Copie o JSON e me mande.");
    } catch (e) {
      toast.dismiss(toastId);
      const msg = (e as Error).message;
      setProbeResult({ error: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onCleanup() {
    if (!confirm("Apagar conversas com lead_phone inválido (resíduo de bug de importação)? Mensagens serão removidas em cascata. Não desfaz.")) return;
    setBusy(true);
    try {
      const r = await cleanupFn({});
      if (r.deleted === 0) toast.info("Nenhuma conversa inválida encontrada.");
      else toast.success(`Removidas ${r.deleted} conversas inválidas.`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onRefresh(id: string) {
    setBusy(true);
    try {
      await refreshFn({ data: { instanceId: id } });
      qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
      toast.success("Status atualizado");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  if (instQ.isLoading) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  const i = instQ.data as any | null;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Conecte sua instância via Evolution API.</p>
        <Button onClick={() => setNewOpen(true)} disabled={!!i}>
          <Plus className="h-4 w-4" /> Nova instância
        </Button>
      </div>

      {!i ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/40 p-12 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Smartphone className="h-7 w-7 text-primary" />
          </div>
          <p className="text-base font-semibold">Nenhuma instância ainda</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Conecte sua Evolution e comece a capturar conversas em tempo real.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4">
          <InstanceCard
            i={i}
            onConnect={() => setPairFor({ id: i.id, name: i.instance_name })}
            onDisconnect={() => onDisconnect(i.id)}
            onDiagnose={() => onDiagnose(i.id)}
            onRefresh={() => onRefresh(i.id)}
            busy={busy}
          />

          <div id="importar" className="via-card space-y-3 scroll-mt-20">
            <h3 className="text-lg">Importar histórico</h3>
            <p className="text-xs text-muted-foreground">
              Puxa conversas existentes via Evolution API (até 200 chats). Útil pra carregar histórico anterior à conexão.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="block">
                <span className="via-label">Últimos (dias)</span>
                <input type="number" min={1} max={365} value={importDays}
                  onChange={(e) => setImportDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
                  className="mt-1 w-32 rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="via-label">Máx. conversas</span>
                <input type="number" min={1} max={5000} step={50} value={importMaxChats}
                  onChange={(e) => setImportMaxChats(Math.max(1, Math.min(5000, Number(e.target.value) || 50)))}
                  className="mt-1 w-32 rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <p className="text-xs text-muted-foreground self-end max-w-xs">
                Apenas chats 1-on-1. <strong>Default 50</strong> cabe em ~30s sem estourar o timeout serverless. Pra volumes maiores, suba e clique "Processar pendentes" várias vezes até concluir.
              </p>
              <Button disabled={busy || i.status !== "connected"} onClick={() => onImport(i.id)}>
                <Download className="h-4 w-4" /> {busy ? "Processando…" : "Importar histórico"}
              </Button>
              {busy && (
                <span className="text-[11px] text-muted-foreground self-end">
                  Pode levar minutos · acompanhe a barra abaixo
                </span>
              )}
              <Button
                variant="outline"
                disabled={busy || i.status !== "connected"}
                onClick={() => onProcessQueue(i.id)}
                title="Retoma jobs pendentes ou órfãos sem criar novo."
              >
                <RefreshCw className="h-4 w-4" /> Processar pendentes
              </Button>
              <Button
                variant="ghost"
                className="text-red-600"
                disabled={busy}
                onClick={onCleanup}
                title="Remove conversas com lead_phone não-numérico (resíduo de bug)."
              >
                <Trash2 className="h-4 w-4" /> Limpar inválidas
              </Button>
              <Button
                variant="outline"
                disabled={busy || i.status !== "connected"}
                onClick={() => onProbe(i.id)}
                title="Mostra a resposta CRUA da Evolution (findChats + findMessages) pra diagnosticar por que as mensagens não vêm."
              >
                <RefreshCw className="h-4 w-4" /> Diagnóstico bruto
              </Button>
            </div>
            {i.status !== "connected" && (
              <p className="text-xs text-muted-foreground">Conecte a instância antes de importar.</p>
            )}
            {probeResult && (
              <div className="mt-3 rounded-xl border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Resposta crua da Evolution — copie tudo e mande pro suporte
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(probeResult, null, 2));
                        toast.success("JSON copiado.");
                      }}
                    >
                      Copiar JSON
                    </Button>
                    <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setProbeResult(null)}>
                      Fechar
                    </Button>
                  </div>
                </div>
                <pre className="max-h-96 overflow-auto rounded-lg bg-background/80 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(probeResult, null, 2)}
                </pre>
              </div>
            )}
            <SyncJobsList instanceId={i.id} />
          </div>
        </div>
      )}

      <NewInstanceDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        sellers={sellersQ.data ?? []}
        onCreated={(id, name) => {
          setNewOpen(false);
          setPairFor({ id, name });
          qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
          qc.invalidateQueries({ queryKey: ["wa-instance-status"] });
          qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
        }}
      />
      <PairSheet
        target={pairFor}
        onClose={() => setPairFor(null)}
        onConnected={() => {
          setPairFor(null);
          qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
        }}
      />
      <DiagnosticDialog
        open={!!diagnosisFor}
        onClose={() => setDiagnosisFor(null)}
        loading={diagnosisFor?.loading ?? false}
        result={diagnosisFor?.data ?? null}
      />
    </>
  );
}

// ---------- StatusBadge ----------
function StatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
    connected: { cls: "bg-green-500/15 text-green-600", label: "Conectado", Icon: CheckCircle2 },
    connecting: { cls: "bg-amber-500/15 text-amber-600", label: "Conectando", Icon: AlertCircle },
    qr: { cls: "bg-amber-500/15 text-amber-600", label: "Aguardando QR", Icon: QrCode },
    disconnected: { cls: "bg-muted text-muted-foreground", label: "Desconectado", Icon: AlertCircle },
    error: { cls: "bg-red-500/15 text-red-600", label: "Erro", Icon: AlertCircle },
  };
  const m = (status && map[status]) || map.disconnected;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", m.cls)}>
      <m.Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

// ---------- InstanceCard ----------
function InstanceCard({
  i, onConnect, onDisconnect, onDiagnose, onRefresh, busy,
}: {
  i: any;
  onConnect: () => void;
  onDisconnect: () => void;
  onDiagnose: () => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const projectBase =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://project--c0a2752e-b465-4795-87cb-f4692ec431c8.lovable.app";
  const webhookUrl = i.webhook_token
    ? `${projectBase}/api/public/whatsapp-webhook?token=${i.webhook_token}`
    : "";

  const copy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    toast.success("URL do webhook copiada");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{i.instance_name}</p>
            <p className="text-xs text-muted-foreground">Evolution API</p>
          </div>
        </div>
        <StatusBadge status={i.status} />
      </div>

      {webhookUrl && (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
            <Webhook className="h-3.5 w-3.5" /> Webhook configurado automaticamente
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs bg-background border border-border rounded px-2 py-1.5">
              {webhookUrl}
            </code>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Você pode reconfigurar manualmente se precisar.
          </p>
        </div>
      )}

      {i.last_error && (
        <div className="mt-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-600">{i.last_error}</div>
      )}
      {i.last_sync_at && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Última sync: {new Date(i.last_sync_at).toLocaleString("pt-BR")}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {i.status !== "connected" && (
            <Button size="sm" onClick={onConnect}>
              <QrCode className="h-3.5 w-3.5" /> Conectar via QR
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={busy}>
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Atualizar
          </Button>
          <Button size="sm" variant="outline" onClick={onDiagnose}>
            <Activity className="h-3.5 w-3.5" /> Diagnosticar
          </Button>
        </div>
        {/* Excluir sempre disponível (qualquer status) — libera pra reconectar. */}
        <Button size="sm" variant="ghost" className="text-red-600" onClick={onDisconnect} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5" /> Excluir instância
        </Button>
      </div>
    </div>
  );
}

// ---------- NewInstanceDialog ----------
function NewInstanceDialog({
  open, onClose, sellers, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  sellers: { id: string; name: string }[];
  onCreated: (id: string, name: string) => void;
}) {
  const createFn = useServerFn(createWhatsAppInstance);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const r = await createFn({
        data: {
          instanceName: instanceName.trim(),
          evolutionUrl: baseUrl.trim(),
          evolutionToken: apiKey.trim(),
          sellerId: sellerId || null,
        },
      });
      toast.success("Instância criada. Escaneie o QR.");
      onCreated(r.instanceId, name.trim() || instanceName.trim());
      setName(""); setBaseUrl(""); setApiKey(""); setInstanceName(""); setSellerId("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  const valid = name.trim() && baseUrl.trim() && apiKey.trim() && instanceName.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova instância WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Smartphone className="h-4 w-4" />
          </div>
          <div className="text-xs leading-relaxed">
            <p className="font-semibold text-sm text-foreground mb-1">Conecte seu WhatsApp em 3 passos</p>
            <p className="text-muted-foreground">
              A Evolution API é um servidor que conversa com o WhatsApp pelo seu celular. Você só precisa nos passar{" "}
              <strong className="text-foreground">o endereço dela</strong>,{" "}
              <strong className="text-foreground">a senha</strong> e{" "}
              <strong className="text-foreground">um apelido</strong>. A gente cuida do resto: cria a instância,
              configura webhook e te dá o QR pra parear.
            </p>
          </div>
        </div>

        <div className="space-y-4 mt-4">
          <FieldRow label="Apelido interno" icon={<Tag className="h-3.5 w-3.5 text-muted-foreground" />}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Vendas Brasil" />
            <p className="text-[11px] text-muted-foreground">
              Como você vai identificar essa instância aqui dentro do app. Pode ter espaços e acentos.
            </p>
          </FieldRow>

          <FieldRow label="Endereço (base URL) da Evolution" icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://evo.meudominio.com" />
            <p className="text-[11px] text-muted-foreground">
              O domínio onde sua Evolution está rodando. Sem barra no final. Em testes locais costuma ser{" "}
              <code className="bg-muted/50 rounded px-1 py-0.5">http://localhost:8080</code>.
            </p>
          </FieldRow>

          <FieldRow label="API Key" icon={<KeyRound className="h-3.5 w-3.5 text-muted-foreground" />}>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Ex.: B6D711FCDE4D4FD5936544120E713976" />
            <p className="text-[11px] text-muted-foreground">
              Senha de acesso ao seu servidor Evolution. Geralmente é uma string de 32 caracteres alfanuméricos.
              Em self-hosted, é a variável <code className="bg-muted/50 rounded px-1 py-0.5">AUTHENTICATION_API_KEY</code> do seu{" "}
              <code className="bg-muted/50 rounded px-1 py-0.5">.env</code>. Em provedores cloud, vem no painel.
            </p>
          </FieldRow>

          <FieldRow label="Nome da instância" icon={<Tag className="h-3.5 w-3.5 text-muted-foreground" />}>
            <Input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} placeholder="ex.: vendas" />
            <p className="text-[11px] text-muted-foreground">
              Apelido único pra esse "número" dentro da Evolution. Use minúsculas e sem espaço — ex.:{" "}
              <code className="bg-muted/50 rounded px-1 py-0.5">vendas</code>,{" "}
              <code className="bg-muted/50 rounded px-1 py-0.5">suporte</code>. Se não existir, criamos pra você.
              Se já existir, só conectamos.
            </p>
          </FieldRow>

          {sellers.length > 0 && (
            <div className="space-y-2">
              <Label>Vendedor dono (opcional)</Label>
              <select value={sellerId} onChange={(e) => setSellerId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="">— sem vendedor —</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <Accordion type="single" collapsible className="rounded-xl border border-border bg-muted/20 px-4 mt-4">
          <AccordionItem value="how" className="border-b-0">
            <AccordionTrigger className="text-sm font-semibold py-3">
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Como encontrar esses dados?
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <ol className="space-y-3 text-sm">
                <Step n="1" title="Acesse o painel da sua Evolution">
                  Se você usa um provedor cloud, faça login. Se é self-hosted, acesse o domínio onde subiu o Docker
                  — geralmente <code>https://evo.seudominio.com/manager</code>.
                </Step>
                <Step n="2" title="Copie o endereço (base URL)">
                  É a URL do painel sem o caminho. Se você acessa <code>https://evo.seudominio.com/manager</code>,
                  a base URL é <code>https://evo.seudominio.com</code>.
                </Step>
                <Step n="3" title="Pegue a API Key">
                  No painel admin, procure por "API Key" ou "Token de acesso". Em self-hosted, está no{" "}
                  <code>.env</code> como <code>AUTHENTICATION_API_KEY</code>.
                </Step>
                <Step n="4" title="Defina um nome">
                  Pode ser qualquer apelido (sem espaço, minúsculas). Não precisa criar antes na Evolution.
                </Step>
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="rounded-xl border border-border bg-muted/20 p-4 mt-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Ao salvar, automaticamente:
          </p>
          <ul className="space-y-1.5 text-[12px]">
            <CheckLine>Criamos a instância na sua Evolution (se ainda não existir).</CheckLine>
            <CheckLine>Configuramos o webhook apontando pra cá — você não precisa colar nada.</CheckLine>
            <CheckLine>Geramos um QR code pra você escanear com o celular.</CheckLine>
            <CheckLine>A IA começa a processar suas conversas em segundos.</CheckLine>
          </ul>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando instância…</> : "Criar e gerar QR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">{icon}{label}</Label>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 rounded px-1.5 py-0.5">obrigatório</span>
      </div>
      {children}
    </div>
  );
}
function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground text-[13px] mb-0.5">{title}</p>
        <p className="text-muted-foreground text-[12px] leading-relaxed">{children}</p>
      </div>
    </li>
  );
}
function CheckLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-foreground/80">
      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

// ---------- DiagnosticDialog ----------
function DiagnosticDialog({
  open, onClose, loading, result,
}: { open: boolean; onClose: () => void; loading: boolean; result: any | null }) {
  const d = result?.base_url_reachable !== undefined ? result : null;
  const rows = d ? [
    { label: "Base URL acessível", ok: d.base_url_reachable },
    { label: "API Key válida", ok: d.auth_valid },
    { label: "Instância existe na Evolution", ok: d.instance_exists_remotely },
  ] : [];
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Diagnóstico da Evolution</DialogTitle>
          <DialogDescription>Resultado dos probes feitos contra a URL e API Key salvas.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Testando conexão…
          </div>
        ) : d ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                  <span>{row.label}</span>
                  <span className={cn("font-semibold", row.ok ? "text-green-600" : "text-red-600")}>
                    {row.ok ? "OK" : "Falhou"}
                  </span>
                </div>
              ))}
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                Estado remoto: <span className="font-mono text-muted-foreground">{d.instance_state ?? "—"}</span>
              </div>
            </div>
            {d.probes && (
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Endpoints testados</p>
                <div className="space-y-1 text-xs font-mono text-muted-foreground">
                  {d.probes.map((p: any, idx: number) => (
                    <div key={idx} className="flex items-start justify-between gap-3">
                      <span>{p.path}</span>
                      <span className={p.ok ? "text-green-600" : "text-red-600"}>{p.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Nenhum resultado.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PairSheet({
  target,
  onClose,
  onConnected,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onConnected: () => void;
}) {
  const refreshFn = useServerFn(refreshWhatsAppInstance);
  const stateFn = useServerFn(getWhatsAppInstanceState);
  const open = !!target;
  const id = target?.id ?? null;

  // Polling barato: só lê DB (3s)
  const stateQ = useQuery({
    queryKey: ["pair-state", id],
    enabled: !!id,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    queryFn: async () => stateFn({ data: { instanceId: id! } }),
  });

  // Refresh real do QR (chama Evolution): 25s + on mount
  const qrQ = useQuery({
    queryKey: ["pair-qr", id],
    enabled: !!id,
    refetchInterval: 25000,
    refetchIntervalInBackground: false,
    refetchOnMount: true,
    queryFn: async () => refreshFn({ data: { instanceId: id! } }),
  });

  const [qrImg, setQrImg] = useState<string | null>(null);

  useEffect(() => {
    if (stateQ.data?.status === "connected") {
      toast.success("WhatsApp conectado!");
      onConnected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateQ.data?.status]);

  // Renderiza QR: base64 direto OU code via lib qrcode
  useEffect(() => {
    let cancelled = false;
    const base64 = qrQ.data?.qrBase64 ?? null;
    const code = (qrQ.data as any)?.qrCode ?? null;
    if (base64) {
      const src = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
      setQrImg(src);
      return;
    }
    if (code) {
      QRCode.toDataURL(code, { width: 256, margin: 1 })
        .then((url) => { if (!cancelled) setQrImg(url); })
        .catch(() => { if (!cancelled) setQrImg(null); });
      return () => { cancelled = true; };
    }
    setQrImg(null);
    return () => { cancelled = true; };
  }, [qrQ.data]);

  const state = stateQ.data?.status;
  const loading = qrQ.isFetching && !qrImg;
  const stateLabel =
    state === "connected"
      ? "Conectado"
      : loading
        ? "Carregando QR…"
        : qrImg
          ? "Aguardando leitura"
          : state === "connecting" || state === "qr"
            ? "Aguardando leitura"
            : "Aguardando QR…";

  const stateCls =
    state === "connected"
      ? "bg-green-500/15 text-green-600"
      : "bg-amber-500/15 text-amber-600";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Parear WhatsApp · {target?.name}</SheetTitle>
          <SheetDescription>
            Escaneie o QR abaixo com o WhatsApp do vendedor. O status atualiza sozinho.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col items-center gap-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${stateCls}`}>
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            {state === "connected" && <CheckCircle2 className="h-3 w-3" />}
            {stateLabel}
          </span>

          <div className="flex h-64 w-64 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
            {qrImg ? (
              <img src={qrImg} alt="QR code de pareamento" className="h-64 w-64" />
            ) : loading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <div className="px-4 text-center text-[11px] leading-relaxed text-muted-foreground">
                QR ainda não disponível. Clique em <strong>Atualizar QR</strong>.
              </div>
            )}
          </div>

          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Abra o WhatsApp no celular → <strong>⋮ Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> → escaneie.
          </p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => qrQ.refetch()} disabled={qrQ.isFetching || !id}>
              <RefreshCw className={cn("h-3.5 w-3.5", qrQ.isFetching && "animate-spin")} /> Atualizar QR
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            O QR é renovado automaticamente a cada 25s para evitar invalidação.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SyncJobsList({ instanceId }: { instanceId: string }) {
  const q = useQuery({
    queryKey: ["sync-jobs", instanceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_jobs")
        .select("id, type, status, chats_found, chats_imported, messages_imported, audios_queued, error_text, started_at, finished_at, created_at, locked_at")
        .eq("instance_id", instanceId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasRunning = data?.some((j) => j.status === "running" || j.status === "pending");
      // Polling agressivo (1.5s) durante import; nada quando idle.
      return hasRunning ? 1500 : false;
    },
  });

  if (!q.data?.length) return null;
  return (
    <div className="mt-2 space-y-2">
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Jobs recentes</h4>
      <ul className="divide-y divide-border space-y-2">
        {q.data.map((j: any) => {
          const running = j.status === "running" || j.status === "pending";
          const pct = j.chats_found > 0 ? Math.min(100, Math.round((j.chats_imported / j.chats_found) * 100)) : 0;
          const elapsed = j.started_at ? Math.round((Date.now() - new Date(j.started_at).getTime()) / 1000) : 0;
          const elapsedLabel = elapsed > 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
          // Estima tempo restante linearmente
          const eta = running && j.chats_imported > 0 && j.chats_found > j.chats_imported
            ? Math.round((elapsed / j.chats_imported) * (j.chats_found - j.chats_imported))
            : 0;
          const etaLabel = eta > 60 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : `${eta}s`;
          return (
            <li key={j.id} className="py-2 space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`via-badge ${
                    j.status === "done" ? "bg-green-500/15 text-green-700"
                    : j.status === "failed" ? "bg-red-500/15 text-red-700"
                    : "bg-blue-500/15 text-blue-700"
                  }`}>
                    {running ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        {j.status}
                      </span>
                    ) : j.status}
                  </span>
                  <span className="text-muted-foreground truncate">{j.type}</span>
                </div>
                <div className="text-muted-foreground whitespace-nowrap">
                  {running ? `${elapsedLabel}${eta > 0 ? ` · ~${etaLabel} restantes` : ""}` :
                    j.finished_at ? new Date(j.finished_at).toLocaleTimeString("pt-BR") : "…"}
                </div>
              </div>
              {(running || j.chats_found > 0) && (
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${j.status === "failed" ? "bg-red-500" : "bg-[color:var(--via-blue)]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground flex justify-between">
                    <span>
                      <strong>{j.chats_imported}</strong>/{j.chats_found} chats ·{" "}
                      <strong>{j.messages_imported}</strong> msgs ·{" "}
                      <strong>{j.audios_queued}</strong> áudios
                    </span>
                    <span>{pct}%</span>
                  </div>
                </div>
              )}
              {j.error_text && <div className="text-xs text-red-700 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1">{j.error_text}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SellersSettings() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertSeller);
  const deleteFn = useServerFn(deleteSeller);
  const [editing, setEditing] = useState<{ id?: string; name: string; phone: string; email: string; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const sellersQ = useQuery({
    queryKey: ["sellers-all"],
    queryFn: async () => {
      const { data } = await supabase.from("sellers").select("id, name, phone, email, active").order("name");
      return data ?? [];
    },
  });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await upsertFn({ data: { id: editing.id ?? null, name: editing.name, phone: editing.phone, email: editing.email || null, active: editing.active } });
      toast.success("Salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["sellers-all"] });
      qc.invalidateQueries({ queryKey: ["sellers"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Remover vendedor?")) return;
    try { await deleteFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["sellers-all"] }); toast.success("Removido"); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg">Vendedores</h3>
        <button onClick={() => setEditing({ name: "", phone: "", email: "", active: true })} className="via-btn via-btn-sm via-btn-primary">Novo vendedor</button>
      </div>
      <div className="via-card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Nome</th><th className="px-3 py-2 text-left">Telefone</th><th className="px-3 py-2 text-left">Email</th><th className="px-3 py-2">Ativo</th><th /></tr>
          </thead>
          <tbody>
            {(sellersQ.data ?? []).map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{s.phone}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.email ?? "—"}</td>
                <td className="px-3 py-2 text-center">{s.active ? "✓" : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setEditing({ id: s.id, name: s.name, phone: s.phone, email: s.email ?? "", active: s.active })} className="text-xs underline mr-3">Editar</button>
                  <button onClick={() => remove(s.id)} className="text-xs underline text-red-600">Remover</button>
                </td>
              </tr>
            ))}
            {(sellersQ.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">Nenhum vendedor cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <form onSubmit={save} className="via-card space-y-3">
          <h4 className="text-base font-semibold">{editing.id ? "Editar" : "Novo"} vendedor</h4>
          <Field label="Nome" type="text" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} required />
          <Field label="Telefone (+55…)" type="text" value={editing.phone} onChange={(v) => setEditing({ ...editing, phone: v })} required />
          <Field label="Email (opcional)" type="email" value={editing.email} onChange={(v) => setEditing({ ...editing, email: v })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Ativo
          </label>
          <div className="flex gap-2">
            <button disabled={busy} type="submit" className="via-btn via-btn-sm via-btn-primary">{busy ? "Salvando…" : "Salvar"}</button>
            <button type="button" onClick={() => setEditing(null)} className="via-btn via-btn-sm via-btn-secondary">Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function BusinessHoursSettings() {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveBusinessHours);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["business-hours"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("business_hours").limit(1).maybeSingle();
      return data?.business_hours as any;
    },
  });
  useEffect(() => {
    if (q.data) {
      setStart(q.data.start ?? "09:00");
      setEnd(q.data.end ?? "18:00");
      setDays(Array.isArray(q.data.days) ? q.data.days : [1, 2, 3, 4, 5]);
    }
  }, [q.data]);

  function toggleDay(d: number) {
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort());
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await saveFn({ data: { start, end, days } }); toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["business-hours"] }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="via-card space-y-4">
      <h3 className="text-lg">Horário comercial</h3>
      <p className="text-xs text-muted-foreground">Usado para classificar cadência de resposta dos vendedores.</p>
      <div className="flex gap-3">
        <div className="flex-1"><label className="via-label">Início</label><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="via-input mt-1" /></div>
        <div className="flex-1"><label className="via-label">Fim</label><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="via-input mt-1" /></div>
      </div>
      <div>
        <label className="via-label">Dias</label>
        <div className="mt-1 flex gap-1">
          {DAYS.map((label, idx) => (
            <button key={idx} type="button" onClick={() => toggleDay(idx)}
              className={`flex-1 rounded border px-2 py-2 text-xs transition-colors ${days.includes(idx) ? "bg-primary text-primary-foreground border-transparent" : "bg-card text-muted-foreground border-border hover:bg-secondary"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <button disabled={busy} type="submit" className="via-btn via-btn-primary">{busy ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}

function AIAccountSettings() {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveOpenAIByok);
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["ai-byok"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("has_openai_byok").limit(1).maybeSingle();
      return data;
    },
  });
  useEffect(() => { if (q.data) setEnabled(!!q.data.has_openai_byok); }, [q.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveFn({ data: { apiKey: enabled ? apiKey : null } });
      toast.success(enabled ? "BYOK configurado" : "BYOK desligado");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["ai-byok"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="via-card space-y-4">
      <h3 className="text-lg">Conta da IA</h3>
      <p className="text-xs text-muted-foreground">
        Se o checkbox estiver desmarcado, o sistema usa automaticamente o <strong>Google Gemini (Gemini 3.6)</strong> configurado no seu arquivo <code>.env</code> (<code>GEMINI_API_KEY</code>).
        Ative a opção abaixo apenas se quiser usar a sua chave da OpenAI (<strong>gpt-4o-mini</strong> e Whisper).
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Usar minha chave OpenAI (prioritária sobre o Gemini)
      </label>
      {enabled && (
        <div>
          <Field label="OPENAI_API_KEY" type="password" value={apiKey} onChange={setApiKey} autoComplete="off" />
          {q.data?.has_openai_byok && <p className="text-xs text-green-700">configurado ✓ (deixe em branco para manter)</p>}
        </div>
      )}
      <button disabled={busy} type="submit" className="via-btn via-btn-primary">{busy ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}
