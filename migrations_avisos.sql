-- MIGRACAO: AVISOS PARA USUARIOS
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  mensagem text not null,
  ativo boolean not null default true,
  criado_por text,
  criado_por_id uuid references public.funcionarios(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.avisos enable row level security;

-- Remove politicas antigas, se existirem.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='avisos'
  loop execute format('drop policy if exists %I on public.avisos', p.policyname); end loop;
end $$;

create policy avisos_select on public.avisos for select to authenticated
using (public.meu_funcionario_id() is not null);

create policy avisos_insert on public.avisos for insert to authenticated
with check (public.meu_cargo() = 'admin');

create policy avisos_update on public.avisos for update to authenticated
using (public.meu_cargo() = 'admin') with check (public.meu_cargo() = 'admin');

create policy avisos_delete on public.avisos for delete to authenticated
using (public.meu_cargo() = 'admin');

grant select, insert, update, delete on public.avisos to authenticated;
revoke all on public.avisos from anon;