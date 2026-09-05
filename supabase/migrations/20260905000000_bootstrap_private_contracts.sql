-- Break the intentional circular dependency between public policies/functions
-- and the private authorization helpers in the production snapshot. These
-- conservative stubs exist only while the baseline is being restored and are
-- replaced by their complete implementations two migrations later.

create schema if not exists app_private;
revoke all on schema app_private from public, anon;

create extension if not exists pg_trgm with schema extensions;

create function app_private.can_current_user_access_loja(p_loja_id uuid)
returns boolean language sql stable as $$ select false $$;

create function app_private.can_current_user_access_process(p_processo_id uuid)
returns boolean language sql stable as $$ select false $$;

create function app_private.can_current_user_access_product(p_produto_id uuid)
returns boolean language sql stable as $$ select false $$;

create function app_private.can_current_user_assign_promotor(
  p_loja_id uuid,
  p_promotor_id uuid
)
returns boolean language sql stable as $$ select false $$;

create function app_private.can_current_user_manage_uf(p_uf text)
returns boolean language sql stable as $$ select false $$;

create function app_private.is_current_user_admin_ativo()
returns boolean language sql stable as $$ select false $$;

create function app_private.is_current_user_gerencial_ativo()
returns boolean language sql stable as $$ select false $$;

create function app_private.is_current_user_scoped_gerencial_ativo()
returns boolean language sql stable as $$ select false $$;

create function app_private.current_user_uf()
returns text language sql stable as $$ select null::text $$;

create function app_private.current_user_ufs()
returns text[] language sql stable as $$ select array[]::text[] $$;

create function app_private.search_nfd_chaves_by_name(p_search text)
returns table(chave_acesso text) language sql stable
as $$ select null::text where false $$;
create function app_private.search_nfd_chaves_numeric(p_search text)
returns table(chave_acesso text) language sql stable
as $$ select null::text where false $$;
