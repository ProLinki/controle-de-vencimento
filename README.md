# 🛒 Mercadinho Belo - Controle

PWA mobile para controle de vencimento de produtos com múltiplos lotes, salvando dados no **Supabase**.

## 📁 Estrutura

```
mercadinho-belo/
├── index.html          # Interface principal
├── style.css           # Estética 12 Axes
├── script.js           # Lógica + Supabase
├── manifest.json       # PWA
├── service-worker.js   # Offline
├── .gitignore
├── vercel.json         # Deploy Vercel
└── README.md
```

## 🚀 Funcionalidades

- Cadastro de produtos com múltiplos lotes (mesmo nome, datas diferentes)
- Lista ordenada por vencimento (mais próximo primeiro)
- Estatísticas: total de lotes, vencem em X dias, já venceram
- Configuração de intervalo de alerta (dias)
- Notificações de produtos próximos do vencimento
- Funciona offline (Service Worker + PWA)
- Instalável como app no celular
- Dados salvos no Supabase (nuvem)

## ☁️ Configurar Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. No SQL Editor, execute:

```sql
CREATE TABLE produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE lotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL DEFAULT 1,
  vencimento DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura pública" ON produtos FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública" ON lotes FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública" ON produtos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir inserção pública" ON lotes FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública" ON produtos FOR UPDATE USING (true);
CREATE POLICY "Permitir atualização pública" ON lotes FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão pública" ON produtos FOR DELETE USING (true);
CREATE POLICY "Permitir exclusão pública" ON lotes FOR DELETE USING (true);
```

3. Copie a **Project URL** e a **anon public key** em Settings > API
4. Edite o `script.js` e preencha:

```javascript
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = 'sua-chave-anon-aqui';
```

## ☁️ Deploy na Vercel

1. Crie repositório no GitHub com estes arquivos
2. Acesse [vercel.com](https://vercel.com) → Add New Project → selecione o repo
3. Deploy automático

## 📱 Uso

Abra o `index.html` no celular → "Adicionar à tela de início"

## 📄 Licença

MIT