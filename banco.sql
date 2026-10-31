-- ============================================================
-- Mercadinho Belo - Controle
-- Migração: sistema de usuários, auditoria e configuração global
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

-- 3) Configuração global (dias de alerta controlados pelo admin) --
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

-- 4) Administrador inicial ------------------------------------
-- Login: admin    Senha: admin123
-- (guardado como SHA-256 com salt — texto puro nunca é salvo)
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

-- ============================================================
-- FIM — conferindo:
-- SELECT * FROM funcionarios;
-- SELECT * FROM configuracoes;
-- ============================================================
