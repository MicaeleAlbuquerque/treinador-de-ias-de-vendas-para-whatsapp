// Login card — 3-tab auth, mirrors src/routes/login.tsx + LoginSignupForm.tsx

function Login({ onSuccess }) {
  const [mode, setMode] = React.useState('signin');
  const submit = (e) => { e.preventDefault(); onSuccess(); };
  return (
    <div className="vi-login">
      <div className="vi-login__card">
        <div className="vi-login__brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="pen-tool" size={28} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Assina.ai</span>
          </div>
        </div>
        <div className="vi-login__tabs">
          <button className={cn('vi-login__tab', mode === 'signin' && 'active')} onClick={() => setMode('signin')}>Entrar</button>
          <button className={cn('vi-login__tab', mode === 'signup' && 'active')} onClick={() => setMode('signup')}>Criar conta</button>
          <button className={cn('vi-login__tab', mode === 'forgot' && 'active')} onClick={() => setMode('forgot')}>Recuperar</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <div className="vi-field">
              <label className="vi-label">Nome completo</label>
              <input className="vi-input" placeholder="Rafael Milagre" defaultValue="Rafael Milagre" />
            </div>
          )}
          <div className="vi-field">
            <label className="vi-label">Email</label>
            <input className="vi-input" type="email" placeholder="voce@empresa.com" defaultValue="rafael@viverdeia.ai" />
          </div>
          {mode !== 'forgot' && (
            <div className="vi-field">
              <label className="vi-label">Senha</label>
              <input className="vi-input" type="password" defaultValue="••••••••••" />
            </div>
          )}
          <Button variant="accent" className="vi-btn--md" style={{ width: '100%', marginTop: 8 }} type="submit">
            {mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de recuperação'}
          </Button>
        </form>
        <p className="caption muted" style={{ textAlign: 'center', marginTop: 18 }}>
          Ao continuar, você concorda com os Termos e a Política de Privacidade.
        </p>
      </div>
    </div>
  );
}
window.Login = Login;
