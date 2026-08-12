// Envelopes list — mirrors src/routes/_authenticated/envelopes/index.tsx

function EnvelopesList() {
  const [filter, setFilter] = React.useState('all');
  const [sel, setSel] = React.useState(new Set());
  const rows = [
    { id: 'e1', name: 'Contrato de prestação — Acme Ltda.', doc: 'contrato-acme.pdf', signers: 3, status: 'sent', date: '21/04/2026' },
    { id: 'e2', name: 'NDA — Fornecedor Beta', doc: 'nda-beta.pdf', signers: 2, status: 'in_progress', date: '20/04/2026' },
    { id: 'e3', name: 'Termo de adesão — Parceiro Gama', doc: 'termo-gama.pdf', signers: 1, status: 'completed', date: '19/04/2026' },
    { id: 'e4', name: 'Aditivo contratual — Delta Corp', doc: 'aditivo-delta.pdf', signers: 4, status: 'draft', date: '18/04/2026' },
    { id: 'e5', name: 'Contrato social — Epsilon', doc: 'social-epsilon.pdf', signers: 2, status: 'expired', date: '14/04/2026' },
    { id: 'e6', name: 'MSA — Zeta Technologies', doc: 'msa-zeta.pdf', signers: 3, status: 'cancelled', date: '12/04/2026' },
  ];
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const all = rows.length > 0 && rows.every(r => sel.has(r.id));
  const toggleAll = () => setSel(all ? new Set() : new Set(rows.map(r => r.id)));
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="vi-select vi-select--light">
          <span>{filter === 'all' ? 'Todos' : filter}</span>
          <Icon name="chevron-down" size={14} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline"><Icon name="download" size={14} />Exportar CSV</Button>
          <Button variant="accent"><Icon name="plus" size={14} />Novo Envelope</Button>
        </div>
      </div>

      {sel.size > 0 && (
        <div className="vi-select-bar">
          <span className="body-sm" style={{ fontWeight: 500 }}>{sel.size} envelope(s) selecionado(s)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="destructive" size="sm"><Icon name="x-circle" size={14} />Cancelar selecionados</Button>
            <Button variant="outline" size="sm"><Icon name="send" size={14} />Reenviar lembretes</Button>
            <Button variant="ghost" size="sm" onClick={() => setSel(new Set())}>Limpar seleção</Button>
          </div>
        </div>
      )}

      <div className="vi-table">
        <div className="vi-table__head">
          <span className={cn('vi-check', all && 'checked')} onClick={toggleAll}>{all && <Icon name="check" size={12} />}</span>
          <span>Nome</span>
          <span>Documento</span>
          <span>Signatários</span>
          <span>Status</span>
          <span>Criado em</span>
        </div>
        {rows.map(r => (
          <div key={r.id} className={cn('vi-table__row', sel.has(r.id) && 'selected')} onClick={() => toggle(r.id)}>
            <span className={cn('vi-check', sel.has(r.id) && 'checked')} onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>
              {sel.has(r.id) && <Icon name="check" size={12} />}
            </span>
            <span style={{ fontWeight: 500 }}>{r.name}</span>
            <span className="muted">{r.doc}</span>
            <span className="muted">{r.signers} signatário(s)</span>
            <span><StatusBadge status={r.status} /></span>
            <span className="muted">{r.date}</span>
          </div>
        ))}
      </div>
    </>
  );
}
window.EnvelopesList = EnvelopesList;
