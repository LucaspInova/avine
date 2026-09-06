-- Remove trabalho redundante identificado pelo Advisor depois do Lote 6.

drop index if exists public.nfd_desconhecimentos_chave_ativa_idx;
drop index if exists public.nfd_desconhecimentos_referencia_ativa_idx;

drop policy if exists nfd_desconhecimentos_insert_current_user_with_store_access
  on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_insert_current_user_with_store_access
on public.nfd_desconhecimentos
for insert
to authenticated
with check (
  app_private.is_current_user_promotor_ativo()
  and app_private.can_current_user_read_loja(loja_id)
  and exists (
    select 1
    from public.usuarios u
    where u.id = nfd_desconhecimentos.usuario_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists nfd_desconhecimentos_select_scoped
  on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_select_scoped
on public.nfd_desconhecimentos
for select
to authenticated
using (
  app_private.can_current_user_access_loja(loja_id)
  or (
    app_private.is_current_user_promotor_ativo()
    and exists (
      select 1
      from public.usuarios u
      where u.id = nfd_desconhecimentos.usuario_id
        and u.auth_user_id = (select auth.uid())
        and u.perfil = 'Promotor'
        and u.ativo is true
        and u.acesso_habilitado is true
    )
  )
);
