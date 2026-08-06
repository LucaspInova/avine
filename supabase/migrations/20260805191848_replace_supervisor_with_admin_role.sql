-- Replace the retired Supervisor profile with a global Admin profile.
-- Gerencial remains scoped to the UF stored in public.usuarios.estado.

alter table public.usuarios
  drop constraint if exists usuarios_perfil_check;

update public.usuarios as u
set perfil = 'Admin'
from auth.users as au
where au.id = u.auth_user_id
  and (
    u.perfil = 'Supervisor'
    or (
      u.perfil = 'Gerencial'
      and au.raw_app_meta_data ->> 'role' = 'admin'
    )
  );

update auth.users as au
set raw_app_meta_data = jsonb_set(
  coalesce(au.raw_app_meta_data, '{}'::jsonb),
  '{role}',
  to_jsonb('admin'::text),
  true
)
where exists (
  select 1
  from public.usuarios as u
  where u.auth_user_id = au.id
    and u.perfil = 'Admin'
);

alter table public.usuarios
  add constraint usuarios_perfil_check
  check (perfil in ('Promotor', 'Gerencial', 'Admin'));

create or replace function app_private.is_current_user_admin_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select app_private.current_user_auth_role() = 'admin'
    and exists (
      select 1
      from public.usuarios as u
      where u.auth_user_id = (select auth.uid())
        and u.perfil = 'Admin'
        and u.ativo is true
        and u.acesso_habilitado is true
    );
$function$;

create or replace function app_private.is_current_user_scoped_gerencial_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select app_private.current_user_auth_role() = 'gerencial'
    and exists (
      select 1
      from public.usuarios as u
      where u.auth_user_id = (select auth.uid())
        and u.perfil = 'Gerencial'
        and u.ativo is true
        and u.acesso_habilitado is true
    );
$function$;

create or replace function app_private.current_user_uf()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select u.estado
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Gerencial'
    and app_private.current_user_auth_role() = 'gerencial'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;
$function$;

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
          u.perfil = 'Admin'
          and app_private.current_user_auth_role() = 'admin'
        )
        or (
          u.perfil = 'Gerencial'
          and app_private.current_user_auth_role() = 'gerencial'
          and upper(coalesce(p_uf, '')) = upper(coalesce(u.estado, ''))
        )
      )
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
      and app_private.can_current_user_manage_uf(l.uf)
      and (
        app_private.current_user_auth_role() = 'admin'
        or upper(coalesce(u.estado, '')) = upper(coalesce(l.uf, ''))
      )
  );
$function$;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.iniciar_fstd_produtos_v2(uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'u.perfil in (''Promotor'', ''Gerencial'')',
    'u.perfil in (''Promotor'', ''Gerencial'', ''Admin'')'
  );
  v_definition := replace(
    v_definition,
    E'and (\n      public.is_current_user_gerencial_ativo()\n      or exists (',
    E'and (\n      app_private.can_current_user_access_loja(l.id)\n      or exists ('
  );
  v_definition := replace(
    v_definition,
    E'if public.is_current_user_gerencial_ativo()\n        and v_processo.loja_id = p_loja_id then',
    E'if app_private.can_current_user_access_loja(v_processo.loja_id) then'
  );
  execute v_definition;

  select pg_get_functiondef('public.concluir_fstd_produto(uuid,jsonb,text,jsonb)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'u.perfil in (''Promotor'', ''Gerencial'')',
    'u.perfil in (''Promotor'', ''Gerencial'', ''Admin'')'
  );
  v_definition := replace(
    v_definition,
    'public.is_current_user_gerencial_ativo()',
    'app_private.can_current_user_access_product(p_produto_id)'
  );
  execute v_definition;

  select pg_get_functiondef('public.editar_fstd_produto(uuid,jsonb,integer,integer,text,jsonb)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'u.perfil in (''Promotor'', ''Gerencial'')',
    'u.perfil in (''Promotor'', ''Gerencial'', ''Admin'')'
  );
  v_definition := replace(
    v_definition,
    'public.is_current_user_gerencial_ativo()',
    'app_private.can_current_user_access_product(p_produto_id)'
  );
  execute v_definition;

  select pg_get_functiondef('public.finalizar_fstd_produtos(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'u.perfil in (''Promotor'', ''Gerencial'')',
    'u.perfil in (''Promotor'', ''Gerencial'', ''Admin'')'
  );
  v_definition := replace(
    v_definition,
    'public.is_current_user_gerencial_ativo()',
    'app_private.can_current_user_access_process(p_processo_id)'
  );
  execute v_definition;

  select pg_get_functiondef('public.desconhecer_nfd_gerencial(uuid,text,text,text,text,text)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'and u.perfil = ''Gerencial''',
    'and u.perfil in (''Admin'', ''Gerencial'')'
  );
  v_definition := replace(
    v_definition,
    E'and u.acesso_habilitado is true\n  limit 1;',
    E'and u.acesso_habilitado is true\n    and app_private.can_current_user_access_loja(p_loja_id)\n  limit 1;'
  );
  execute v_definition;

  select pg_get_functiondef('public.reconhecer_nfd_gerencial(text,text,text)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'and u.perfil = ''Gerencial''',
    'and u.perfil in (''Admin'', ''Gerencial'')'
  );
  v_definition := replace(
    v_definition,
    E'where nd.reconhecida_em is null',
    E'where nd.reconhecida_em is null\n    and app_private.can_current_user_access_loja(nd.loja_id)'
  );
  execute v_definition;
end;
$migration$;

comment on table public.usuarios is
  'Usuarios do FSTD Digital e do painel Gerencial; perfis operacionais ativos: Promotor, Gerencial por UF e Admin global.';

;
