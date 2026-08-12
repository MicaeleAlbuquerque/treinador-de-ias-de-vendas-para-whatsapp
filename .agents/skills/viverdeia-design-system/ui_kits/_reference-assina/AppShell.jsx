// App shell: Sidebar + Header + content

function Sidebar({ current, onNavigate, onSignOut }) {
  const items = [
    { id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'documents', icon: 'file-text', label: 'Documentos' },
    { id: 'templates', icon: 'layers', label: 'Templates' },
    { id: 'envelopes', icon: 'mail', label: 'Envelopes' },
    { id: 'users', icon: 'users', label: 'Usuários' },
    { id: 'settings', icon: 'settings', label: 'Configurações' },
    { id: 'reminders', icon: 'clock', label: 'Régua de Lembretes' },
  ];
  return (
    <aside className="vi-sidebar">
      <div className="vi-sidebar__brand"><Icon name="pen-tool" size={22} /><b>Assina.ai</b></div>
      <nav className="vi-sidebar__nav">
        {items.map(i => (
          <button key={i.id} className={cn('vi-sidebar__item', current === i.id && 'active')} onClick={() => onNavigate(i.id)}>
            <Icon name={i.icon} size={18} />{i.label}
          </button>
        ))}
      </nav>
      <div className="vi-sidebar__foot">
        <button className="vi-sidebar__item" onClick={() => onNavigate('profile')}><Icon name="user" size={18} />Perfil</button>
        <button className="vi-sidebar__item" onClick={onSignOut}><Icon name="log-out" size={18} />Sair</button>
      </div>
    </aside>
  );
}

function AppHeader({ title, user }) {
  return (
    <header className="vi-header">
      <h1>{title}</h1>
      <div className="vi-header__actions">
        <button className="vi-btn vi-btn--ghost vi-btn--icon" aria-label="Notificações" style={{ position: 'relative' }}>
          <Icon name="bell" size={18} />
          <span style={{ position: 'absolute', top: 2, right: 2, background: 'var(--accent-primary)', color: '#fff', borderRadius: 999, minWidth: 16, height: 16, fontSize: 10, fontWeight: 700, padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
        </button>
        <span className="body-sm muted">{user.name}</span>
        <span className="vi-badge vi-badge--blue">{user.role}</span>
      </div>
    </header>
  );
}

function AppShell({ current, onNavigate, onSignOut, title, user, children }) {
  return (
    <div className="vi-shell">
      <Sidebar current={current} onNavigate={onNavigate} onSignOut={onSignOut} />
      <div className="vi-main">
        <AppHeader title={title} user={user} />
        <div className="vi-content">{children}</div>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, AppHeader, AppShell });
