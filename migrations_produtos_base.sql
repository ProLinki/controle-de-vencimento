-- MIGRACAO: PRODUTOS_BASE
alter table public.produtos_base add column if not exists created_at timestamptz not null default now();

-- Garante unicidade do codigo de barras para upsert/restauracao.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_base_codigo_barras_key') then
    alter table public.produtos_base add constraint produtos_base_codigo_barras_key unique (codigo_barras);
  end if;
end $$;

grant select, insert, update, delete on public.produtos_base to authenticated;
revoke all on public.produtos_base from anon;