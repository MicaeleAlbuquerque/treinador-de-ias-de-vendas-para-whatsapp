import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Download, Mail, Plus, Send, XCircle, Loader2, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useEnvelopes, useCancelEnvelope } from '../../../hooks/useEnvelopes';
import { sendReminder } from '../../../lib/services/email';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { DataTable, type Column } from '../../../components/DataTable';
import { EmptyState } from '../../../components/EmptyState';
import { EnvelopeStatusBadge } from '../../../components/EnvelopeStatusBadge';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { downloadCSV, todayISO } from '../../../lib/csv';
import type { Envelope } from '../../../types';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  in_progress: 'Em Andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  expired: 'Expirado',
};

const CANCELLABLE = new Set(['draft', 'sent', 'in_progress']);
const REMINDABLE = new Set(['sent', 'in_progress']);

function fmtDate(v: string | null | undefined): string {
  if (!v) return '';
  return format(new Date(v), 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

export const Route = createFileRoute('/_authenticated/envelopes/')({
  component: EnvelopesPage,
});

const statusOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'sent', label: 'Enviado' },
  { value: 'in_progress', label: 'Em Andamento' },
  { value: 'completed', label: 'Concluído' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'expired', label: 'Expirado' },
];

function EnvelopesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: envelopes, isLoading, refetch } = useEnvelopes(
    statusFilter !== 'all' ? { status: statusFilter } : undefined,
  );
  const cancelMutation = useCancelEnvelope();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmRemind, setConfirmRemind] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<null | 'cancel' | 'remind'>(null);

  // Limpa seleção ao trocar filtro
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter]);

  const list = (envelopes ?? []) as Envelope[];
  const selectedList = useMemo(() => list.filter((e) => selectedIds.has(e.id)), [list, selectedIds]);
  const selectedCount = selectedList.length;
  const allSelected = list.length > 0 && list.every((e) => selectedIds.has(e.id));
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(list.map((e) => e.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: '__select',
      header: '',
      render: (row) => {
        const id = row.id as string;
        return (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center">
            <Checkbox
              checked={selectedIds.has(id)}
              onCheckedChange={() => toggleOne(id)}
              aria-label="Selecionar envelope"
            />
          </div>
        );
      },
    },
    { key: 'name', header: 'Nome', render: (row) => <span className="font-medium">{row.name as string}</span> },
    { key: 'document', header: 'Documento', render: (row) => {
      const doc = row.document as Envelope['document'];
      return <span className="text-sm text-muted-foreground">{doc?.name ?? '—'}</span>;
    }},
    { key: 'signers', header: 'Signatários', render: (row) => {
      const signers = row.signers as Envelope['signers'];
      return (
        <span className="text-sm text-muted-foreground">
          {signers?.length ?? 0} signatário(s)
        </span>
      );
    }},
    { key: 'status', header: 'Status', render: (row) => <EnvelopeStatusBadge status={row.status as string} /> },
    { key: 'created_at', header: 'Criado em', render: (row) =>
      format(new Date(row.created_at as string), 'dd/MM/yyyy', { locale: ptBR })
    },
  ];

  // Render header checkbox by replacing first column header with a node
  const columnsWithHeaderCheckbox: Column<Record<string, unknown>>[] = [
    {
      ...columns[0],
      header: (
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={toggleAll}
          aria-label="Selecionar todos"
        />
      ),
    },
    ...columns.slice(1),
  ];

  const exportSource = selectedCount > 0 ? selectedList : list;
  const handleExportCSV = () => {
    if (!exportSource.length) return;
    downloadCSV<Envelope>(
      `envelopes${statusFilter !== 'all' ? `_${statusFilter}` : ''}_${todayISO()}.csv`,
      exportSource,
      [
        { key: 'name', header: 'Nome' },
        { key: 'document', header: 'Documento', format: (r) => r.document?.name ?? '' },
        { key: 'status', header: 'Status', format: (r) => STATUS_LABEL[r.status] ?? r.status },
        { key: 'signers', header: 'Signatários', format: (r) => r.signers?.length ?? 0 },
        { key: 'signing_order', header: 'Ordem' },
        { key: 'created_at', header: 'Criado em', format: (r) => fmtDate(r.created_at) },
        { key: 'completed_at', header: 'Concluído em', format: (r) => fmtDate(r.completed_at) },
        { key: 'expires_at', header: 'Expira em', format: (r) => fmtDate(r.expires_at) },
      ],
    );
    toast.success(`${exportSource.length} envelope(s) exportado(s)`);
  };

  // Bulk cancel
  const handleBulkCancel = async () => {
    if (!profile) return;
    const cancellable = selectedList.filter((e) => CANCELLABLE.has(e.status));
    const ignored = selectedCount - cancellable.length;
    if (cancellable.length === 0) {
      toast.warning('Nenhum envelope elegível para cancelamento');
      setConfirmCancel(false);
      return;
    }
    setBulkBusy('cancel');
    const results = await Promise.allSettled(
      cancellable.map((e) => cancelMutation.mutateAsync({ id: e.id, actorId: profile.id })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    setBulkBusy(null);
    setConfirmCancel(false);
    clearSelection();
    void refetch();
    const parts = [`${ok} cancelado(s)`];
    if (failed) parts.push(`${failed} falharam`);
    if (ignored) parts.push(`${ignored} ignorado(s)`);
    toast.success(parts.join(', '));
  };

  // Bulk reminders
  const runBulkRemind = async () => {
    if (!profile) return;
    const eligible = selectedList.filter((e) => REMINDABLE.has(e.status));
    if (eligible.length === 0) {
      toast.warning('Nenhum envelope elegível para lembrete');
      setConfirmRemind(false);
      return;
    }
    setBulkBusy('remind');
    setConfirmRemind(false);

    const eligibleIds = eligible.map((e) => e.id);
    const { data: pending, error } = await supabase
      .from('signers')
      .select('id, envelope_id, status')
      .in('envelope_id', eligibleIds)
      .in('status', ['pending', 'viewed']);

    if (error) {
      toast.error('Erro ao buscar signatários pendentes');
      setBulkBusy(null);
      return;
    }

    const targets = pending ?? [];
    if (targets.length === 0) {
      toast.info('Nenhum signatário pendente nos envelopes selecionados');
      setBulkBusy(null);
      clearSelection();
      return;
    }

    let sent = 0;
    let failed = 0;
    let rateLimited = false;

    for (const s of targets) {
      try {
        await sendReminder({
          signerId: s.id,
          envelopeId: s.envelope_id,
          actorId: profile.id,
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : '';
        if (/rate|429|limit/i.test(msg)) {
          rateLimited = true;
          break;
        }
      }
      // pequeno delay para evitar burst
      await new Promise((r) => setTimeout(r, 200));
    }

    setBulkBusy(null);
    clearSelection();
    void refetch();

    if (rateLimited) {
      toast.warning(`Limite atingido. Enviados: ${sent}. Tente novamente em alguns segundos.`);
    } else if (failed) {
      toast.success(`${sent} lembrete(s) enviado(s), ${failed} falharam`);
    } else {
      toast.success(`${sent} lembrete(s) enviado(s)`);
    }
  };

  const handleBulkRemindClick = () => {
    if (selectedCount > 5) {
      setConfirmRemind(true);
    } else {
      void runBulkRemind();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={!exportSource.length}
          >
            <Download className="mr-2 h-4 w-4" />
            {selectedCount > 0 ? `Exportar ${selectedCount} selecionado(s)` : 'Exportar CSV'}
          </Button>
          <Button onClick={() => navigate({ to: '/envelopes/new' })}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Envelope
          </Button>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 animate-in slide-in-from-top-2">
          <p className="text-sm font-medium">
            {selectedCount} envelope(s) selecionado(s)
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmCancel(true)}
              disabled={bulkBusy !== null}
            >
              {bulkBusy === 'cancel' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Cancelar selecionados
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkRemindClick}
              disabled={bulkBusy !== null}
            >
              {bulkBusy === 'remind' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Reenviar lembretes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              disabled={bulkBusy !== null}
            >
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !envelopes?.length ? (
        statusFilter !== 'all' ? (
          <EmptyState
            variant="filter"
            icon={Filter}
            title={`Nenhum envelope com status "${statusOptions.find((o) => o.value === statusFilter)?.label}"`}
            description="Não há envelopes correspondentes a este filtro. Tente outro status ou limpe o filtro."
            actionLabel="Limpar filtro"
            onAction={() => setStatusFilter('all')}
            secondaryActionLabel="Novo envelope"
            onSecondaryAction={() => navigate({ to: '/envelopes/new' })}
          />
        ) : (
          <EmptyState
            icon={Mail}
            title="Nenhum envelope ainda"
            description="Crie seu primeiro envelope para enviar documentos para assinatura digital."
            actionLabel="Novo Envelope"
            onAction={() => navigate({ to: '/envelopes/new' })}
            tip="Você pode criar envelopes a partir de templates também."
          />
        )
      ) : (
        <DataTable
          columns={columnsWithHeaderCheckbox}
          data={(envelopes as unknown as Record<string, unknown>[]) ?? []}
          isLoading={isLoading}
          searchable
          onRowClick={(row) => navigate({ to: '/envelopes/$id', params: { id: row.id as string } })}
        />
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {selectedCount} envelope(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Os signatários não poderão mais assinar. Envelopes já finalizados serão ignorados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy === 'cancel'}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleBulkCancel();
              }}
              disabled={bulkBusy === 'cancel'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkBusy === 'cancel' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemind} onOpenChange={setConfirmRemind}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar lembretes?</AlertDialogTitle>
            <AlertDialogDescription>
              Será enviado um email para todos os signatários pendentes de {selectedCount} envelope(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy === 'remind'}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void runBulkRemind();
              }}
              disabled={bulkBusy === 'remind'}
            >
              {bulkBusy === 'remind' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
