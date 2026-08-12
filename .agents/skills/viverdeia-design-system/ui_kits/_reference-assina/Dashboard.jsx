// Dashboard view — mirrors src/routes/_authenticated/dashboard.tsx

function Dashboard({ onGo }) {
  const envs = [
    { id: 'e1', name: 'Contrato de prestação — Acme Ltda.', status: 'sent', date: '21/04/2026' },
    { id: 'e2', name: 'NDA — Fornecedor Beta', status: 'in_progress', date: '20/04/2026' },
    { id: 'e3', name: 'Termo de adesão — Parceiro Gama', status: 'completed', date: '19/04/2026' },
    { id: 'e4', name: 'Aditivo contratual — Delta Corp', status: 'draft', date: '18/04/2026' },
    { id: 'e5', name: 'Contrato social — Epsilon', status: 'expired', date: '14/04/2026' },
  ];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard title="Pendentes de Assinatura" value="24" icon="clock" delta="+3 esta semana" />
        <StatCard title="Assinados Hoje" value="7" icon="check-circle" tone="success" delta="+18% vs ontem" />
        <StatCard title="Em Andamento" value="12" icon="loader" tone="warn" />
        <StatCard title="Expirados" value="2" icon="alert-triangle" tone="danger" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <div className="vi-card">
          <p className="caption muted" style={{ margin: 0, fontWeight: 500 }}>Taxa de conclusão</p>
          <p className="kpi" style={{ margin: '4px 0' }}>86,3%</p>
          <span className="caption" style={{ color: 'oklch(0.46 0.152 163)', fontWeight: 600 }}>▲ +4,1 pp vs 30d anteriores</span>
        </div>
        <div className="vi-card">
          <p className="caption muted" style={{ margin: 0, fontWeight: 500 }}>Tempo médio de assinatura</p>
          <p className="kpi" style={{ margin: '4px 0' }}>4,2 h</p>
          <span className="caption muted">Baseado em 38 envelope(s) concluído(s)</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="vi-card">
          <h3 style={{ font: 'var(--text-h5)', margin: '0 0 14px' }}>Últimos Envelopes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {envs.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer' }}
                onClick={() => onGo('envelopes')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon name="mail" size={18} style={{ color: 'var(--text-tertiary)' }} />
                  <div>
                    <p style={{ font: 'var(--text-body-sm)', fontWeight: 500, margin: 0 }}>{e.name}</p>
                    <p className="caption muted" style={{ margin: 0 }}>{e.date}</p>
                  </div>
                </div>
                <StatusBadge status={e.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="vi-card">
          <h3 style={{ font: 'var(--text-h5)', margin: '0 0 14px' }}>Ações Rápidas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="accent" style={{ width: '100%' }} onClick={() => onGo('envelopes')}>
              <Icon name="plus" size={16} />Novo Envelope
            </Button>
            <Button variant="outline" style={{ width: '100%' }} onClick={() => onGo('envelopes')}>
              <Icon name="clock" size={16} />Ver Pendentes
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
window.Dashboard = Dashboard;
