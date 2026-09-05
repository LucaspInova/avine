-- Normalize persisted and requested UFs at the authorization boundary.  Older
-- records may contain surrounding whitespace or lowercase values; that must
-- not make a scoped Gerencial lose data, and it must never broaden access.
update public.usuarios
set ufs = coalesce(
  (
    select array_agg(upper(trim(value)) order by ord)
    from unnest(ufs) with ordinality as item(value, ord)
    where trim(value) <> ''
  ),
  '{}'::text[]
)
where ufs is distinct from coalesce(
  (
    select array_agg(upper(trim(value)) order by ord)
    from unnest(ufs) with ordinality as item(value, ord)
    where trim(value) <> ''
  ),
  '{}'::text[]
);

create or replace function app_private.current_user_ufs()
returns text[] language sql stable security definer set search_path = '' as $$
  select case when app_private.is_current_user_admin_ativo()
    then array['CE','MA','BA','PA','PB','PI','PE','AP','SE','RN','AL','TO']::text[]
    else coalesce((select array_agg(upper(trim(value)) order by ord)
      from public.usuarios u, unnest(u.ufs) with ordinality as item(value, ord)
      where u.auth_user_id = auth.uid() and u.perfil = 'Gerencial'
        and u.ativo and u.acesso_habilitado and trim(value) <> ''), '{}'::text[])
  end;
$$;

create or replace function app_private.can_current_user_manage_uf(p_uf text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.is_current_user_admin_ativo()
    or (app_private.is_current_user_scoped_gerencial_ativo()
      and upper(trim(coalesce(p_uf, ''))) = any(app_private.current_user_ufs()));
$$;

comment on function app_private.current_user_ufs() is
  'Returns the authenticated user UFs normalized to uppercase without blanks.';
comment on function app_private.can_current_user_manage_uf(text) is
  'Checks administrative or normalized scoped-Gerencial UF access.';
