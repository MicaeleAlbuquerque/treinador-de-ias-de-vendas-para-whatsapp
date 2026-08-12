import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadWhatsAppExport } from "@/lib/whatsapp.functions";
import { ChevronLeft, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/conversations/upload")({
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const uploadFn = useServerFn(uploadWhatsAppExport);
  const [sellerId, setSellerId] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
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
    setFileText(await f.text());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sellerId || !fileText) {
      toast.error("Selecione vendedor e arquivo.");
      return;
    }
    setBusy(true);
    try {
      const r = await uploadFn({ data: { sellerId, fileText, fileName } });
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
          Envie um arquivo <code>.txt</code> exportado do WhatsApp. As mensagens serão anonimizadas automaticamente.
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
          <label className="via-label">Arquivo .txt</label>
          <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary p-8 text-center text-sm text-muted-foreground hover:border-[color:var(--via-blue)]">
            <Upload size={20} />
            <span>{fileName ? `📄 ${fileName}` : "Clique para selecionar (ou arraste)"}</span>
            <input type="file" accept=".txt" onChange={onFile} className="hidden" />
          </label>
        </div>

        <button type="submit" disabled={busy || !sellerId || !fileText} className="via-btn via-btn-primary">
          {busy ? "Importando…" : "Importar"}
        </button>
      </form>
    </div>
  );
}
