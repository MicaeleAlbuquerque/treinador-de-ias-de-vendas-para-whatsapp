// Marketing landing page — mirrors src/routes/index.tsx

function Landing({ onLogin }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-elevated)' }}>
      <header className="vi-lp-nav">
        <div className="vi-lp-brand">
          <Icon name="pen-tool" size={26} />
          <b>Assina.ai</b>
        </div>
        <Button variant="outline" onClick={onLogin}>Entrar</Button>
      </header>
      <section className="vi-lp-hero">
        <h1>Assine contratos digitalmente</h1>
        <p>Envie, assine e gerencie contratos de forma segura e rápida.</p>
        <div style={{ marginTop: 32 }}>
          <Button variant="accent" size="lg" onClick={onLogin}>Começar agora</Button>
        </div>
      </section>
      <section className="vi-lp-features">
        <div className="vi-lp-features__grid">
          {[
            { icon: 'upload', title: 'Envio fácil', desc: 'Faça upload do PDF e defina os signatários em minutos.' },
            { icon: 'shield', title: 'Assinatura segura', desc: 'Assinatura digital com trilha de auditoria completa.' },
            { icon: 'bar-chart-3', title: 'Acompanhamento', desc: 'Dashboard em tempo real com status de cada documento.' },
          ].map(f => (
            <div className="vi-lp-feature" key={f.title}>
              <div className="vi-lp-feature__icon"><Icon name={f.icon} size={22} /></div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="vi-lp-foot">© 2026 Assina.ai — Plataforma de assinatura digital</footer>
    </div>
  );
}

window.Landing = Landing;
