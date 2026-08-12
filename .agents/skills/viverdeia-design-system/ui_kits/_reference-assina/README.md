# Assina.ai UI Kit — REFERÊNCIA VISUAL APENAS

> ⚠️ **Isto não é o Viver de IA.** O Assina.ai foi usado como **referência de padrões de produto SaaS** (app shell, tabela de dados, status badges, dashboard KPI). O Viver de IA é uma plataforma distinta — os mocks aqui são só inspiração.
>
> Quando for construir interfaces do Viver de IA, **parta de `ui_kits/viverdeia/`** (marketing) ou crie novas telas usando os tokens `--via-*` em `colors_and_type.css`. Copie padrões daqui (layout de sidebar, anatomia de tabela, estrutura de dashboard) mas **não** copie copy, logo, ou nome "Assina.ai".

---

Recreação estática dos padrões de produto do Assina.ai (TanStack Start + React 19 + shadcn/ui + Lucide) — mantida aqui só como material de referência.

**What's here**
- `index.html` — clickable prototype. Lands on the marketing landing page (same layout as `src/routes/index.tsx`); click **Entrar** to hit the login; sign in → dashboard → envelopes list.
- `AppShell.jsx` — sidebar + header layout
- `Sidebar.jsx` — dark navy nav with active state
- `AppHeader.jsx` — in-app top bar with notifications + role badge
- `Landing.jsx` — the sparse white landing page from `src/routes/index.tsx`
- `Login.jsx` — auth card with the 3-mode form
- `Dashboard.jsx` — KPI grid + quick actions + recent envelopes
- `EnvelopesList.jsx` — filter bar + bulk-action toolbar + data table
- `Buttons.jsx`, `Badges.jsx`, `StatCard.jsx`, `EmptyState.jsx`, `StepWizard.jsx` — shared primitives

**Sources**: `src/routes/index.tsx`, `src/routes/login.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/envelopes/index.tsx`, `src/components/AppSidebar.tsx`, `src/components/StatCard.tsx`, `src/components/EnvelopeStatusBadge.tsx`, `src/components/EmptyState.tsx`, `src/components/StepWizard.tsx`, `src/styles.css`.
