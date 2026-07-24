-- Keep the RLS authorization helper out of the exposed Data API schema.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.is_current_user_gerencial_ativo()
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
      and u.perfil = 'Gerencial'
      and u.ativo is true
      and u.acesso_habilitado is true
  );
$function$;

revoke all on function app_private.is_current_user_gerencial_ativo()
  from public, anon;
grant execute on function app_private.is_current_user_gerencial_ativo()
  to authenticated;

-- Update every policy that still references the exposed compatibility helper.
do $block$
declare
  policy_row record;
  statement text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_catalog.pg_policies
    where schemaname in ('public', 'storage')
      and (
        coalesce(qual, '') like '%is_current_user_gerencial_ativo()%'
        or coalesce(with_check, '') like '%is_current_user_gerencial_ativo()%'
      )
  loop
    statement := format(
      'alter policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );

    if policy_row.qual is not null then
      statement := statement || ' using (' ||
        case
          when policy_row.qual like '%public.is_current_user_gerencial_ativo()%'
            then replace(
              policy_row.qual,
              'public.is_current_user_gerencial_ativo()',
              'app_private.is_current_user_gerencial_ativo()'
            )
          else replace(
            policy_row.qual,
            'is_current_user_gerencial_ativo()',
            'app_private.is_current_user_gerencial_ativo()'
          )
        end || ')';
    end if;

    if policy_row.with_check is not null then
      statement := statement || ' with check (' ||
        case
          when policy_row.with_check like '%public.is_current_user_gerencial_ativo()%'
            then replace(
              policy_row.with_check,
              'public.is_current_user_gerencial_ativo()',
              'app_private.is_current_user_gerencial_ativo()'
            )
          else replace(
            policy_row.with_check,
            'is_current_user_gerencial_ativo()',
            'app_private.is_current_user_gerencial_ativo()'
          )
        end || ')';
    end if;

    execute statement;
  end loop;
end;
$block$;

-- The two transitional administrative functions still support the currently
-- deployed frontend, but no longer depend on an RPC-visible authorization
-- helper. They will be revoked after the frontend cutover to manage-users.
do $block$
declare
  function_row record;
begin
  for function_row in
    select p.oid, pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_gerencial_user', 'update_gerencial_user')
      and pg_catalog.pg_get_functiondef(p.oid)
        like '%public.is_current_user_gerencial_ativo()%'
  loop
    execute replace(
      function_row.definition,
      'public.is_current_user_gerencial_ativo()',
      'app_private.is_current_user_gerencial_ativo()'
    );
  end loop;
end;
$block$;

revoke all on function public.is_current_user_gerencial_ativo()
  from public, anon, authenticated;
drop function public.is_current_user_gerencial_ativo();

-- These overloads were used by older Promotor prototypes. The current and
-- previously deployed frontend both use the JSON division contract.
drop function if exists public.concluir_fstd_produto(
  uuid, uuid, integer, text
);
drop function if exists public.concluir_fstd_produto(
  uuid, uuid, integer, text, jsonb
);

notify pgrst, 'reload schema';
