import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ChangeEvent, type FormEvent } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { uploadWhatsAppExport } from "@/lib/whatsapp.functions";
import { ChevronLeft, Upload, FileArchive, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/conversations/upload")({
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const uploadFn = useServerFn(uploadWhatsAppExport);
  const [sellerId, setSellerId] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [zipInfo, setZipInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sellersQ = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sellers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setZipInfo(null);

    if (f.name.toLowerCase().endsWith(".zip")) {
      try {
        const zip = await JSZip.loadAsync(f);
        const txtFiles = Object.keys(zip.files).filter(
          (name) => name.toLowerCase().endsWith(".txt") && !name.startsWith("__MACOSX") && !zip.files[name]!.dir,
        );
        if (txtFiles.length === 0) {
          toast.error("Nenhum arquivo .txt de conversa encontrado dentro do .zip.");
          setFileText("");
          return;
        }
        const targetFile =
          txtFiles.find((name) => name.toLowerCase().includes("_chat.txt")) || txtFiles[0]!;
        const text = await zip.files[targetFile]!.async("string");
        setFileText(text);
        setZipInfo(`Arquivo extraído: ${targetFile}`);
        toast.success(`Conversa extraída do .zip (${targetFile})`);
      } catch (err) {
        toast.error(`Erro ao abrir .zip: ${(err as Error).message}`);
        setFileText("");
      }
    } else {
      setFileText(await f.text());
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sellerId || !fileText) {
      toast.error("Selecione vendedor e arquivo.");
      return;
    }
    setBusy(true);
    try {
      const r = await uploadFn({
        data: {
          sellerId,
          fileText,
          fileName,
          leadPhone: leadPhone.trim() || undefined,
        },
      });
      toast.success(`Importadas ${r.messageCount} mensagens (${r.audioCount} áudios).`);
      navigate({ to: "/app/conversations/$id", params: { id: r.conversationId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/app/conversations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft size={14} /> Voltar
      </Link>
      <header>
        <span className="via-label">Conversas</span>
        <h1 className="mt-1 text-3xl">Subir export manual</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie um arquivo <code>.txt</code> ou <code>.zip</code> exportado do WhatsApp (com ou sem mídia). As mensagens serão lidas e anonimizadas automaticamente.
        </p>
      </header>

      <form onSubmit={onSubmit} className="via-card space-y-4">
        <div>
          <label className="via-label">Vendedor desta conversa</label>
          <select
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            required
            className="via-input mt-1"
          >
            <option value="">Selecione…</option>
            {(sellersQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {(sellersQ.data ?? []).length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Cadastre vendedores em <Link className="underline" to="/app/settings">Configurações → Vendedores</Link>.
            </p>
          )}
        </div>

        <div>
          <label className="via-label">Telefone do lead (opcional)</label>
          <input
            type="text"
            placeholder="Ex: 5511999998888 (se omitido, é detectado do histórico)"
            value={leadPhone}
            onChange={(e) => setLeadPhone(e.target.value)}
            className="via-input mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Opcional. Se o contato estiver salvo por nome no WhatsApp, você pode informar o número aqui.
          </p>
        </div>

        <div>
          <label className="via-label">Arquivo (.txt ou .zip)</label>
          <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary p-8 text-center text-sm text-muted-foreground hover:border-[color:var(--via-blue)]">
            {fileName?.toLowerCase().endsWith(".zip") ? (
              <FileArchive size={28} className="text-amber-600" />
            ) : fileName ? (
              <FileText size={28} className="text-[color:var(--via-blue)]" />
            ) : (
              <Upload size={28} />
            )}
            <span className="font-medium text-foreground">
              {fileName ? fileName : "Clique para selecionar (ou arraste .txt ou .zip)"}
            </span>
            {zipInfo && <span className="text-xs text-muted-foreground">{zipInfo}</span>}
            <input type="file" accept=".txt,.zip,application/zip,application/x-zip-compressed" onChange={onFile} className="hidden" />
          </label>
        </div>

        <button type="submit" disabled={busy || !sellerId || !fileText} className="via-btn via-btn-primary">
          {busy ? "Importando…" : "Importar"}
        </button>
      </form>
    </div>
  );
}
