// Viver de IA — marketing page sections (single file to save tokens)

const { useEffect, useRef } = React;

function Icon({ name, size = 16, strokeWidth = 2, style }) {
  const ref = useRef(null);
  useEffect(() => { if (window.lucide) window.lucide.createIcons(); }, [name]);
  return <i ref={ref} data-lucide={name} style={{ width: size, height: size, display: 'inline-flex', ...style }} />;
}

function Btn({ variant = 'accent', size = 'md', children, ...p }) {
  const cls = ['vi-btn', `vi-btn--${variant}`, `vi-btn--${size}`].join(' ');
  return <button className={cls} {...p}>{children}</button>;
}

function Nav() {
  return (
    <nav className="vm-nav">
      <div className="vm-container vm-nav__inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="../../assets/viverdeia-lockup-black.svg" alt="Viver de IA" style={{ height: 26, width: 'auto', display: 'block' }} />
        </div>
        <div className="vm-nav__links">
          <a href="#features">Soluções</a>
          <a href="#pricing">Planos</a>
          <a href="#testimonials">Clientes</a>
          <a href="#">Recursos</a>
        </div>
        <div className="vm-nav__cta">
          <Btn variant="ghost" size="sm">Entrar</Btn>
          <Btn variant="accent" size="sm">Começar grátis</Btn>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="vm-hero">
      <div className="vm-hero__bg" />
      <div className="vm-container vm-hero__grid">
        <div>
          <span className="vm-eyebrow"><Icon name="sparkles" size={14} />Soluções de IA para o seu negócio</span>
          <h1 className="vm-h1">Acelere seu negócio com <em>Inteligência Artificial</em> sob medida</h1>
          <p className="vm-lead">
            Automatize processos, gere conteúdo e escale operações com agentes e fluxos de IA construídos para a sua empresa. Sem código, com resultado.
          </p>
          <div className="vm-hero__cta">
            <Btn variant="accent" size="lg">Começar agora <Icon name="arrow-right" size={16} /></Btn>
            <Btn variant="outline" size="lg"><Icon name="play-circle" size={16} />Ver demonstração</Btn>
          </div>
          <div className="vm-hero__meta">
            <span><Icon name="check" size={14} />Grátis por 14 dias</span>
            <span><Icon name="check" size={14} />Sem cartão de crédito</span>
            <span><Icon name="check" size={14} />Suporte em pt-BR</span>
          </div>
        </div>
        <div className="vm-hero-visual">
          <div className="vm-hero-visual__bar"><span /><span /><span /></div>
          <div className="vm-hero-visual__row">
            <span className="vm-hero-visual__dot"></span>
            <div style={{ flex: 1 }}><b>Agente de atendimento</b><small>12 conversas resolvidas · 2.3s médio</small></div>
            <Icon name="check-circle" size={18} style={{ color: 'var(--accent-success)' }} />
          </div>
          <div className="vm-hero-visual__row">
            <span className="vm-hero-visual__pulse"></span>
            <div style={{ flex: 1 }}><b>Pipeline de leads</b><small>Qualificando 38 contatos…</small></div>
            <Icon name="loader" size={18} style={{ color: 'var(--accent-warm)' }} />
          </div>
          <div className="vm-hero-visual__row">
            <span className="vm-hero-visual__dot"></span>
            <div style={{ flex: 1 }}><b>Gerador de propostas</b><small>7 documentos criados hoje</small></div>
            <Icon name="file-text" size={18} style={{ color: 'var(--accent-primary-light)' }} />
          </div>
          <div className="vm-hero-visual__row" style={{ marginBottom: 0, background: 'oklch(0.14 0.04 248)' }}>
            <Icon name="bar-chart-3" size={18} style={{ color: 'var(--accent-primary-light)' }} />
            <div style={{ flex: 1 }}><b>+34% de produtividade</b><small>últimos 30 dias</small></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section className="vm-proof">
      <div className="vm-container">
        <p className="vm-proof__label">Mais de 300 empresas brasileiras já crescem com Viver de IA</p>
        <div className="vm-proof__logos">
          <span>Norte.co</span><span>Lumen/Ar</span><span>Brava Foods</span><span>Contábil+</span><span>Oficina 21</span><span>Porto Ágil</span>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { icon: 'bot', h: 'Agentes de IA', p: 'Construa agentes que atendem, vendem e operam dentro dos seus sistemas.' },
    { icon: 'workflow', h: 'Automações sem código', p: 'Conecte WhatsApp, CRM, planilhas e ERPs em fluxos visuais.' },
    { icon: 'file-text', h: 'Geração de conteúdo', p: 'Propostas, posts e scripts de vendas com a voz da sua marca.' },
    { icon: 'bar-chart-3', h: 'Analytics operacional', p: 'Métricas claras por agente, fluxo e canal em tempo real.' },
    { icon: 'shield-check', h: 'Segurança empresarial', p: 'Dados em repouso criptografados, LGPD-ready, logs completos.' },
    { icon: 'graduation-cap', h: 'Academia Viver de IA', p: 'Trilhas guiadas para times dominarem IA aplicada em semanas.' },
  ];
  return (
    <section className="vm-section" id="features">
      <div className="vm-container">
        <div className="vm-section__head">
          <span className="vm-eyebrow">Plataforma</span>
          <h2>Tudo que você precisa para operar com IA</h2>
          <p>Uma plataforma integrada para projetar, lançar e escalar soluções de IA no seu negócio.</p>
        </div>
        <div className="vm-features">
          {items.map(f => (
            <div className="vm-feature" key={f.h}>
              <div className="vm-feature__icon"><Icon name={f.icon} size={20} /></div>
              <h3>{f.h}</h3>
              <p>{f.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const qs = [
    { q: 'Em 6 semanas reduzimos o tempo de resposta no SAC em 70%. O time finalmente foca no que importa.', who: 'Marina Castro', role: 'COO · Brava Foods', c: '#6366F1' },
    { q: 'A trilha da Academia mudou como o meu time pensa. Hoje todo projeto começa com IA no escopo.', who: 'Rafael Pires', role: 'CTO · Norte.co', c: '#10B981' },
    { q: 'Passamos a emitir propostas em minutos. Fechamos 3x mais com metade do esforço comercial.', who: 'Juliana Amaral', role: 'Head de Vendas · Porto Ágil', c: '#F59E0B' },
  ];
  return (
    <section className="vm-section vm-tests" id="testimonials">
      <div className="vm-container">
        <div className="vm-section__head">
          <span className="vm-eyebrow">Clientes</span>
          <h2>Resultados reais, medidos em semanas</h2>
          <p>Equipes de marketing, vendas e operações usam Viver de IA para destravar produtividade.</p>
        </div>
        <div className="vm-tests__grid">
          {qs.map(t => (
            <figure className="vm-test" key={t.who}>
              <blockquote className="vm-test__quote">"{t.q}"</blockquote>
              <figcaption className="vm-test__who">
                <span style={{ width: 40, height: 40, borderRadius: 999, background: t.c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                  {t.who.split(' ').map(n => n[0]).slice(0,2).join('')}
                </span>
                <div><b>{t.who}</b><span>{t.role}</span></div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    { h: 'Starter', p: 'Para times começando com IA.', price: '149', feats: ['1 agente de IA', '1.000 execuções/mês', 'Integrações essenciais', 'Suporte por email'] },
    { h: 'Growth', p: 'Para empresas escalando operações.', price: '499', highlight: true, feats: ['5 agentes de IA', '10.000 execuções/mês', 'Todas as integrações', 'Academia incluída', 'Suporte prioritário'] },
    { h: 'Enterprise', p: 'Para operações críticas.', price: 'Sob medida', feats: ['Agentes ilimitados', 'SLA 99,9%', 'SSO + auditoria', 'Onboarding dedicado', 'Gerente de sucesso'] },
  ];
  return (
    <section className="vm-section" id="pricing" style={{ background: 'var(--bg-surface-1)' }}>
      <div className="vm-container">
        <div className="vm-section__head">
          <span className="vm-eyebrow">Planos</span>
          <h2>Preços simples, escala sem surpresas</h2>
          <p>Comece grátis, evolua à medida que seus fluxos de IA provam valor.</p>
        </div>
        <div className="vm-pricing">
          {plans.map(p => (
            <div className={'vm-plan' + (p.highlight ? ' vm-plan--highlight' : '')} key={p.h}>
              <h3>{p.h}</h3>
              <p className="vm-plan__desc">{p.p}</p>
              <div className="vm-plan__price"><b>{p.price === 'Sob medida' ? p.price : 'R$ ' + p.price}</b>{p.price !== 'Sob medida' && <span>/mês</span>}</div>
              <ul>
                {p.feats.map(f => <li key={f}><Icon name="check" size={16} />{f}</li>)}
              </ul>
              <Btn variant={p.highlight ? 'accent' : 'outline'} size="md" style={{ width: '100%' }}>
                {p.price === 'Sob medida' ? 'Falar com vendas' : 'Começar com ' + p.h}
              </Btn>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="vm-cta">
      <div className="vm-cta__box">
        <h2>Pronto para viver de IA?</h2>
        <p>Crie sua conta gratuita e lance seu primeiro agente em menos de 10 minutos.</p>
        <div className="vm-cta__btns">
          <Btn variant="accent" size="lg">Começar grátis</Btn>
          <Btn variant="ghost-clean" size="lg">Agendar demonstração</Btn>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { h: 'Plataforma', links: ['Agentes', 'Automações', 'Analytics', 'Integrações'] },
    { h: 'Empresa', links: ['Sobre', 'Clientes', 'Carreiras', 'Contato'] },
    { h: 'Recursos', links: ['Blog', 'Academia', 'Documentação', 'Status'] },
  ];
  return (
    <footer className="vm-foot">
      <div className="vm-container">
        <div className="vm-foot__grid">
          <div>
            <img src="../../assets/viverdeia-lockup-black.svg" alt="Viver de IA" style={{ height: 26, width: 'auto', display: 'block', marginBottom: 12 }} />
            <p className="body-sm muted" style={{ maxWidth: 32 + 'ch', margin: 0 }}>A plataforma brasileira para operar com IA — de ponta a ponta.</p>
          </div>
          {cols.map(c => (
            <div className="vm-foot__col" key={c.h}>
              <h4>{c.h}</h4>
              {c.links.map(l => <a href="#" key={l}>{l}</a>)}
            </div>
          ))}
        </div>
        <div className="vm-foot__bot">
          <span>© 2026 Viver de IA · Todos os direitos reservados</span>
          <span>Feito no Brasil com IA aplicada</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { VmNav: Nav, VmHero: Hero, VmProof: Proof, VmFeatures: Features, VmTestimonials: Testimonials, VmPricing: Pricing, VmCta: CTA, VmFooter: Footer });
