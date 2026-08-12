# Notas Frontend — Assina.ai

## 1. O que foi entregue

### Auth
- `src/routes/login.tsx` — Login + Signup + Forgot Password (3 modos no mesmo Card)
- `src/routes/reset-password.tsx` — Rota publica para redefinir senha (captura PASSWORD_RECOVERY do Supabase)
- `src/contexts/AuthContext.tsx` — Provider com signIn, signUp, signOut, fetchProfile

### Dashboard
- `src/routes/_authenticated/dashboard.tsx` — 4 KPI cards (StatCard) + tabela de envelopes recentes

### Documents
- `src/routes/_authenticated/documents.tsx` — Upload de PDF, listagem, preview (PDFViewer), delete

### Envelopes
- `src/routes/_authenticated/envelopes/index.tsx` — Lista com filtros por status
- `src/routes/_authenticated/envelopes/new.tsx` — Wizard de 5 steps (StepWizard) para criar envelope
- `src/routes/_authenticated/envelopes/$id/index.tsx` — Detalhe do envelope + signatarios + audit trail (AuditTimeline)
- `src/routes/_authenticated/envelopes/$id/prepare.tsx` — Posicionamento de campos de assinatura no PDF

### Signing publico
- `src/routes/sign/$token.tsx` — Assinatura publica via canvas (SignatureCanvas) + digitada (SignatureTyped) + opcao de recusar

### Templates
- `src/routes/_authenticated/templates/index.tsx` — Lista + criar template
- `src/routes/_authenticated/templates/$id.tsx` — Gerenciamento de variaveis do template

### Admin
- `src/routes/_authenticated/admin/users.tsx` — Lista de usuarios, troca de role

### Profile
- `src/routes/_authenticated/profile.tsx` — Editar nome e avatar

### Componentes reutilizaveis
- AppSidebar, AuditTimeline, DataTable, EmptyState, EnvelopeStatusBadge
- FileUploadZone, PDFViewer, SignatureCanvas, SignatureFieldOverlay
- SignatureTyped, SignerStatusBadge, StatCard, StepWizard

### Hooks
- useEnvelopes, useDocuments, useSigning, useTemplates, useAdmin

---

## 2. Problemas P0 (criticos)

- **useAdmin sem verificacao de role** — `useAllProfiles` e `useUpdateProfileRole` nao verificam se o usuario tem permissao. Qualquer usuario autenticado pode listar todos os perfis e alterar roles, efetivamente virando admin.

---

## 3. Correcoes P1 (importantes)

- **Botao Download PDF no envelope detail** — Existe no JSX mas sem onClick handler. Nao faz nada ao clicar.
- **Logica duplicada entre hooks e services** — Criar envelope, signing e complete existem tanto nos hooks quanto em services. Risco de divergencia.
- **Sem validacao de tipo/tamanho no upload** — Upload de PDF e upload de assinatura aceitam qualquer arquivo/tamanho.
- **Tipo Profile sem 'moderator'** — `src/types/index.ts` define role como `'admin' | 'user'` mas o sistema usa 'moderator' em outros lugares.
- **useSendReminder incompleto** — Insere registro de reminder no DB mas NAO chama Edge Function para enviar email de fato.

---

## 4. Correcoes P2 (melhorias)

- **Acentos faltando em TODO o portugues** — invalido, Nao, Faca, comecar, redefinicao, ja, etc. Todos os textos de UI precisam revisao de acentuacao.
- **Sem loading states em mutations** — Botoes de salvar, enviar, deletar nao mostram spinner durante a operacao.
- **Sem back navigation / breadcrumbs** — Envelope detail, template detail, prepare nao tem como voltar facilmente.
- **Sem validacao de dados** — Email duplicado de signatario aceito, data de expiracao no passado aceita, coordenadas de campo sem bounds checking.
- **Empty states genericos** — Nao diferenciam "nenhum resultado" de "nenhum com filtro X aplicado".
- **Sem aria-labels** — Botoes de icone (Eye, Trash, Copy, Bell) nao tem labels de acessibilidade.
- **Dashboard faz 4 queries separadas** — Poderia consolidar em 1 query com aggregation.
- **Sem landing page** — Index (`/`) faz redirect direto para `/dashboard`. Nao ha pagina de apresentacao do produto.

---

## 5. Decisoes tecnicas

| Tecnologia | Uso |
|---|---|
| TanStack Router | File-based routing com `_authenticated` layout |
| shadcn/ui + Tailwind CSS | Componentes UI (pasta `src/components/ui/` e read-only) |
| TanStack Query (React Query) | Data fetching, cache, mutations |
| react-hook-form + Zod | Validacao de formularios com zodResolver |
| date-fns + locale ptBR | Formatacao de datas em portugues |
| pdfjs-dist | Renderizacao de PDF no browser |
| Supabase Auth | Autenticacao com email/password |
| @supabase/supabase-js | Client tipado com `createClient<Database>` |

---

## 6. Licoes do Lovable (compatibilidade)

Estas regras devem ser seguidas em TODAS as futuras entregas para evitar quebras no ambiente Lovable:

1. **Cast readonly arrays** — `(item.roles as readonly string[]).includes(...)` em vez de `.includes()` direto
2. **Campos nullable explicitos** — Sempre incluir `value: null` em objetos que mapeiam tipos do DB
3. **Import do Supabase** — Sempre de `@/integrations/supabase/client`, nunca de `lib/supabase`
4. **Double-cast de tipos** — `as unknown as Profile` em vez de `as Profile` (Database Row != tipo manual)
5. **Enums com as const** — `.update({ status: 'cancelled' as const })` em mutations
6. **Inserts com as any** — `.insert(data as any)` quando tipo Insert diverge do nosso tipo
7. **Meta tags OG/Twitter** — Nao remover do `__root.tsx`
8. **vendor/h3-v2 shim** — Nunca remover pasta `vendor/h3-v2/`, alias no vite.config, nem entry no package.json
9. **signUp com metadata** — Passar fullName via `options.data` (nao fazer upsert manual na tabela profiles)
