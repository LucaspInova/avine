


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "app_private";


ALTER SCHEMA "app_private" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."can_current_user_access_loja"("p_loja_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists(select 1 from public.lojas l where l.id = p_loja_id
    and app_private.can_current_user_manage_uf(l.uf));
$$;


ALTER FUNCTION "app_private"."can_current_user_access_loja"("p_loja_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."can_current_user_access_process"("p_processo_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists(select 1 from public.fstd_processos p where p.id = p_processo_id
    and app_private.can_current_user_access_loja(p.loja_id));
$$;


ALTER FUNCTION "app_private"."can_current_user_access_process"("p_processo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."can_current_user_access_product"("p_produto_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists(select 1 from public.fstd_produtos fp where fp.id = p_produto_id
    and app_private.can_current_user_access_process(fp.processo_id));
$$;


ALTER FUNCTION "app_private"."can_current_user_access_product"("p_produto_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."can_current_user_assign_promotor"("p_loja_id" "uuid", "p_promotor_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.lojas l join public.usuarios u on u.id = p_promotor_id
    where l.id = p_loja_id and u.perfil = 'Promotor' and u.ativo
      and u.estado = l.uf and u.ufs = array[l.uf]
      and app_private.can_current_user_manage_uf(l.uf)
  );
$$;


ALTER FUNCTION "app_private"."can_current_user_assign_promotor"("p_loja_id" "uuid", "p_promotor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."can_current_user_manage_loja"("p_loja_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.lojas as l
    where l.id = p_loja_id
      and app_private.can_current_user_manage_uf(l.uf)
  );
$$;


ALTER FUNCTION "app_private"."can_current_user_manage_loja"("p_loja_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."can_current_user_manage_uf"("p_uf" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select app_private.is_current_user_admin_ativo()
    or (app_private.is_current_user_scoped_gerencial_ativo()
      and upper(trim(coalesce(p_uf, ''))) = any(app_private.current_user_ufs()));
$$;


ALTER FUNCTION "app_private"."can_current_user_manage_uf"("p_uf" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "app_private"."can_current_user_manage_uf"("p_uf" "text") IS 'Checks administrative or normalized scoped-Gerencial UF access.';



CREATE OR REPLACE FUNCTION "app_private"."current_user_auth_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;


ALTER FUNCTION "app_private"."current_user_auth_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."current_user_uf"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select u.estado
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Gerencial'
    and app_private.current_user_auth_role() = 'gerencial'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;
$$;


ALTER FUNCTION "app_private"."current_user_uf"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."current_user_ufs"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case when app_private.is_current_user_admin_ativo()
    then array['CE','MA','BA','PA','PB','PI','PE','AP','SE','RN','AL','TO']::text[]
    else coalesce((select array_agg(upper(trim(value)) order by ord)
      from public.usuarios u, unnest(u.ufs) with ordinality as item(value, ord)
      where u.auth_user_id = auth.uid() and u.perfil = 'Gerencial'
        and u.ativo and u.acesso_habilitado and trim(value) <> ''), '{}'::text[])
  end;
$$;


ALTER FUNCTION "app_private"."current_user_ufs"() OWNER TO "postgres";


COMMENT ON FUNCTION "app_private"."current_user_ufs"() IS 'Returns the authenticated user UFs normalized to uppercase without blanks.';



CREATE OR REPLACE FUNCTION "app_private"."ensure_fstd_document"("p_processo_id" "uuid") RETURNS "public"."fstd_documentos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_document public.fstd_documentos;
begin
  if p_processo_id is null then
    raise exception 'Processo FSTD obrigatorio.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.fstd_processos as p
    where p.id = p_processo_id
      and p.status = 'concluida'
  ) then
    raise exception 'Somente processos FSTD concluidos podem possuir documento.'
      using errcode = '22023';
  end if;

  insert into public.fstd_documentos (processo_id)
  values (p_processo_id)
  on conflict (processo_id) do nothing;

  select d.*
  into v_document
  from public.fstd_documentos as d
  where d.processo_id = p_processo_id;

  if v_document.id is null then
    raise exception 'Nao foi possivel garantir o documento FSTD.';
  end if;

  return v_document;
end;
$$;


ALTER FUNCTION "app_private"."ensure_fstd_document"("p_processo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."fstd_processos_ensure_document"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status = 'concluida' then
    perform app_private.ensure_fstd_document(new.id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "app_private"."fstd_processos_ensure_document"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."is_current_user_admin_ativo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select app_private.current_user_auth_role() = 'admin' and exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.perfil = 'Admin'
      and u.ativo and u.acesso_habilitado
  );
$$;


ALTER FUNCTION "app_private"."is_current_user_admin_ativo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."is_current_user_gerencial_ativo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select app_private.is_current_user_admin_ativo()
      or app_private.is_current_user_scoped_gerencial_ativo();
$$;


ALTER FUNCTION "app_private"."is_current_user_gerencial_ativo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."is_current_user_scoped_gerencial_ativo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select app_private.current_user_auth_role() = 'gerencial' and exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.perfil = 'Gerencial'
      and cardinality(u.ufs) > 0 and u.ativo and u.acesso_habilitado
  );
$$;


ALTER FUNCTION "app_private"."is_current_user_scoped_gerencial_ativo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app_private"."search_nfd_chaves_by_name"("p_search" "text") RETURNS TABLE("chave_acesso" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    SET "row_security" TO 'off'
    AS $$
declare
  v_search text := lower(nullif(trim(p_search), ''));
  v_is_admin boolean;
  v_ufs text[];
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Acesso gerencial ativo obrigatorio.' using errcode = '42501';
  end if;

  if v_search is null or v_search !~ '[[:alpha:]]' then
    return;
  end if;

  v_is_admin := app_private.is_current_user_admin_ativo();
  v_ufs := app_private.current_user_ufs();

  return query
  select distinct ni.chave_acesso::text
  from public.nfd_itens ni
  where (
      lower(ni.nome_abreviado) like '%' || v_search || '%'
      or lower(ni.estabelecimento) like '%' || v_search || '%'
    )
    and (
      v_is_admin
      or upper(trim(ni.uf::text)) = any(v_ufs)
    );
end
$$;


ALTER FUNCTION "app_private"."search_nfd_chaves_by_name"("p_search" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "app_private"."search_nfd_chaves_by_name"("p_search" "text") IS 'Retorna somente chaves NFD autorizadas para a pesquisa parcial por nome antes da barreira RLS; o RPC publico reaplica RLS ao carregar as notas.';



CREATE OR REPLACE FUNCTION "app_private"."search_nfd_chaves_numeric"("p_search" "text") RETURNS TABLE("chave_acesso" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    SET "row_security" TO 'off'
    AS $_$
declare
  v_search text := nullif(trim(p_search), '');
  v_numeric_search integer;
  v_is_admin boolean;
  v_ufs text[];
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Acesso gerencial ativo obrigatorio.' using errcode = '42501';
  end if;

  if v_search is null or v_search !~ '^[0-9]{1,10}$' then
    return;
  end if;

  if v_search::numeric not between 0 and 2147483647 then
    return;
  end if;

  v_numeric_search := v_search::integer;
  v_is_admin := app_private.is_current_user_admin_ativo();
  v_ufs := app_private.current_user_ufs();

  return query
  select distinct ni.chave_acesso::text
  from public.nfd_itens ni
  where (
      ni.nota_fiscal = v_numeric_search
      or ni.codigo_cliente = v_numeric_search
      or ni.nota_fiscal::text like '%' || v_search || '%'
      or ni.codigo_cliente::text like '%' || v_search || '%'
    )
    and (
      v_is_admin
      or upper(trim(ni.uf::text)) = any(v_ufs)
    );
end
$_$;


ALTER FUNCTION "app_private"."search_nfd_chaves_numeric"("p_search" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "app_private"."search_nfd_chaves_numeric"("p_search" "text") IS 'Retorna somente chaves NFD autorizadas para pesquisa numerica parcial antes da barreira RLS; o RPC publico reaplica RLS ao carregar as notas.';



GRANT USAGE ON SCHEMA "app_private" TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."can_current_user_access_loja"("p_loja_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."can_current_user_access_loja"("p_loja_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."can_current_user_access_process"("p_processo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."can_current_user_access_process"("p_processo_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."can_current_user_access_product"("p_produto_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."can_current_user_access_product"("p_produto_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."can_current_user_assign_promotor"("p_loja_id" "uuid", "p_promotor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."can_current_user_assign_promotor"("p_loja_id" "uuid", "p_promotor_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."can_current_user_manage_loja"("p_loja_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."can_current_user_manage_loja"("p_loja_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."can_current_user_manage_uf"("p_uf" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."can_current_user_manage_uf"("p_uf" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."current_user_auth_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."current_user_auth_role"() TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."current_user_uf"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."current_user_uf"() TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."current_user_ufs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."current_user_ufs"() TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."ensure_fstd_document"("p_processo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."ensure_fstd_document"("p_processo_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."fstd_processos_ensure_document"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."fstd_processos_ensure_document"() TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."is_current_user_admin_ativo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."is_current_user_admin_ativo"() TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."is_current_user_gerencial_ativo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."is_current_user_gerencial_ativo"() TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."is_current_user_scoped_gerencial_ativo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."is_current_user_scoped_gerencial_ativo"() TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."search_nfd_chaves_by_name"("p_search" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."search_nfd_chaves_by_name"("p_search" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "app_private"."search_nfd_chaves_numeric"("p_search" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "app_private"."search_nfd_chaves_numeric"("p_search" "text") TO "authenticated";
