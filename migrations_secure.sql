-- MIGRACAO DE SEGURANCA E OPERACAO - Mercadinho Belo
-- Execute no SQL Editor do Supabase APOS criar o primeiro usuario em Authentication.
-- O login do sistema usa Supabase Auth; nunca armazene senhas na tabela funcionarios.

create extension if not exists pgcrypto;

alter table public.funcionarios add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.funcionarios add column if not exists ultimo_acesso timestamptz;
alter table public.funcionarios add column if not exists atualizado_em timestamptz default now();
alter table public.lotes add column if not exists atualizado_por_id uuid references public.funcionarios(id) on delete set null;
alter table public.push_subscriptions add column if not exists funcionario_id uuid references public.funcionarios(id) on delete cascade;
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
create unique index if not exists idx_push_endpoint_funcionario on public.push_subscriptions(endpoint, funcionario_id);
alter table public.funcionarios drop constraint if exists funcionarios_cargo_check;
alter table public.funcionarios add constraint funcionarios_cargo_check check (cargo in ('admin','gerente','funcionario','patrao'));

-- Remove credenciais do login legado (hash/salt SHA-256 no cliente nao sao seguros).
alter table public.funcionarios alter column senha_hash drop not null;
alter table public.funcionarios alter column salt drop not null;
update public.funcionarios set senha_hash = null, salt = null;
-- Contas legadas ficam inativas ate serem vinculadas a uma conta Auth.
update public.funcionarios set ativo = false where auth_user_id is null;
insert into public.funcionarios (nome, login, senha_hash, salt, cargo, ativo)
values ('Administrador', 'admin', null, null, 'admin', false)
on conflict (login) do nothing;

alter table public.lotes add column if not exists em_promocao boolean not null default false;
alter table public.lotes add column if not exists promocao_desde date;
alter table public.lotes add column if not exists promocao_motivo text;
alter table public.lotes add column if not exists baixado_em timestamptz;
alter table public.lotes add column if not exists conferido_por text;
alter table public.lotes add column if not exists conferido_por_id uuid references public.funcionarios(id) on delete set null;
alter table public.lotes add column if not exists conferido_em timestamptz;
-- Preserva o conteudo/volume da embalagem, renomeando o antigo campo ambiguo.
alter table public.produtos add column if not exists conteudo numeric;
alter table public.produtos_base add column if not exists conteudo numeric;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='produtos' and column_name='valor') then
    execute 'update public.produtos set conteudo = valor where conteudo is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='produtos_base' and column_name='valor') then
    execute 'update public.produtos_base set conteudo = valor where conteudo is null';
  end if;
end $$;
alter table public.produtos drop column if exists valor;
alter table public.produtos_base drop column if exists valor;

create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references public.lotes(id) on delete set null,
  produto_id uuid references public.produtos(id) on delete set null,
  tipo text not null check (tipo in ('venda','descarte','ajuste')),
  quantidade integer not null check (quantidade > 0),
  observacao text,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  funcionario_nome text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid,
  acao text not null,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  funcionario_nome text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lotes_vencimento on public.lotes(vencimento);
create index if not exists idx_lotes_produto on public.lotes(produto_id);
create index if not exists idx_movimentacoes_created on public.movimentacoes(created_at desc);
create index if not exists idx_movimentacoes_lote on public.movimentacoes(lote_id);

create or replace function public.meu_funcionario_id()
returns uuid language sql stable security definer set search_path = public
as $$ select id from public.funcionarios where auth_user_id = auth.uid() and ativo = true limit 1 $$;

create or replace function public.meu_cargo()
returns text language sql stable security definer set search_path = public
as $$ select cargo from public.funcionarios where auth_user_id = auth.uid() and ativo = true limit 1 $$;

create or replace function public.pode_editar()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.meu_cargo() in ('admin','gerente','funcionario'), false) $$;

create or replace function public.pode_gerir()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.meu_cargo() in ('admin','gerente'), false) $$;

-- Garante que funcionario/patrao nao consiga adulterar campos de promocao.
create or replace function public.proteger_promocao_lote()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (new.em_promocao, new.promocao_desde, new.promocao_motivo)
     is distinct from (old.em_promocao, old.promocao_desde, old.promocao_motivo)
     and not public.pode_gerir() then
    raise exception 'Somente gerente ou administrador pode alterar a promocao.';
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_promocao_lote on public.lotes;
create trigger trg_proteger_promocao_lote before update on public.lotes
for each row execute function public.proteger_promocao_lote();

