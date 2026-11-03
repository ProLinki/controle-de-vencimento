# Mercadinho Belo — Controle de validade e prevenção de perdas

Aplicacao web/PWA para uma equipe controlar produtos e lotes de forma compartilhada, acompanhar vencimentos e registrar vendas e descartes. **O sistema nao cadastra, calcula nem exibe precos de produtos.** O campo de conteudo representa apenas volume/peso da embalagem (por exemplo, 2 litros ou 500 gramas).

## Funcionalidades

- Login individual por funcionario usando Supabase Auth.
- Perfis: administrador, gerente, funcionario e patrao.
- Cadastro compartilhado de produtos e multiplos lotes, com codigo de barras e leitura pela camera.
- Painel com lotes, unidades em estoque, vencidos, vencimentos em 3/7/15 dias e lotes destacados.
- Registro de venda, descarte e ajuste com baixa atomica de quantidade e bloqueio de saldo negativo.
- Destaque de lotes para priorizar vendas, controlado por gerente/administrador.
- Auditoria de inclusao, edicao e exclusao de produtos/lotes.
- Historico de movimentacoes e exportacao CSV sem precos.
- Notificacoes push para lotes vencidos e proximos do vencimento.
- PWA instalavel; o cache offline guarda somente arquivos estaticos, nunca respostas autenticadas nem dados de estoque.

## Arquivos importantes

- `index.html`, `style.css`, `script.js`: interface e aplicacao.
- `migrations_secure.sql`: migracao de autenticacao, RLS, auditoria, movimentacoes e relatorios.
- `api/funcionarios.js`: criacao/edicao/desativacao de contas via servidor.
- `api/send-notifications.js`: notificacoes push protegidas por segredo de cron.
- `service-worker.js`: cache apenas de arquivos estaticos.
- `CONFIGURACAO-OBRIGATORIA.md`: passo a passo para configurar Supabase e Vercel.

## Configuracao

Leia e siga **`CONFIGURACAO-OBRIGATORIA.md`** antes de disponibilizar o sistema para os funcionarios. A migracao SQL e as variaveis de ambiente sao obrigatorias. A chave `service_role` e a chave privada VAPID nunca devem ser inseridas no codigo do navegador nem enviadas ao GitHub.

## Stack

HTML, CSS e JavaScript; Supabase Auth/Postgres com Row Level Security; Vercel Functions; Web Push; PWA.
