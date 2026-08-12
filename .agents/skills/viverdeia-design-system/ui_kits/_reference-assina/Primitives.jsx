// Shared primitives — exported to window for sibling scripts.

const { useState, useEffect, useRef } = React;

// cn helper
window.cn = (...xs) => xs.filter(Boolean).join(' ');

// Icon wrapper using Lucide CDN
function Icon({ name, size = 16, strokeWidth = 2, className = '', style }) {
  const ref = useRef(null);
  useEffect(() => { if (window.lucide && ref.current) window.lucide.createIcons({ attrs: { 'stroke-width': strokeWidth }, nameAttr: 'data-lucide', icons: undefined }); }, [name, strokeWidth]);
  return <i ref={ref} data-lucide={name} className={className} style={{ width: size, height: size, display: 'inline-flex', ...style }} />;
}

// Button — matches shadcn button.tsx variants
function Button({ variant = 'accent', size = 'md', children, className = '', ...p }) {
  const base = 'vi-btn';
  const v = `vi-btn--${variant}`;
  const s = `vi-btn--${size}`;
  return <button className={cn(base, v, s, className)} {...p}>{children}</button>;
}

// Status badge — matches EnvelopeStatusBadge color system
function StatusBadge({ status }) {
  const map = {
    draft: { label: 'Rascunho', tone: 'gray' },
    sent: { label: 'Enviado', tone: 'blue' },
    in_progress: { label: 'Em Andamento', tone: 'yellow' },
    completed: { label: 'Concluído', tone: 'green' },
    cancelled: { label: 'Cancelado', tone: 'red' },
    expired: { label: 'Expirado', tone: 'orange' },
  };
  const c = map[status] ?? { label: status, tone: 'gray' };
  return <span className={cn('vi-badge', `vi-badge--${c.tone}`)}>{c.label}</span>;
}

// Avatar
function SignerAvatar({ name, index = 0, size = 'md' }) {
  const colors = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4'];
  const bg = colors[index % colors.length];
  const initials = name.trim().split(/\s+/).map(p => p[0]).slice(0,2).join('').toUpperCase();
  const sizes = { sm: 24, md: 32, lg: 40 };
  const fs = { sm: 10, md: 12, lg: 14 };
  return (
    <div style={{
      width: sizes[size], height: sizes[size], background: bg,
      borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: fs[size], boxShadow: 'var(--shadow-elevation-1)',
      flexShrink: 0,
    }}>{initials}</div>
  );
}

// StatCard
function StatCard({ title, value, icon, tone = 'accent', delta }) {
  const toneBg = tone === 'success' ? 'color-mix(in oklch, var(--accent-success) 12%, transparent)'
               : tone === 'warn' ? 'color-mix(in oklch, var(--accent-warm) 14%, transparent)'
               : tone === 'danger' ? 'color-mix(in oklch, oklch(0.577 0.245 27.325) 12%, transparent)'
               : 'color-mix(in oklch, var(--accent-primary) 10%, transparent)';
  const toneFg = tone === 'success' ? 'oklch(0.46 0.152 163)'
               : tone === 'warn' ? 'oklch(0.48 0.164 80)'
               : tone === 'danger' ? 'oklch(0.577 0.245 27.325)'
               : 'var(--accent-primary)';
  return (
    <div className="vi-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p className="caption" style={{ fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>{title}</p>
          <p className="kpi" style={{ margin: '4px 0 0' }}>{value}</p>
          {delta && <p className="caption" style={{ marginTop: 6, color: 'var(--text-tertiary)' }}>{delta}</p>}
        </div>
        <div style={{ background: toneBg, color: toneFg, borderRadius: 'var(--radius-md)', padding: 10, display: 'flex' }}>
          <Icon name={icon} size={22} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, Button, StatusBadge, SignerAvatar, StatCard });
