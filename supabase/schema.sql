-- ==============================================================================
-- Schema SQL Completo - Treinador de IAs de Vendas para WhatsApp
-- Execute este script no SQL Editor do seu projeto Supabase.
-- ==============================================================================

-- 1. Extensões
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Enums
DO $$ BEGIN
  CREATE TYPE analysis_status AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE export_status AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE export_type AS ENUM (
    'system_prompt',
    'playbook',
    'fewshot',
    'rag',
    'finetune_openai',
    'finetune_gemini'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_stage AS ENUM (
    'abertura',
    'qualificacao',
    'valor',
    'objecao',
    'fechamento'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Tabelas Principais

-- Vendedores
CREATE TABLE IF NOT EXISTS public.sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Instâncias WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name TEXT NOT NULL,
  evolution_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  qr_code_url TEXT,
  last_error TEXT,
  last_sync_at TIMESTAMPTZ,
  seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
  webhook_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Segredos WhatsApp (Token Evolution)
CREATE TABLE IF NOT EXISTS public.whatsapp_secrets (
  instance_id UUID PRIMARY KEY REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  evolution_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfis de Usuário
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Papéis / Permissões (RBAC)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Convites
CREATE TABLE IF NOT EXISTS public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversas
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'whatsapp',
  lead_phone TEXT NOT NULL,
  lead_name_anon TEXT,
  seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
  external_chat_id TEXT,
  message_count INT NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'unknown',
  outcome_value NUMERIC,
  outcome_at TIMESTAMPTZ,
  outcome_source TEXT NOT NULL DEFAULT 'manual',
  outcome_auto_tagged BOOLEAN NOT NULL DEFAULT false,
  outcome_by TEXT,
  first_msg_at TIMESTAMPTZ,
  last_msg_at TIMESTAMPTZ,
  first_response_minutes NUMERIC,
  avg_response_minutes NUMERIC,
  audio_pct NUMERIC,
  quality_score NUMERIC,
  quality_model TEXT,
  quality_provider TEXT,
  quality_evaluated_at TIMESTAMPTZ,
  quality_breakdown JSONB,
  vocabulary JSONB,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  auto_marked BOOLEAN NOT NULL DEFAULT false,
  ignored_reason TEXT,
  pipedrive_deal_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mensagens
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text',
  text TEXT,
  audio_url TEXT,
  audio_transcript TEXT,
  ts TIMESTAMPTZ NOT NULL,
  external_msg_id TEXT,
  stage message_stage,
  stage_confidence NUMERIC,
  stage_manual BOOLEAN NOT NULL DEFAULT false,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Objeções
CREATE TABLE IF NOT EXISTS public.objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  lead_excerpt TEXT,
  seller_response TEXT,
  lead_msg_id UUID,
  seller_msg_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snapshots de DNA de Vendas
CREATE TABLE IF NOT EXISTS public.dna_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_conversations_analyzed INT NOT NULL DEFAULT 0,
  top_performer_seller_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Objeções identificadas no DNA
CREATE TABLE IF NOT EXISTS public.dna_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.dna_snapshots(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  occurrences INT NOT NULL DEFAULT 0,
  sample_size INT NOT NULL DEFAULT 0,
  seller_response TEXT NOT NULL,
  win_rate NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Anti-padrões identificados no DNA
CREATE TABLE IF NOT EXISTS public.dna_antipatterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.dna_snapshots(id) ON DELETE CASCADE,
  ngram TEXT NOT NULL,
  won_frequency NUMERIC NOT NULL DEFAULT 0,
  lost_frequency NUMERIC NOT NULL DEFAULT 0,
  lift NUMERIC NOT NULL DEFAULT 0,
  sample_size INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scores de DNA por Vendedor
CREATE TABLE IF NOT EXISTS public.seller_dna_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.dna_snapshots(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 0,
  is_top_performer BOOLEAN NOT NULL DEFAULT false,
  win_rate NUMERIC,
  avg_first_response_minutes NUMERIC,
  lead_response_rate NUMERIC,
  total_conversations INT NOT NULL DEFAULT 0,
  stage_distribution JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snapshots de Playbook
CREATE TABLE IF NOT EXISTS public.playbook_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  winning_scripts JSONB NOT NULL DEFAULT '[]'::jsonb,
  losing_scripts JSONB NOT NULL DEFAULT '[]'::jsonb,
  voice_tone JSONB NOT NULL DEFAULT '{}'::jsonb,
  vocabulary JSONB NOT NULL DEFAULT '{}'::jsonb,
  training_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  conversations_analyzed INT NOT NULL DEFAULT 0,
  good_samples INT NOT NULL DEFAULT 0,
  bad_samples INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  generated_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versões de Prompt
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  dna_snapshot_id UUID NOT NULL REFERENCES public.dna_snapshots(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Playbooks gerados
CREATE TABLE IF NOT EXISTS public.playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dna_snapshot_id UUID NOT NULL REFERENCES public.dna_snapshots(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  file_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configurações Globais da Aplicação (Singleton id = true)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  company_name TEXT,
  logo_url TEXT,
  business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  enable_llm_anonymization BOOLEAN NOT NULL DEFAULT true,
  has_openai_byok BOOLEAN NOT NULL DEFAULT false,
  llm_cost_cap_usd_day NUMERIC NOT NULL DEFAULT 10,
  coach_alert_threshold NUMERIC NOT NULL DEFAULT 50,
  current_playbook_snapshot_id UUID REFERENCES public.playbook_snapshots(id) ON DELETE SET NULL,
  published_prompt_version_id UUID REFERENCES public.prompt_versions(id) ON DELETE SET NULL,
  current_dna_snapshot_id UUID,
  last_dna_snapshot_at TIMESTAMPTZ,
  tagged_since_snapshot INT NOT NULL DEFAULT 0,
  demo_seeded BOOLEAN NOT NULL DEFAULT false,
  dna_individual_mode BOOLEAN NOT NULL DEFAULT false,
  dna_use_quality_score BOOLEAN NOT NULL DEFAULT true,
  dna_min_won INT NOT NULL DEFAULT 3,
  dna_min_lost INT NOT NULL DEFAULT 3,
  dna_min_sellers INT NOT NULL DEFAULT 2,
  dna_quality_min_good NUMERIC NOT NULL DEFAULT 75,
  dna_quality_max_bad NUMERIC NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Segredos Globais (OpenAI Key / Cron Secret - Singleton id = true)
CREATE TABLE IF NOT EXISTS public.app_secrets (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  openai_api_key TEXT,
  cron_secret TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserir linha singleton padrão em app_settings e app_secrets
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.app_secrets (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Filas de Jobs em Background
CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  status analysis_status NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  error_text TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transcribe_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  error_text TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quality_score_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  error_text TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL,
  type TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  chats_found INT NOT NULL DEFAULT 0,
  chats_imported INT NOT NULL DEFAULT 0,
  messages_imported INT NOT NULL DEFAULT 0,
  audios_queued INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_text TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type export_type NOT NULL,
  status export_status NOT NULL DEFAULT 'pending',
  dna_snapshot_id UUID NOT NULL REFERENCES public.dna_snapshots(id) ON DELETE CASCADE,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_url TEXT,
  error_text TEXT,
  created_by UUID,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Avaliações do Coach
CREATE TABLE IF NOT EXISTS public.coach_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  message_id UUID NOT NULL,
  dna_snapshot_id UUID,
  score NUMERIC NOT NULL,
  suggestion TEXT,
  adherence_breakdown JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notificações
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience TEXT NOT NULL DEFAULT 'all',
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consumo / Custos de LLM
CREATE TABLE IF NOT EXISTS public.llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'chat',
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conexão Pipedrive
CREATE TABLE IF NOT EXISTS public.pipedrive_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT,
  api_domain TEXT,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  scopes TEXT[],
  token_expires_at TIMESTAMPTZ,
  connected_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Funções RPC do Supabase

-- Travar e reivindicar batch de jobs pendentes (claim_pending_jobs)
CREATE OR REPLACE FUNCTION public.claim_pending_jobs(
  _batch_size INT,
  _table TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _ids TEXT[];
BEGIN
  EXECUTE format(
    'WITH pending AS (
       SELECT id FROM %I
       WHERE status = ''pending'' AND (locked_at IS NULL OR locked_at < now() - interval ''5 minutes'')
       ORDER BY created_at ASC
       LIMIT %L
       FOR UPDATE SKIP LOCKED
     ),
     updated AS (
       UPDATE %I j
       SET status = ''running'', locked_at = now(), started_at = coalesce(started_at, now()), attempt_count = attempt_count + 1
       FROM pending
       WHERE j.id = pending.id
       RETURNING j.id::text
     )
     SELECT coalesce(array_agg(id), ARRAY[]::TEXT[]) FROM updated',
    _table, _batch_size, _table
  ) INTO _ids;

  RETURN coalesce(_ids, ARRAY[]::TEXT[]);
END;
$$;

-- Verifica se há algum usuário no sistema
CREATE OR REPLACE FUNCTION public.has_any_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users);
$$;

-- Conta administradores
CREATE OR REPLACE FUNCTION public.count_admins()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT count(*)::INT FROM public.user_roles WHERE role = 'admin';
$$;

-- Verifica se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin(_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin'
  );
$$;

-- Verifica se telefone pertence a um vendedor
CREATE OR REPLACE FUNCTION public.is_seller_phone(_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sellers WHERE phone = _phone AND active = true
  );
$$;

-- Aceitar convite
CREATE OR REPLACE FUNCTION public.accept_invite(_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _inv RECORD;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  SELECT * INTO _inv FROM public.invites
  WHERE token = _token AND accepted_at IS NULL AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido ou expirado.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, _inv.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.invites
  SET accepted_at = now(), accepted_by = _uid
  WHERE id = _inv.id;
END;
$$;

-- 5. Triggers de Auth: Criar Perfil e Primeiro Admin

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_first BOOLEAN;
BEGIN
  -- Criar perfil público com fallback seguro
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Se for o primeiro usuário cadastrado, torna-se admin automaticamente
  SELECT count(*) = 0 INTO _is_first FROM public.user_roles;
  IF _is_first THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Garante que falhas no perfil nunca travem o salvamento de um novo usuário no auth.users
  RAISE WARNING 'handle_new_user warning: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Row Level Security (RLS)
-- Como a aplicação utiliza SSR e admin client para a maioria das operações,
-- habilitamos RLS com políticas seguras para leitura/escrita autenticada:

ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dna_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso autenticado básico
CREATE POLICY "Permitir leitura autenticada em sellers" ON public.sellers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escrita autenticada em sellers" ON public.sellers FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir leitura autenticada em conversas" ON public.conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escrita autenticada em conversas" ON public.conversations FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir leitura autenticada em mensagens" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escrita autenticada em mensagens" ON public.messages FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir leitura autenticada em perfis" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir atualizar proprio perfil" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Permitir insercao em perfis" ON public.profiles FOR INSERT TO authenticated, anon, service_role WITH CHECK (true);

CREATE POLICY "Permitir leitura em app_settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir update em app_settings" ON public.app_settings FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir leitura autenticada em user_roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir insercao em user_roles" ON public.user_roles FOR INSERT TO authenticated, anon, service_role WITH CHECK (true);

CREATE POLICY "Permitir leitura autenticada em invites" ON public.invites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escrita autenticada em invites" ON public.invites FOR ALL TO authenticated USING (true);

ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura autenticada em playbooks" ON public.playbooks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escrita autenticada em playbooks" ON public.playbooks FOR ALL TO authenticated USING (true);

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura autenticada em export_jobs" ON public.export_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escrita autenticada em export_jobs" ON public.export_jobs FOR ALL TO authenticated USING (true);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura autenticada em prompt_versions" ON public.prompt_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir escrita autenticada em prompt_versions" ON public.prompt_versions FOR ALL TO authenticated USING (true);



