-- MIGRACAO: AVARIAS
alter table public.funcionarios drop constraint if exists funcionarios_cargo_check;
alter table public.funcionarios add constraint funcionarios_cargo_check check (cargo in ('admin','gerente','funcionario','patrao','avaria'));

create table if not exists public.avarias (
  id uuid primary key default gen_random_uuid(),
  data_abertura date not null default current_date,
  criado_por text,
  criado_por_id uuid references public.funcionarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.avaria_itens (
  id uuid primary key default gen_random_uuid(),
  avaria_id uuid not null references public.avarias(id) on delete cascade,
  codigo_barras text,
  nome text not null,
  unidade text,
  conteudo numeric,
  quantidade integer not null check (quantidade > 0),
  created_at timestamptz not null default now()
);

alter table public.avarias enable row level security;
alter table public.avaria_itens enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename in ('avarias','avaria_itens')
  loop
    if p.policyname like '%avarias%' then execute format('drop policy if exists %I on public.avarias', p.policyname); end if;
    if p.policyname like '%avaria_itens%' then execute format('drop policy if exists %I on public.avaria_itens', p.policyname); end if;
  end loop;
end $$;

create policy avarias_select on public.avarias for select to authenticated
using (public.meu_funcionario_id() is not null);

create policy avarias_insert on public.avarias for insert to authenticated
with check (public.meu_cargo() in ('admin','avaria'));

create policy avarias_delete on public.avarias for delete to authenticated
using (public.meu_cargo() = 'admin');

create policy avaria_itens_select on public.avaria_itens for select to authenticated
using (public.meu_funcionario_id() is not null);

create policy avaria_itens_insert on public.avaria_itens for insert to authenticated
with check (public.meu_cargo() in ('admin','avaria'));

create policy avaria_itens_delete on public.avaria_itens for delete to authenticated
using (public.meu_cargo() in ('admin','avaria'));

grant select, insert, delete on public.avarias to authenticated;
grant select, insert, delete on public.avaria_itens to authenticated;
revoke all on public.avarias, public.avaria_itens from anon;