-- Break the mutual RLS dependency between lojas and loja_promotores.
--
-- The previous policies queried each other directly:
--   lojas -> loja_promotores -> lojas
-- PostgreSQL detects that cycle as infinite recursion before returning rows.
-- These helpers run in the private schema and read the authorization tables
-- with the privileges of their owner, so the public policies do not recurse.

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.can_current_user_manage_uf(p_uf text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.usuarios as u
    where u.auth_user_id = (select auth.uid())
      and u.ativo is true
      and u.acesso_habilitado is true
      and (
        (
          u.perfil = 'Gerencial'
          and (
            coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('', 'admin')
            or (
              coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'gerencial'
              and upper(coalesce(p_uf, '')) = upper(coalesce(u.estado, ''))
            )
          )
        )
        or (
          u.perfil = 'Supervisor'
          and upper(coalesce(p_uf, '')) = upper(coalesce(u.estado, ''))
        )
      )
  );
$function$;

create or replace function app_private.can_current_user_manage_loja(p_loja_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.lojas as l
    where l.id = p_loja_id
      and app_private.can_current_user_manage_uf(l.uf)
  );
$function$;

create or replace function app_private.can_current_user_access_loja(p_loja_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    app_private.can_current_user_manage_loja(p_loja_id)
    or exists (
      select 1
      from public.loja_promotores as lp
      join public.usuarios as u on u.id = lp.promotor_id
      where lp.loja_id = p_loja_id
        and u.auth_user_id = (select auth.uid())
        and u.perfil = 'Promotor'
        and u.ativo is true
        and u.acesso_habilitado is true
    );
$function$;

create or replace function app_private.can_current_user_assign_promotor(
  p_loja_id uuid,
  p_promotor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.lojas as l
    join public.usuarios as u on u.id = p_promotor_id
    where l.id = p_loja_id
      and u.perfil = 'Promotor'
      and (
        coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('', 'admin')
        or upper(coalesce(u.estado, '')) = upper(coalesce(l.uf, ''))
      )
  );
$function$;

revoke all on function app_private.can_current_user_manage_uf(text) from public, anon;
revoke all on function app_private.can_current_user_manage_loja(uuid) from public, anon;
revoke all on function app_private.can_current_user_access_loja(uuid) from public, anon;
revoke all on function app_private.can_current_user_assign_promotor(uuid, uuid) from public, anon;
grant execute on function app_private.can_current_user_manage_uf(text) to authenticated;
grant execute on function app_private.can_current_user_manage_loja(uuid) to authenticated;
grant execute on function app_private.can_current_user_access_loja(uuid) to authenticated;
grant execute on function app_private.can_current_user_assign_promotor(uuid, uuid) to authenticated;

alter table public.lojas enable row level security;
alter table public.loja_promotores enable row level security;

drop policy if exists lojas_select_client on public.lojas;
drop policy if exists lojas_select_gerencial on public.lojas;
drop policy if exists lojas_select_gerencial_or_promotor_assigned on public.lojas;
drop policy if exists lojas_select_manager_scope on public.lojas;
drop policy if exists lojas_insert_client on public.lojas;
drop policy if exists lojas_insert_gerencial on public.lojas;
drop policy if exists lojas_insert_manager_scope on public.lojas;
drop policy if exists lojas_update_client on public.lojas;
drop policy if exists lojas_update_gerencial on public.lojas;
drop policy if exists lojas_update_manager_scope on public.lojas;
drop policy if exists lojas_delete_client on public.lojas;
drop policy if exists lojas_delete_gerencial on public.lojas;
drop policy if exists lojas_delete_manager_scope on public.lojas;

create policy lojas_select_authorized
on public.lojas
for select
to authenticated
using ((select app_private.can_current_user_access_loja(id)));

create policy lojas_insert_authorized
on public.lojas
for insert
to authenticated
with check (
  uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL', 'TO')
  and (select app_private.can_current_user_manage_uf(uf))
);

create policy lojas_update_authorized
on public.lojas
for update
to authenticated
using ((select app_private.can_current_user_manage_loja(id)))
with check (
  uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL', 'TO')
  and (select app_private.can_current_user_manage_uf(uf))
);

create policy lojas_delete_authorized
on public.lojas
for delete
to authenticated
using ((select app_private.can_current_user_manage_loja(id)));

drop policy if exists loja_promotores_select_client on public.loja_promotores;
drop policy if exists loja_promotores_select_gerencial on public.loja_promotores;
drop policy if exists loja_promotores_select_gerencial_or_own on public.loja_promotores;
drop policy if exists loja_promotores_select_manager_scope on public.loja_promotores;
drop policy if exists loja_promotores_insert_client on public.loja_promotores;
drop policy if exists loja_promotores_insert_gerencial on public.loja_promotores;
drop policy if exists loja_promotores_insert_manager_scope on public.loja_promotores;
drop policy if exists loja_promotores_update_client on public.loja_promotores;
drop policy if exists loja_promotores_update_gerencial on public.loja_promotores;
drop policy if exists loja_promotores_update_manager_scope on public.loja_promotores;
drop policy if exists loja_promotores_delete_client on public.loja_promotores;
drop policy if exists loja_promotores_delete_gerencial on public.loja_promotores;
drop policy if exists loja_promotores_delete_manager_scope on public.loja_promotores;

create policy loja_promotores_select_authorized
on public.loja_promotores
for select
to authenticated
using ((select app_private.can_current_user_access_loja(loja_id)));

create policy loja_promotores_insert_authorized
on public.loja_promotores
for insert
to authenticated
with check (
  (select app_private.can_current_user_manage_loja(loja_id))
  and (
    promotor_id is null
    or (select app_private.can_current_user_assign_promotor(loja_id, promotor_id))
  )
);

create policy loja_promotores_update_authorized
on public.loja_promotores
for update
to authenticated
using ((select app_private.can_current_user_manage_loja(loja_id)))
with check (
  (select app_private.can_current_user_manage_loja(loja_id))
  and (
    promotor_id is null
    or (select app_private.can_current_user_assign_promotor(loja_id, promotor_id))
  )
);

create policy loja_promotores_delete_authorized
on public.loja_promotores
for delete
to authenticated
using ((select app_private.can_current_user_manage_loja(loja_id)));

notify pgrst, 'reload schema';