-- Auditoria automatica de inclusao/edicao/exclusao de produtos e lotes.
create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_func uuid; v_nome text;
begin
  v_id := case when tg_op = 'DELETE' then old.id else new.id end;
  v_func := public.meu_funcionario_id();
  select nome into v_nome from public.funcionarios where id = v_func;
  insert into public.auditoria(tabela, registro_id, acao, funcionario_id, funcionario_nome, detalhes)
  values (tg_table_name, v_id, lower(tg_op), v_func, coalesce(v_nome,'Sistema'),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists trg_auditoria_lotes on public.lotes;
create trigger trg_auditoria_lotes after insert or update or delete on public.lotes
for each row execute function public.registrar_auditoria();
drop trigger if exists trg_auditoria_produtos on public.produtos;
create trigger trg_auditoria_produtos after insert or update or delete on public.produtos
for each row execute function public.registrar_auditoria();

-- Baixa atomica de venda/descarte: impede saldo negativo e grava historico.
create or replace function public.registrar_movimentacao(
  p_lote_id uuid, p_tipo text, p_quantidade integer, p_observacao text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_lote public.lotes%rowtype; v_func uuid; v_nome text;
begin
  v_func := public.meu_funcionario_id();
  if v_func is null or public.meu_cargo() not in ('admin','gerente','funcionario') then
    raise exception 'Usuario sem permissao para registrar movimentacoes.';
  end if;
  if p_tipo not in ('venda','descarte','ajuste') or p_quantidade is null or p_quantidade < 1 then
    raise exception 'Tipo ou quantidade invalida.';
  end if;
  select * into v_lote from public.lotes where id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.'; end if;
  if p_tipo = 'venda' and v_lote.vencimento < current_date then raise exception 'Este lote esta vencido e nao pode ser registrado como venda.'; end if;
  if v_lote.quantidade < p_quantidade then raise exception 'Quantidade maior que o estoque disponivel (%).', v_lote.quantidade; end if;
  select nome into v_nome from public.funcionarios where id = v_func;
  update public.lotes set quantidade = quantidade - p_quantidade,
    baixado_em = case when quantidade - p_quantidade = 0 then now() else baixado_em end,
    atualizado_por = v_nome, atualizado_por_id = v_func, atualizado_em = now()
  where id = p_lote_id;
  insert into public.movimentacoes(lote_id, produto_id, tipo, quantidade, observacao, funcionario_id, funcionario_nome)
  values (p_lote_id, v_lote.produto_id, p_tipo, p_quantidade, nullif(trim(p_observacao),''), v_func, coalesce(v_nome,'Funcionario'));
  return jsonb_build_object('ok',true,'saldo',v_lote.quantidade-p_quantidade);
end $$;
revoke all on function public.registrar_movimentacao(uuid,text,integer,text) from public;
grant execute on function public.registrar_movimentacao(uuid,text,integer,text) to authenticated;

-- Ajuste de saldo por gerente/administrador, mantendo trilha de auditoria.
create or replace function public.ajustar_estoque(
  p_lote_id uuid, p_nova_quantidade integer, p_observacao text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_lote public.lotes%rowtype; v_func uuid; v_nome text; v_delta integer;
begin
  v_func := public.meu_funcionario_id();
  if v_func is null or public.meu_cargo() not in ('admin','gerente') then
    raise exception 'Somente gerente ou administrador pode ajustar o estoque.';
  end if;
  if p_nova_quantidade is null or p_nova_quantidade < 0 then raise exception 'Quantidade invalida.'; end if;
  select * into v_lote from public.lotes where id=p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.'; end if;
  v_delta := abs(p_nova_quantidade - v_lote.quantidade);
  if v_delta = 0 then return jsonb_build_object('ok',true,'saldo',v_lote.quantidade,'alterado',false); end if;
  select nome into v_nome from public.funcionarios where id=v_func;
  update public.lotes set quantidade=p_nova_quantidade, atualizado_por=v_nome,
    atualizado_por_id=v_func, atualizado_em=now(), baixado_em=case when p_nova_quantidade=0 then now() else null end
  where id=p_lote_id;
  insert into public.movimentacoes(lote_id,produto_id,tipo,quantidade,observacao,funcionario_id,funcionario_nome)
  values(p_lote_id,v_lote.produto_id,'ajuste',v_delta,nullif(trim(p_observacao),''),v_func,coalesce(v_nome,'Gerente'));
  return jsonb_build_object('ok',true,'saldo',p_nova_quantidade,'alterado',true);
end $$;
revoke all on function public.ajustar_estoque(uuid,integer,text) from public;
grant execute on function public.ajustar_estoque(uuid,integer,text) to authenticated;

-- Permissoes: removemos TODAS as politicas permissivas anteriores dessas tabelas.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('funcionarios','produtos','lotes','produtos_base','configuracoes','push_subscriptions','movimentacoes','auditoria')
  loop execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

alter table public.funcionarios enable row level security;
alter table public.produtos enable row level security;
alter table public.lotes enable row level security;
alter table public.produtos_base enable row level security;
alter table public.configuracoes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.auditoria enable row level security;

create policy funcionarios_select on public.funcionarios for select to authenticated
using (auth_user_id = auth.uid() or public.meu_cargo() = 'admin');
create policy funcionarios_update_self on public.funcionarios for update to authenticated
using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy produtos_select on public.produtos for select to authenticated using (public.meu_funcionario_id() is not null);
create policy produtos_insert on public.produtos for insert to authenticated with check (public.pode_editar());
create policy produtos_update on public.produtos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy produtos_delete on public.produtos for delete to authenticated using (public.meu_cargo()='admin');

create policy lotes_select on public.lotes for select to authenticated using (public.meu_funcionario_id() is not null);
create policy lotes_insert on public.lotes for insert to authenticated with check (public.pode_editar());
create policy lotes_update on public.lotes for update to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy lotes_delete on public.lotes for delete to authenticated using (public.meu_cargo()='admin');

create policy produtos_base_select on public.produtos_base for select to authenticated using (public.meu_funcionario_id() is not null);
create policy produtos_base_write on public.produtos_base for all to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy configuracoes_select on public.configuracoes for select to authenticated using (public.meu_funcionario_id() is not null);
create policy configuracoes_write on public.configuracoes for all to authenticated using (public.meu_cargo()='admin') with check (public.meu_cargo()='admin');
create policy push_select_own on public.push_subscriptions for select to authenticated using (funcionario_id = public.meu_funcionario_id());
create policy push_insert_own on public.push_subscriptions for insert to authenticated with check (funcionario_id = public.meu_funcionario_id());
create policy push_delete_own on public.push_subscriptions for delete to authenticated using (funcionario_id = public.meu_funcionario_id());
create policy push_update_own on public.push_subscriptions for update to authenticated using (funcionario_id = public.meu_funcionario_id()) with check (funcionario_id = public.meu_funcionario_id());
create policy movimentacoes_select on public.movimentacoes for select to authenticated
using (public.meu_funcionario_id() is not null);
create policy auditoria_select on public.auditoria for select to authenticated
using (public.meu_funcionario_id() is not null);

-- O aplicativo nao precisa ler nem gravar os hashes antigos.
revoke all on public.funcionarios from anon;
revoke all on public.produtos, public.lotes, public.produtos_base, public.configuracoes,
  public.push_subscriptions, public.movimentacoes, public.auditoria from anon;
revoke update on public.funcionarios from authenticated;
grant select on public.funcionarios to authenticated;
grant update (nome, atualizado_em, ultimo_acesso) on public.funcionarios to authenticated;
grant select, insert, update, delete on public.produtos, public.lotes to authenticated;
grant select, insert, update, delete on public.produtos_base, public.configuracoes to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.movimentacoes, public.auditoria to authenticated;

-- Relatorio resumido sem valores monetarios.
create or replace view public.resumo_perdas with (security_invoker=true) as
select date_trunc('month', created_at)::date as mes,
       tipo, count(*) as operacoes, sum(quantidade) as unidades
from public.movimentacoes group by 1,2;
revoke all on public.resumo_perdas from anon;
grant select on public.resumo_perdas to authenticated;
