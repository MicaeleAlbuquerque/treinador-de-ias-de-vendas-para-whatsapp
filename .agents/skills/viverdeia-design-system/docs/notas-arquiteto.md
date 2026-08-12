# Notas do Arquiteto de Dados — Assina.AI

Data: 2026-04-13
Supabase Project ID: olxquhcifrohuoiaeagk
URL: https://olxquhcifrohuoiaeagk.supabase.co

---

## 1. O QUE FOI ENTREGUE

### Migration consolidada
- Arquivo: `supabase/migrations/20260413222202_*.sql`
- Gerada pelo Lovable ao conectar no Supabase

### 11 Tabelas
| Tabela | Descrição |
|---|---|
| profiles | Perfil do usuário (auto-criado via trigger no signup) |
| user_roles | Roles de autorização (app_role enum) |
| documents | Documentos uploadados |
| templates | Templates reutilizáveis |
| template_variables | Variáveis de preenchimento dos templates |
| envelopes | Envelopes de assinatura (agrupa documento + signatários) |
| signers | Signatários de cada envelope |
| signature_fields | Campos de assinatura posicionados no documento |
| signatures | Assinaturas efetivadas |
| audit_logs | Log de auditoria de ações |
| reminders | Lembretes enviados aos signatários |

### 6 Enums
- `envelope_status`: draft, sent, in_progress, completed, cancelled, expired
- `signer_status`: pending, sent, viewed, signed, declined
- `signature_field_type`: signature, initials, date, text, checkbox
- `signature_type`: draw, type, upload
- `audit_action`: created, sent, viewed, signed, declined, completed, cancelled, reminder_sent, downloaded
- `app_role`: admin, manager, user

### Triggers e Functions
- `handle_new_user()` — trigger AFTER INSERT em auth.users, auto-cria registro em profiles
- `has_role(role app_role)` — SECURITY DEFINER, consulta user_roles para RLS

### Storage Buckets
- `documents` — armazena PDFs e documentos uploadados
- `signatures` — armazena imagens de assinatura (draw/upload)

### RLS
- Ativada em todas as 11 tabelas
- Policies definidas por tabela

---

## 2. PROBLEMAS ENCONTRADOS NA AUDITORIA (P0 — CRÍTICO)

### 2.1 RLS com USING(true) — acesso total sem restrição
**Tabelas afetadas:** signers, signatures, signature_fields, audit_logs

Policies com `USING(true)` permitem que QUALQUER usuário autenticado leia/escreva em todos os registros. Isso significa:
- Qualquer usuário vê todos os signatários de todos os envelopes
- Qualquer usuário vê todas as assinaturas de todos
- Qualquer usuário lê todos os logs de auditoria
- Campos de assinatura expostos para todos

**Correção necessária:** Substituir `USING(true)` por policies que validem ownership via envelope → owner_id = auth.uid() ou signer.email = auth.jwt()->>'email'.

### 2.2 Storage bucket `signatures` sem restrição de pasta
O bucket existe mas não tem policies que restrinjam acesso por usuário/pasta. Qualquer autenticado pode ler/gravar qualquer arquivo.

**Correção necessária:** Policy de storage com path validation (ex: `auth.uid()::text = (storage.foldername(name))[1]`).

### 2.3 access_token em signers nunca validado
A tabela `signers` tem coluna `access_token` (UUID), mas nenhuma policy ou function usa esse token para validar acesso do signatário externo. O token existe no schema mas é inútil sem validação.

**Correção necessária:** Criar policy ou Edge Function que valide access_token para signatários não-autenticados (assinatura via link).

### 2.4 .env commitado no repositório
Arquivo .env com credenciais foi commitado no git. Risco de exposição de chaves.

**Correção necessária:** Remover do git history (`git filter-branch` ou `bfg`), adicionar ao `.gitignore`, rotacionar chaves expostas.

---

## 3. CORREÇÕES P1 — Performance e Funcionalidade

### 3.1 Indexes faltando
```sql
-- Queries frequentes sem index
CREATE INDEX idx_documents_owner ON documents(owner_id);
CREATE INDEX idx_templates_owner ON templates(owner_id);
CREATE INDEX idx_envelopes_owner ON envelopes(owner_id);
CREATE INDEX idx_envelopes_status ON envelopes(status);
CREATE INDEX idx_envelopes_expires ON envelopes(expires_at);
CREATE INDEX idx_signature_fields_envelope_signer ON signature_fields(envelope_id, signer_id);
CREATE INDEX idx_signers_envelope ON signers(envelope_id);
CREATE INDEX idx_audit_logs_envelope ON audit_logs(envelope_id);
```

### 3.2 Sem soft delete
Nenhuma tabela tem `deleted_at`. Deletes são permanentes. Para compliance e auditoria, envelopes e documentos deveriam ter soft delete.

### 3.3 Tipo Profile sem moderator
O campo `profiles.role` é TEXT livre. Se o app precisar de role "moderator", basta inserir — mas não há validação. Considerar CHECK constraint ou migrar para enum.

### 3.4 Sem state machine validation
Os enums de status (envelope_status, signer_status) não têm validação de transição. Nada impede um envelope ir de `draft` direto para `completed` pulando `sent` e `in_progress`. Precisaria de trigger ou check constraint para validar transições válidas.

---

## 4. DECISÕES TÉCNICAS

### Supabase
- Project ID: `olxquhcifrohuoiaeagk`
- HIBP/pwned check: precisa ser desativado no Dashboard (Authentication > Providers > Email > desmarcar "Leaked password protection") — não é configurável via SQL

### Schema Design
- **UUID como PK** em todas as tabelas
- **created_at / updated_at** em todas as tabelas
- **profiles.role** é TEXT, não enum — campo informativo para UI, autorização real via tabela `user_roles` + função `has_role()`
- **signing_order** é TEXT com CHECK constraint (`parallel` ou `sequential`), não enum
- **snake_case** em todas as tabelas e colunas

### Integração Lovable
- Lovable gerou `src/integrations/supabase/types.ts` automaticamente ao conectar no Supabase (~718 linhas)
- Client tipado: `createClient<Database>` em `client.ts` e `client.server.ts`
- Enums em inserts precisam de `as const` (ex: `status: 'draft' as const`)
- Casts de Row para tipo manual: usar `as unknown as T`
- Campos com DEFAULT no DB não devem ser setados no código (e vice-versa)

---

## 5. PRÓXIMOS PASSOS (por prioridade)

### P0 — Segurança (ANTES de ir para produção)
- [ ] Reescrever RLS policies de signers, signatures, signature_fields, audit_logs
- [ ] Adicionar storage policies no bucket signatures
- [ ] Implementar validação de access_token para assinatura via link
- [ ] Remover .env do git history e rotacionar chaves

### P1 — Performance
- [ ] Criar indexes listados na seção 3.1
- [ ] Adicionar soft delete (deleted_at) em envelopes, documents, signatures

### P2 — Robustez
- [ ] Implementar state machine para transições de status
- [ ] Adicionar CHECK constraint ou enum em profiles.role
- [ ] Criar Edge Function para envio de emails de lembrete
- [ ] Criar Edge Function para webhook do Stripe (se aplicável)
