-- ============================================================
-- Mercadinho Belo - Controle
-- Migração: sistema de usuários, auditoria, configuração global
-- + catálogo por código de barras (litros/gramas)
-- Cole tudo no SQL Editor do Supabase e clique em RUN
-- ============================================================

-- 1) Tabela de funcionários / usuários ------------------------
CREATE TABLE IF NOT EXISTS funcionarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  login TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT 'funcionario' CHECK (cargo IN ('admin', 'funcionario', 'patrao')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Permitir tudo" ON funcionarios FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Auditoria nos lotes (quem adicionou / quem atualizou) ----
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS adicionado_por TEXT;
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS adicionado_por_id UUID;
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS atualizado_por TEXT;
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP WITH TIME ZONE;

-- 3) Campos de unidade (litros/gramas) e código de barras nos produtos --
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS codigo_barras TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS unidade TEXT;       -- 'litros' ou 'gramas'
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS valor NUMERIC;      -- quantidade da unidade (ex: 2 litros)
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS codigo_barras TEXT;

-- 4) Catálogo por código de barras (versão para auto-preenchimento) --
CREATE TABLE IF NOT EXISTS produtos_base (
  codigo_barras TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  unidade TEXT NOT NULL,        -- 'litros' ou 'gramas'
  valor NUMERIC NOT NULL,       -- ex: 2 (litros)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE produtos_base ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Permitir tudo" ON produtos_base FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Configuração global (dias de alerta controlados pelo admin) --
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Permitir tudo" ON configuracoes FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO configuracoes (chave, valor, updated_at)
VALUES ('dias_alerta', '3', NOW())
ON CONFLICT (chave) DO NOTHING;

-- 6) Administrador inicial ------------------------------------
INSERT INTO funcionarios (nome, login, senha_hash, salt, cargo, ativo)
VALUES (
  'Administrador',
  'admin',
  '57b3c9dc47b1a93e1bfa9dca3601a31104ba8e319458ecb2be0c2de0aa667bb9',
  '0fd748b5b0666de86575eeb10902cd2e',
  'admin',
  true
)
ON CONFLICT (login) DO NOTHING;

-- 7) Assinaturas de push (notificações server-side) --
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Permitir tudo" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;