# Configuracao obrigatoria antes de colocar em uso

Esta versao foi preparada para autenticar cada funcionario pelo Supabase Auth e aplicar as permissoes no banco. Faca um backup do Supabase antes da migracao: ela altera politicas RLS, desativa contas legadas e remove os hashes/salts do login antigo. **Nao basta publicar os arquivos**: execute a migracao e configure as variaveis abaixo antes de liberar o acesso da equipe.

## 1. Supabase Auth e primeiro administrador

Se este for um projeto Supabase novo, crie primeiro as tabelas-base `produtos` e `lotes` (o `README.md` antigo do projeto tinha o SQL inicial) e execute `banco.sql`. No projeto que ja esta em uso, essas tabelas normalmente ja existem.

1. No painel do Supabase, abra **Authentication → Users → Add user**.
2. Crie o primeiro usuario com o e-mail `admin@mercadinhobelo.com`, marque o e-mail como confirmado e defina uma senha forte.
3. Execute o arquivo `migrations_secure.sql` inteiro no **SQL Editor** do mesmo projeto Supabase.
4. Depois da migracao, vincule o usuario Auth ao perfil administrador executando:

```sql
update public.funcionarios
set auth_user_id = (select id from auth.users where email = 'admin@mercadinhobelo.com'),
    login = 'admin', cargo = 'admin', ativo = true
where login = 'admin';
```

5. Confirme que a consulta atualizou exatamente uma linha. Entre no sistema com usuario `admin` e a senha que criou no passo 2.
6. Os cadastros antigos de funcionarios ficam inativos ate receberem uma conta segura. No menu **Funcionarios**, edite cada cadastro legado, defina uma nova senha (minimo 8 caracteres) e salve. As senhas antigas eram verificadas no navegador e nao podem ser migradas com seguranca; a migracao apaga os hashes/salts antigos.

O login usa o nome de usuario e internamente o e-mail `usuario@mercadinhobelo.com`. Os funcionarios nao precisam usar ou receber e-mails reais.

## 2. Variaveis de ambiente na Vercel

Configure estas variaveis no projeto Vercel (Production e Preview, se utilizar):

- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: chave **service_role** do Supabase. Nunca coloque esta chave no `script.js`, no HTML ou em repositório público.
- `CRON_SECRET`: segredo aleatorio longo para autorizar o cron. Gere um valor exclusivo (por exemplo, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) e mantenha-o privado.
- `VAPID_PUBLIC_KEY`: `BLWAiQcRiu4D-x6PEerVLDGLPdlbCffh1QquLAZWi_QSjBI-ka2wLM_Eoz01LCTM2EPUNKaXOVmXod5KtHAz0IU`
- `VAPID_PRIVATE_KEY`: copie o valor do arquivo local `CHAVE-VAPID-PRIVADA.txt`. Nao publique nem envie esse arquivo ao GitHub.
- `VAPID_SUBJECT`: um contato no formato `mailto:seu-email-de-administracao`.

A chave privada VAPID antiga estava embutida no codigo original; esta versao usa um novo par. A chave privada fica apenas no arquivo local ignorado pelo Git e na variavel de ambiente da Vercel.

## 3. Regras de acesso

- **Administrador:** gerencia funcionarios, configuracoes, cadastros e exclusoes.
- **Gerente:** opera lotes, registra vendas/descartes, destaca lotes para venda e consulta relatorios.
- **Funcionario:** cadastra produtos/lotes e registra vendas/descartes.
- **Patrao:** consulta os dados e acompanha indicadores/historico.

As permissoes sao verificadas no Supabase com RLS e, para gestao de contas, em uma API de servidor. O cargo salvo no navegador nao concede permissao.

## 4. Funcionalidades incluidas

- Base compartilhada de produtos e lotes para toda a equipe.
- Registro de vendas, descartes e ajustes com baixa atomica de quantidade.
- Historico de movimentacoes e auditoria de inclusao/edicao/exclusao de produtos e lotes.
- Destaque de lotes para priorizar a venda (sem campo de preco).
- Conferencia de lote identificando funcionario e horario.
- Ajuste de estoque por gerente/administrador, com motivo e historico.
- Indicadores de lotes, unidades em estoque, lotes em alerta, vencidos e destacados.
- Relatorio CSV de movimentacoes, sem valores ou precos.
- Notificacoes push de lotes vencidos e proximos do vencimento.
- Cache offline restrito aos arquivos estaticos; respostas autenticadas e dados do Supabase nao sao armazenados pelo Service Worker.

## 5. Teste antes de usar

1. Entre como administrador e crie um funcionario de teste.
2. Abra uma janela anonima e confirme que nao e possivel consultar produtos sem login.
3. Cadastre um produto com dois lotes e datas diferentes.
4. Registre uma venda parcial e confirme que a quantidade diminuiu e o historico foi gravado.
5. Tente registrar uma saida maior que o saldo; o banco deve recusar.
6. Teste o destaque de venda com gerente e confirme que funcionario comum nao consegue alterar esse campo.
7. Teste as notificacoes depois de configurar as variaveis VAPID e o cron da Vercel.

**Importante:** a versao do projeto esta preparada, mas a migracao SQL, o vinculo do primeiro administrador e as variaveis da Vercel precisam ser configurados no seu ambiente. Nao compartilhe a service role key nem a chave privada VAPID.
