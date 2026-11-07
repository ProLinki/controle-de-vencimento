-- Permite que o administrador exclua historico de movimentacoes e auditoria.
create policy movimentacoes_delete_admin on public.movimentacoes for delete to authenticated
using (public.meu_cargo() = 'admin');

create policy auditoria_delete_admin on public.auditoria for delete to authenticated
using (public.meu_cargo() = 'admin');

grant delete on public.movimentacoes, public.auditoria to authenticated;