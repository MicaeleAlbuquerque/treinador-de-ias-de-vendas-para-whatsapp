import { createFileRoute } from '@tanstack/react-router';
import { FileText, Trash2, Eye, Loader2, FileUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocuments, useUploadDocument, useDeleteDocument } from '../../hooks/useDocuments';
import { FileUploadZone } from '../../components/FileUploadZone';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { PDFViewer } from '../../components/PDFViewerClient';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { formatFileSize, getDocumentSignedUrl } from '../../lib/supabase';
import type { Document } from '../../types';

export const Route = createFileRoute('/_authenticated/documents')({
  component: DocumentsPage,
});

function DocumentsPage() {
  const { profile } = useAuth();
  const { data: documents, isLoading } = useDocuments();
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleUpload = (file: File) => {
    if (profile) {
      uploadMutation.mutate({ file, ownerId: profile.id });
    }
  };

  const columns: Column<Document & Record<string, unknown>>[] = [
    { key: 'name', header: 'Nome', render: (row) => (
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{row.name}</span>
      </div>
    )},
    { key: 'file_size', header: 'Tamanho', render: (row) => formatFileSize(row.file_size as number) },
    { key: 'page_count', header: 'Páginas', render: (row) => (row.page_count as number) || '—' },
    { key: 'created_at', header: 'Data Upload', render: (row) =>
      format(new Date(row.created_at as string), 'dd/MM/yyyy', { locale: ptBR })
    },
    { key: 'actions', header: 'Ações', render: (row) => (
      <div className="flex gap-2">
        <Button
          aria-label="Visualizar documento"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            const doc = row as unknown as Document;
            setPreviewDoc(doc);
            getDocumentSignedUrl(doc.file_path).then(setPreviewUrl);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button aria-label="Excluir documento" variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: row.id as string, filePath: row.file_path as string })}
              >
                {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <FileUploadZone onFileSelect={handleUpload} />

      {!isLoading && !documents?.length ? (
        <EmptyState
          icon={FileUp}
          title="Nenhum documento ainda"
          description="Suba seu primeiro PDF para começar a criar envelopes de assinatura."
          tip="Aceitamos PDFs de até 10MB. Você pode arrastar arquivos direto na área acima."
        />
      ) : (
        <DataTable
          columns={columns}
          data={(documents as unknown as (Document & Record<string, unknown>)[]) ?? []}
          isLoading={isLoading}
          searchable
        />
      )}

      <Dialog open={!!previewDoc} onOpenChange={() => { setPreviewDoc(null); setPreviewUrl(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{previewDoc?.name}</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <PDFViewer url={previewUrl} />
          ) : (
            <div className="flex h-96 items-center justify-center text-muted-foreground">Carregando PDF...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
