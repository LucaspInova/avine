-- Keep authorization helpers outside the Data API surface. The public wrapper
-- was legacy-only; policies can call the private helper directly.

drop policy if exists nfd_desconhecimentos_select_scoped
  on public.nfd_desconhecimentos;

create policy nfd_desconhecimentos_select_scoped
on public.nfd_desconhecimentos
for select
to authenticated
using (
  app_private.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.usuarios as u
    where u.id = nfd_desconhecimentos.usuario_id
      and u.auth_user_id = (select auth.uid())
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop function if exists public.is_current_user_gerencial_ativo();

notify pgrst, 'reload schema';
