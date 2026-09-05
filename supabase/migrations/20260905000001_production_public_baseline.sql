


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SEQUENCE IF NOT EXISTS "public"."fstd_numero_controle_seq"
    AS integer
    START WITH 100000
    INCREMENT BY 1
    MINVALUE 100000
    MAXVALUE 9999999
    CACHE 1;


ALTER SEQUENCE "public"."fstd_numero_controle_seq" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."fstd_documentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" "uuid" NOT NULL,
    "numero_controle" integer DEFAULT "nextval"('"public"."fstd_numero_controle_seq"'::"regclass") NOT NULL,
    "pdf_path" "text",
    "pdf_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fstd_documentos_numero_controle_range" CHECK ((("numero_controle" >= 100000) AND ("numero_controle" <= 9999999)))
);


ALTER TABLE "public"."fstd_documentos" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."carregar_dashboard_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_uf" "text" DEFAULT NULL::"text", "p_cidade" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $$
declare
  v_data_anterior_inicial date;
  v_result jsonb;
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Acesso gerencial ativo obrigatorio.' using errcode = '42501';
  end if;

  if p_data_inicial is null or p_data_final is null or p_data_inicial > p_data_final then
    raise exception 'Periodo da dashboard invalido.' using errcode = '22007';
  end if;

  v_data_anterior_inicial := p_data_inicial - (p_data_final - p_data_inicial + 1);

  with notes as materialized (
    select
      ni.chave_acesso::text chave_acesso,
      ni.estabelecimento::text estabelecimento,
      ni.nota_fiscal::bigint nota_fiscal,
      ni.data_emissao::date data_emissao,
      ni.data_referencia::date data_referencia,
      ni.codigo_cliente::bigint codigo_cliente,
      ni.nome_abreviado::text nome_abreviado,
      upper(trim(ni.uf::text)) uf,
      ni.cidade::text cidade,
      sum(coalesce(ni.quantidade_galinha, 0))::bigint quantidade_galinha,
      sum(coalesce(ni.quantidade_codorna, 0))::bigint quantidade_codorna,
      round(sum(coalesce(ni.valor, 0::numeric)), 2)::numeric(14, 2) valor_total
    from public.nfd_itens ni
    where coalesce(ni.data_emissao, ni.data_referencia)::date between v_data_anterior_inicial and p_data_final
      and (p_uf is null or upper(trim(ni.uf::text)) = upper(trim(p_uf)))
      and (p_cidade is null or lower(trim(ni.cidade::text)) = lower(trim(p_cidade)))
    group by ni.chave_acesso, ni.estabelecimento, ni.nota_fiscal, ni.data_emissao,
      ni.data_referencia, ni.codigo_cliente, ni.nome_abreviado, ni.uf, ni.cidade
  ), requested_keys as materialized (
    select distinct chave_acesso from notes where chave_acesso is not null
  ), requested_legacy_pairs as materialized (
    select distinct codigo_cliente::text codigo_loja, nota_fiscal::text numero_nfd
    from notes where codigo_cliente is not null and nota_fiscal is not null
  ), invoice_items as materialized (
    select ni.chave_acesso, ni.codigo_produto, ni.quantidade_galinha,
      ni.valor_galinha, ni.quantidade_codorna, ni.valor_codorna
    from public.nfd_itens ni
    join requested_keys key on key.chave_acesso = ni.chave_acesso
  ), processes as materialized (
    select p.id, p.nfd_chave_acesso, p.status, p.finalizada_em, p.created_at, p.is_avulsa
    from public.fstd_processos p
    join requested_keys key on key.chave_acesso = p.nfd_chave_acesso
  ), legacy as materialized (
    select fl.legado_id, fl.codigo_loja, fl.numero_nfd, fl.data_preenchimento,
      fl.motivo, fl.qtd_total_galinha, fl.qtd_retorno_galinha,
      fl.qtd_total_codorna, fl.qtd_retorno_codorna
    from public.fstd_legado fl
    join requested_legacy_pairs pair
      on pair.codigo_loja = fl.codigo_loja and pair.numero_nfd = fl.numero_nfd
  ), unknown as materialized (
    select d.nfd_chave_acesso, d.nfd_referencia, d.loja_codigo, d.nfd_numero
    from public.nfd_desconhecimentos d
    where d.reconhecida_em is null and (
      exists (select 1 from requested_keys key where key.chave_acesso = d.nfd_chave_acesso)
      or exists (
        select 1 from requested_legacy_pairs pair
        where concat(pair.codigo_loja, ':', pair.numero_nfd) = d.nfd_referencia
      )
    )
  ), products as materialized (
    select fp.id, fp.processo_id, fp.produto_id, fp.codigo_produto, fp.nome,
      fp.quantidade_faturada_galinha, fp.quantidade_faturada_codorna,
      fp.quantidade_retorno, fp.motivo_id, fp.status
    from public.fstd_produtos fp
    join processes process on process.id = fp.processo_id
  ), product_reasons as materialized (
    select fpm.produto_id, fpm.motivo_id, fpm.quantidade_faturada, fpm.quantidade
    from public.fstd_produto_motivos fpm
    join products product on product.id = fpm.produto_id
  ), catalog_products as materialized (
    select distinct pr.id, pr.nome, pr.categoria
    from public.produtos pr
    join products product on product.produto_id = pr.id
  ), reason_ids as materialized (
    select motivo_id from products where motivo_id is not null
    union
    select motivo_id from product_reasons where motivo_id is not null
  ), reasons as materialized (
    select md.id, md.nome
    from public.motivos_devolucao md
    join reason_ids rid on rid.motivo_id = md.id
  )
  select jsonb_build_object(
    'notes', coalesce((select jsonb_agg(to_jsonb(note)) from notes note), '[]'::jsonb),
    'invoiceItems', coalesce((select jsonb_agg(to_jsonb(item)) from invoice_items item), '[]'::jsonb),
    'processes', coalesce((select jsonb_agg(to_jsonb(process)) from processes process), '[]'::jsonb),
    'legacy', coalesce((select jsonb_agg(to_jsonb(item) order by item.legado_id) from legacy item), '[]'::jsonb),
    'unknown', coalesce((select jsonb_agg(to_jsonb(item)) from unknown item), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(product)) from products product), '[]'::jsonb),
    'productReasons', coalesce((select jsonb_agg(to_jsonb(reason)) from product_reasons reason), '[]'::jsonb),
    'catalogProducts', coalesce((select jsonb_agg(to_jsonb(product)) from catalog_products product), '[]'::jsonb),
    'reasons', coalesce((select jsonb_agg(to_jsonb(reason)) from reasons reason), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;


ALTER FUNCTION "public"."carregar_dashboard_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_uf" "text", "p_cidade" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."carregar_dashboard_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_uf" "text", "p_cidade" "text") IS 'Payload completo da Dashboard Geral em uma chamada, usando nfd_itens com RLS em vez da view nfd_notas paginada.';



CREATE OR REPLACE FUNCTION "public"."carregar_fontes_dashboard_gerencial"("p_chaves_acesso" "text"[] DEFAULT '{}'::"text"[], "p_referencias_legadas" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $$
declare
  v_result jsonb;
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Acesso gerencial ativo obrigatorio.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_referencias_legadas) <> 'array' then
    raise exception 'Referencias legadas invalidas.' using errcode = '22023';
  end if;

  with requested_keys as materialized (
    select distinct nullif(trim(chave_acesso), '') chave_acesso
    from unnest(coalesce(p_chaves_acesso, '{}'::text[])) as requested(chave_acesso)
    where nullif(trim(chave_acesso), '') is not null
  ), requested_legacy_pairs as materialized (
    select distinct nullif(trim(codigo_loja), '') codigo_loja,
      nullif(trim(numero_nfd), '') numero_nfd
    from jsonb_to_recordset(p_referencias_legadas) as requested(codigo_loja text, numero_nfd text)
    where nullif(trim(codigo_loja), '') is not null
      and nullif(trim(numero_nfd), '') is not null
  ), invoice_items as materialized (
    select ni.chave_acesso, ni.codigo_produto, ni.quantidade_galinha,
      ni.valor_galinha, ni.quantidade_codorna, ni.valor_codorna
    from public.nfd_itens ni
    join requested_keys k on k.chave_acesso = ni.chave_acesso
  ), processes as materialized (
    select p.id, p.nfd_chave_acesso, p.status, p.finalizada_em, p.created_at, p.is_avulsa
    from public.fstd_processos p
    join requested_keys k on k.chave_acesso = p.nfd_chave_acesso
  ), legacy as materialized (
    select fl.legado_id, fl.codigo_loja, fl.numero_nfd, fl.data_preenchimento,
      fl.motivo, fl.qtd_total_galinha, fl.qtd_retorno_galinha,
      fl.qtd_total_codorna, fl.qtd_retorno_codorna
    from public.fstd_legado fl
    join requested_legacy_pairs pair
      on pair.codigo_loja = fl.codigo_loja and pair.numero_nfd = fl.numero_nfd
  ), unknown as materialized (
    select d.nfd_chave_acesso, d.nfd_referencia, d.loja_codigo, d.nfd_numero
    from public.nfd_desconhecimentos d
    where d.reconhecida_em is null and (
      exists (select 1 from requested_keys k where k.chave_acesso = d.nfd_chave_acesso)
      or exists (
        select 1 from requested_legacy_pairs pair
        where concat(pair.codigo_loja, ':', pair.numero_nfd) = d.nfd_referencia
      )
    )
  ), products as materialized (
    select fp.id, fp.processo_id, fp.produto_id, fp.codigo_produto, fp.nome,
      fp.quantidade_faturada_galinha, fp.quantidade_faturada_codorna,
      fp.quantidade_retorno, fp.motivo_id, fp.status
    from public.fstd_produtos fp
    join processes p on p.id = fp.processo_id
  ), product_reasons as materialized (
    select fpm.produto_id, fpm.motivo_id, fpm.quantidade_faturada, fpm.quantidade
    from public.fstd_produto_motivos fpm
    join products fp on fp.id = fpm.produto_id
  ), catalog_products as materialized (
    select distinct pr.id, pr.nome, pr.categoria
    from public.produtos pr
    join products fp on fp.produto_id = pr.id
  ), reason_ids as materialized (
    select motivo_id from products where motivo_id is not null
    union
    select motivo_id from product_reasons where motivo_id is not null
  ), reasons as materialized (
    select md.id, md.nome
    from public.motivos_devolucao md
    join reason_ids rid on rid.motivo_id = md.id
  )
  select jsonb_build_object(
    'invoiceItems', coalesce((select jsonb_agg(to_jsonb(item)) from invoice_items item), '[]'::jsonb),
    'processes', coalesce((select jsonb_agg(to_jsonb(process)) from processes process), '[]'::jsonb),
    'legacy', coalesce((select jsonb_agg(to_jsonb(item) order by item.legado_id) from legacy item), '[]'::jsonb),
    'unknown', coalesce((select jsonb_agg(to_jsonb(item)) from unknown item), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(product)) from products product), '[]'::jsonb),
    'productReasons', coalesce((select jsonb_agg(to_jsonb(reason)) from product_reasons reason), '[]'::jsonb),
    'catalogProducts', coalesce((select jsonb_agg(to_jsonb(product)) from catalog_products product), '[]'::jsonb),
    'reasons', coalesce((select jsonb_agg(to_jsonb(reason)) from reasons reason), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;


ALTER FUNCTION "public"."carregar_fontes_dashboard_gerencial"("p_chaves_acesso" "text"[], "p_referencias_legadas" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."carregar_fontes_dashboard_gerencial"("p_chaves_acesso" "text"[], "p_referencias_legadas" "jsonb") IS 'Agrupa as fontes da Dashboard Geral em uma unica chamada, preservando RLS e o escopo do usuario autenticado.';



CREATE TABLE IF NOT EXISTS "public"."fstd_produtos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" "uuid" NOT NULL,
    "produto_id" "uuid",
    "codigo_produto" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "imagem_url" "text",
    "quantidade_faturada_galinha" integer DEFAULT 0 NOT NULL,
    "quantidade_faturada_codorna" integer DEFAULT 0 NOT NULL,
    "quantidade_retorno" integer DEFAULT 0 NOT NULL,
    "motivo_id" "uuid",
    "observacao" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "concluido_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fotos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "fstd_produtos_quantidade_faturada_codorna_check" CHECK (("quantidade_faturada_codorna" >= 0)),
    CONSTRAINT "fstd_produtos_quantidade_faturada_galinha_check" CHECK (("quantidade_faturada_galinha" >= 0)),
    CONSTRAINT "fstd_produtos_quantidade_retorno_check" CHECK (("quantidade_retorno" >= 0)),
    CONSTRAINT "fstd_produtos_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'concluido'::"text"])))
);


ALTER TABLE "public"."fstd_produtos" OWNER TO "postgres";


COMMENT ON TABLE "public"."fstd_produtos" IS 'Produtos de uma NFD que precisam ser tratados individualmente no FSTD.';



COMMENT ON COLUMN "public"."fstd_produtos"."fotos" IS 'Caminhos dos arquivos de evidencia armazenados no bucket privado fstd-fotos.';



CREATE OR REPLACE FUNCTION "public"."concluir_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_observacao" "text" DEFAULT NULL::"text", "p_fotos" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "public"."fstd_produtos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_item public.fstd_produtos;
  v_processo_id uuid;
  v_total_faturado integer;
  v_total_divisoes_faturado integer;
  v_total_retorno integer;
  v_divisao_count integer;
  v_photo_prefix text;
begin
  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = v_auth_user_id
    and u.perfil in ('Promotor', 'Gerencial', 'Admin')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  if jsonb_typeof(coalesce(p_divisoes, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_divisoes, '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos um motivo e um faturado.';
  end if;

  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' then
    raise exception 'As fotos devem ser enviadas como uma lista.';
  end if;


  if jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) = 0 then
    raise exception 'Ao menos uma foto e obrigatoria para concluir o FSTD.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    where division.motivo_id is null
      or division.quantidade_faturada is null
      or division.quantidade_retorno is null
  ) then
    raise exception 'Motivo, faturado e retorno sao obrigatorios em todos os campos.';
  end if;


  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    where division.motivo_id is null
      or coalesce(division.quantidade_faturada, division.quantidade, 0) <= 0
      or coalesce(division.quantidade_retorno, division.quantidade, 0) < 0
      or coalesce(division.quantidade_retorno, division.quantidade, 0)
        > coalesce(division.quantidade_faturada, division.quantidade, 0)
  ) then
    raise exception 'Cada motivo deve possuir faturado maior que zero e retorno entre zero e o faturado.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    left join public.motivos_devolucao as m
      on m.id = division.motivo_id
     and m.ativo is true
    where m.id is null
  ) then
    raise exception 'Motivo de devolucao invalido ou inativo.';
  end if;

  if exists (
    select division.motivo_id
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    group by division.motivo_id
    having count(*) > 1
  ) then
    raise exception 'Use um motivo diferente para cada divisao da quantidade.';
  end if;

  select fp.*
  into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and fp.status = 'pendente'
    and p.status = 'em_andamento'
    and (
      app_private.can_current_user_access_product(p_produto_id)
      or (
        p.promotor_id = v_promotor_id
        and exists (
          select 1
          from public.loja_promotores as lp
          where lp.loja_id = p.loja_id
            and lp.promotor_id = v_promotor_id
        )
      )
    )
  for update of fp, p;

  if v_item.id is null then
    raise exception 'Produto de FSTD nao encontrado, ja concluido ou processo finalizado.';
  end if;

  v_processo_id := v_item.processo_id;
  v_photo_prefix := v_auth_user_id::text || '/' || v_processo_id::text || '/';

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_fotos, '[]'::jsonb)) as uploaded(path)
    where left(uploaded.path, length(v_photo_prefix)) <> v_photo_prefix
      or not exists (
        select 1
        from storage.objects as object
        where object.bucket_id = 'fstd-fotos'
          and object.name = uploaded.path
      )
  ) then
    raise exception 'As fotos devem existir e pertencer ao usuario e processo autenticados.';
  end if;

  v_total_faturado :=
    v_item.quantidade_faturada_galinha + v_item.quantidade_faturada_codorna;

  select
    coalesce(sum(coalesce(division.quantidade_faturada, division.quantidade, 0)), 0),
    coalesce(sum(coalesce(division.quantidade_retorno, division.quantidade, 0)), 0),
    count(*)
  into v_total_divisoes_faturado, v_total_retorno, v_divisao_count
  from jsonb_to_recordset(p_divisoes) as division(
    motivo_id uuid,
    quantidade_faturada integer,
    quantidade_retorno integer,
    quantidade integer
  );

  if v_total_divisoes_faturado <> v_total_faturado then
    raise exception
      'A soma dos faturados por motivo deve ser exatamente igual ao faturado geral (% ovos).',
      v_total_faturado;
  end if;

  insert into public.fstd_produto_motivos (
    produto_id,
    motivo_id,
    quantidade_faturada,
    quantidade
  )
  select
    p_produto_id,
    division.motivo_id,
    coalesce(division.quantidade_faturada, division.quantidade),
    coalesce(division.quantidade_retorno, division.quantidade)
  from jsonb_to_recordset(p_divisoes) as division(
    motivo_id uuid,
    quantidade_faturada integer,
    quantidade_retorno integer,
    quantidade integer
  );

  update public.fstd_produtos
  set
    motivo_id = case
      when v_divisao_count = 1 then (p_divisoes->0->>'motivo_id')::uuid
      else null
    end,
    quantidade_retorno = v_total_retorno,
    observacao = nullif(btrim(p_observacao), ''),
    fotos = coalesce(p_fotos, '[]'::jsonb),
    status = 'concluido',
    concluido_em = now(),
    updated_at = now()
  where id = p_produto_id
  returning * into v_item;

  return v_item;
end;
$$;


ALTER FUNCTION "public"."concluir_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_observacao" "text", "p_fotos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."concluir_fstd_produto_avulso"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text" DEFAULT NULL::"text", "p_fotos" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "public"."fstd_produtos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_promotor_id uuid;
  v_item public.fstd_produtos;
begin
  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Promotor'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  if p_quantidade_faturada_galinha is null
    or p_quantidade_faturada_codorna is null
    or p_quantidade_faturada_galinha < 0
    or p_quantidade_faturada_codorna < 0
    or p_quantidade_faturada_galinha + p_quantidade_faturada_codorna <= 0 then
    raise exception 'Informe um faturado geral maior que zero.';
  end if;

  select fp.*
  into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and fp.status = 'pendente'
    and p.is_avulsa is true
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
    and exists (
      select 1
      from public.loja_promotores as lp
      where lp.loja_id = p.loja_id
        and lp.promotor_id = v_promotor_id
    )
  for update of fp, p;

  if v_item.id is null then
    raise exception 'Produto avulso nao encontrado, nao autorizado ou ja finalizado.';
  end if;

  update public.fstd_produtos
  set
    quantidade_faturada_galinha = p_quantidade_faturada_galinha,
    quantidade_faturada_codorna = p_quantidade_faturada_codorna,
    updated_at = now()
  where id = p_produto_id;

  return public.concluir_fstd_produto(
    p_produto_id,
    p_divisoes,
    p_observacao,
    p_fotos
  );
end;
$$;


ALTER FUNCTION "public"."concluir_fstd_produto_avulso"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text", "p_fotos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."conferir_fstd_avulsas"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_processo record;
  v_nfd record;
  v_numero_normalizado text;
  v_mismatches jsonb;
  v_quantity_mismatches jsonb;
  v_conferidas integer := 0;
  v_divergentes integer := 0;
  v_pendentes integer := 0;
begin
  for v_processo in
    select
      p.id,
      p.nfd_numero,
      p.nfd_data_emissao,
      p.nfd_valor,
      p.loja_id,
      l.codigo::text as loja_codigo
    from public.fstd_processos as p
    join public.lojas as l on l.id = p.loja_id
    where p.is_avulsa is true
      and p.status <> 'cancelada'
  loop
    v_numero_normalizado := nullif(
      ltrim(btrim(v_processo.nfd_numero), '0'),
      ''
    );
    v_numero_normalizado := coalesce(v_numero_normalizado, '0');

    select n.*
    into v_nfd
    from public.nfd_notas as n
    where n.nota_fiscal::text = v_numero_normalizado
    order by
      case
        when btrim(coalesce(n.codigo_cliente::text, '')) = btrim(v_processo.loja_codigo)
          then 0
        else 1
      end,
      n.data_emissao desc nulls last
    limit 1;

    if not found then
      update public.fstd_processos
      set
        conferencia_status = 'pendente',
        conferencia_detalhes = jsonb_build_object(
          'status', 'aguardando_api',
          'mensagem', 'A NFD ainda nao foi encontrada na base importada da API.',
          'numero_nfd', v_processo.nfd_numero
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = null,
        updated_at = now()
      where id = v_processo.id;

      v_pendentes := v_pendentes + 1;
      continue;
    end if;

    v_mismatches := '[]'::jsonb;

    if btrim(coalesce(v_nfd.codigo_cliente::text, ''))
      is distinct from btrim(v_processo.loja_codigo) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'codigo_loja',
        'informado', v_processo.loja_codigo,
        'api', v_nfd.codigo_cliente
      ));
    end if;

    if v_processo.nfd_data_emissao is null
      or v_nfd.data_emissao is null
      or v_processo.nfd_data_emissao is distinct from v_nfd.data_emissao then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'data_emissao',
        'informado', v_processo.nfd_data_emissao,
        'api', v_nfd.data_emissao
      ));
    end if;

    if v_processo.nfd_valor is null
      or v_nfd.valor_total is null
      or abs(v_processo.nfd_valor - v_nfd.valor_total) > 0.01 then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'valor',
        'informado', v_processo.nfd_valor,
        'api', v_nfd.valor_total
      ));
    end if;

    if exists (
      select 1
      from public.fstd_produtos as fp
      where fp.processo_id = v_processo.id
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
          where (
            fp.produto_id is not null
            and exists (
              select 1
              from public.produtos_expandidos as catalog
              where catalog.produto_id = fp.produto_id
                and upper(btrim(catalog.codigo_produto)) = upper(btrim(item->>'codigo_produto'))
            )
          )
          or (
            fp.produto_id is null
            and upper(btrim(item->>'codigo_produto')) = upper(btrim(fp.codigo_produto))
          )
        )
    ) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'produtos',
        'mensagem', 'Existe produto na FSTD que nao foi encontrado na NFD da API.'
      ));
    end if;

    if exists (
      select 1
      from (
        select distinct upper(btrim(item->>'codigo_produto')) as codigo_produto
        from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
      ) as api_product
      where not exists (
        select 1
        from public.fstd_produtos as fp
        where fp.processo_id = v_processo.id
          and (
            (
              fp.produto_id is not null
              and exists (
                select 1
                from public.produtos_expandidos as catalog
                where catalog.produto_id = fp.produto_id
                  and upper(btrim(catalog.codigo_produto)) = api_product.codigo_produto
              )
            )
            or (
              fp.produto_id is null
              and upper(btrim(fp.codigo_produto)) = api_product.codigo_produto
            )
          )
      )
    ) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'produtos',
        'mensagem', 'Existe produto na NFD da API que nao foi adicionado na FSTD.'
      ));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo_produto', fp.codigo_produto,
      'fstd_galinha', fp.quantidade_faturada_galinha,
      'api_galinha', api_product.quantidade_galinha,
      'fstd_codorna', fp.quantidade_faturada_codorna,
      'api_codorna', api_product.quantidade_codorna
    )), '[]'::jsonb)
    into v_quantity_mismatches
    from public.fstd_produtos as fp
    left join lateral (
      select
        coalesce(sum(coalesce((item->>'quantidade_galinha')::numeric, 0)), 0)::integer as quantidade_galinha,
        coalesce(sum(coalesce((item->>'quantidade_codorna')::numeric, 0)), 0)::integer as quantidade_codorna
      from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
      where (
        fp.produto_id is not null
        and exists (
          select 1
          from public.produtos_expandidos as catalog
          where catalog.produto_id = fp.produto_id
            and upper(btrim(catalog.codigo_produto)) = upper(btrim(item->>'codigo_produto'))
        )
      )
      or (
        fp.produto_id is null
        and upper(btrim(item->>'codigo_produto')) = upper(btrim(fp.codigo_produto))
      )
    ) as api_product on true
    where fp.processo_id = v_processo.id
      and (
        fp.quantidade_faturada_galinha <> api_product.quantidade_galinha
        or fp.quantidade_faturada_codorna <> api_product.quantidade_codorna
      );

    if jsonb_array_length(v_quantity_mismatches) > 0 then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'quantidades',
        'itens', v_quantity_mismatches
      ));
    end if;

    if jsonb_array_length(v_mismatches) > 0 then
      update public.fstd_processos
      set
        conferencia_status = 'divergente',
        conferencia_detalhes = jsonb_build_object(
          'numero_nfd', v_processo.nfd_numero,
          'api_chave_acesso', v_nfd.chave_acesso,
          'divergencias', v_mismatches
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = v_nfd.chave_acesso,
        updated_at = now()
      where id = v_processo.id;

      v_divergentes := v_divergentes + 1;
    else
      update public.fstd_processos
      set
        conferencia_status = 'conferida',
        conferencia_detalhes = jsonb_build_object(
          'numero_nfd', v_processo.nfd_numero,
          'api_chave_acesso', v_nfd.chave_acesso,
          'mensagem', 'NFD avulsa conferida com sucesso.'
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = v_nfd.chave_acesso,
        updated_at = now()
      where id = v_processo.id;

      v_conferidas := v_conferidas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'conferidas', v_conferidas,
    'divergentes', v_divergentes,
    'pendentes', v_pendentes
  );
end;
$$;


ALTER FUNCTION "public"."conferir_fstd_avulsas"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "perfil" "text" NOT NULL,
    "estado" "text" NOT NULL,
    "fotos_habilitadas" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_user_id" "uuid",
    "ativo" boolean DEFAULT true NOT NULL,
    "foto_url" "text",
    "acesso_habilitado" boolean DEFAULT false NOT NULL,
    "ufs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "last_access_at" timestamp with time zone,
    CONSTRAINT "usuarios_estado_check" CHECK (("estado" = ANY (ARRAY['CE'::"text", 'MA'::"text", 'BA'::"text", 'PA'::"text", 'PB'::"text", 'PI'::"text", 'PE'::"text", 'AP'::"text", 'SE'::"text", 'RN'::"text", 'AL'::"text"]))),
    CONSTRAINT "usuarios_perfil_check" CHECK (("perfil" = ANY (ARRAY['Promotor'::"text", 'Gerencial'::"text", 'Admin'::"text"]))),
    CONSTRAINT "usuarios_ufs_scope_check" CHECK ((("ufs" <@ ARRAY['CE'::"text", 'MA'::"text", 'BA'::"text", 'PA'::"text", 'PB'::"text", 'PI'::"text", 'PE'::"text", 'AP'::"text", 'SE'::"text", 'RN'::"text", 'AL'::"text"]) AND ((("perfil" = 'Admin'::"text") AND ("cardinality"("ufs") = 0)) OR (("perfil" = 'Gerencial'::"text") AND ("cardinality"("ufs") >= 1) AND ("estado" = "ufs"[1])) OR (("perfil" = 'Promotor'::"text") AND ("cardinality"("ufs") = 1) AND ("estado" = "ufs"[1])))))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


COMMENT ON TABLE "public"."usuarios" IS 'Usuarios do FSTD Digital e do painel Gerencial; perfis operacionais ativos: Promotor, Gerencial por UF e Admin global.';



COMMENT ON COLUMN "public"."usuarios"."perfil" IS 'Perfil operacional usado para separar experiencias entre Promotor e Entregador.';



COMMENT ON COLUMN "public"."usuarios"."fotos_habilitadas" IS 'Controla se o usuario pode utilizar o modulo de fotos.';



COMMENT ON COLUMN "public"."usuarios"."ativo" IS 'Coluna legada mantida por compatibilidade; status visual usa last_access_at nos ultimos 30 dias.';



COMMENT ON COLUMN "public"."usuarios"."acesso_habilitado" IS 'Coluna legada mantida por compatibilidade; acesso existe enquanto auth_user_id estiver associado.';



COMMENT ON COLUMN "public"."usuarios"."ufs" IS 'UFs operacionais: vazia para Admin, uma ou mais para Gerencial e exatamente uma para Promotor.';



COMMENT ON COLUMN "public"."usuarios"."last_access_at" IS 'Ultima abertura validada da aplicacao pelo usuario; nao representa autenticacao ou renovacao de sessao.';



CREATE OR REPLACE FUNCTION "public"."create_gerencial_user"("p_auth_user_id" "uuid", "p_nome" "text", "p_email" "text") RETURNS "public"."usuarios"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
declare
  v_nome text := nullif(btrim(p_nome), '');
  v_email text := lower(nullif(btrim(p_email), ''));
  v_usuario public.usuarios;
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Apenas Gerenciais ativos podem criar Gerenciais.';
  end if;

  if p_auth_user_id is null then
    raise exception 'Usuario de Auth invalido.';
  end if;

  if v_nome is null or char_length(v_nome) < 4 then
    raise exception 'Informe um nome valido.';
  end if;

  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail valido.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_auth_user_id
      and lower(email) = v_email
      and deleted_at is null
  ) then
    raise exception 'Usuario de Auth nao encontrado para este e-mail.';
  end if;

  if exists (
    select 1
    from public.usuarios
    where lower(email) = v_email
      and auth_user_id is distinct from p_auth_user_id
  ) then
    raise exception 'Este e-mail ja esta cadastrado.';
  end if;

  insert into public.usuarios (
    auth_user_id,
    nome,
    email,
    perfil,
    estado,
    fotos_habilitadas,
    ativo
  )
  values (
    p_auth_user_id,
    v_nome,
    v_email,
    'Gerencial',
    'CE',
    false,
    true
  )
  on conflict (email) do update
  set
    auth_user_id = excluded.auth_user_id,
    nome = excluded.nome,
    perfil = 'Gerencial',
    estado = 'CE',
    fotos_habilitadas = false,
    ativo = true
  returning * into v_usuario;

  update auth.users
  set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'gerencial'),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('nome', v_nome),
    updated_at = now()
  where id = p_auth_user_id;

  return v_usuario;
end;
$_$;


ALTER FUNCTION "public"."create_gerencial_user"("p_auth_user_id" "uuid", "p_nome" "text", "p_email" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nfd_desconhecimentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "nfd_referencia" "text" NOT NULL,
    "nfd_chave_acesso" "text",
    "nfd_numero" "text" NOT NULL,
    "loja_codigo" "text",
    "comentario" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reconhecida_em" timestamp with time zone,
    "reconhecida_por" "uuid",
    CONSTRAINT "nfd_desconhecimentos_comentario_check" CHECK (("length"("btrim"("comentario")) > 0))
);


ALTER TABLE "public"."nfd_desconhecimentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."nfd_desconhecimentos" IS 'Histórico de declarações de promotores que não reconhecem a procedência de uma NFD.';



COMMENT ON COLUMN "public"."nfd_desconhecimentos"."usuario_id" IS 'Usuario responsavel pelo registro do desconhecimento, independentemente do perfil operacional.';



COMMENT ON COLUMN "public"."nfd_desconhecimentos"."nfd_referencia" IS 'Identificador usado pelo app para localizar a NFD, normalmente codigo_cliente:nota_fiscal.';



COMMENT ON COLUMN "public"."nfd_desconhecimentos"."nfd_chave_acesso" IS 'Chave de acesso da NFD na origem/importação, quando disponível.';



COMMENT ON COLUMN "public"."nfd_desconhecimentos"."reconhecida_em" IS 'Momento em que um usuario Gerencial voltou a reconhecer a NFD.';



COMMENT ON COLUMN "public"."nfd_desconhecimentos"."reconhecida_por" IS 'Usuario Gerencial que reverteu a marcacao de NFD desconhecida.';



CREATE OR REPLACE FUNCTION "public"."desconhecer_nfd_gerencial"("p_loja_id" "uuid", "p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_loja_codigo" "text", "p_comentario" "text" DEFAULT 'NFD marcada como desconhecida pelo usuÃ¡rio Gerencial.'::"text") RETURNS "public"."nfd_desconhecimentos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_usuario_id uuid;
  v_result public.nfd_desconhecimentos;
begin
  select u.id into v_usuario_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil in ('Admin', 'Gerencial')
    and u.ativo is true
    and u.acesso_habilitado is true
    and app_private.can_current_user_access_loja(p_loja_id)
  limit 1;

  if v_usuario_id is null then
    raise exception 'UsuÃ¡rio Gerencial ativo nÃ£o encontrado.';
  end if;
  if p_loja_id is null
    or nullif(btrim(coalesce(p_nfd_referencia, '')), '') is null
    or nullif(btrim(coalesce(p_nfd_numero, '')), '') is null then
    raise exception 'Loja e identificaÃ§Ã£o da NFD sÃ£o obrigatÃ³rias.';
  end if;

  insert into public.nfd_desconhecimentos (
    loja_id, usuario_id, nfd_referencia, nfd_chave_acesso,
    nfd_numero, loja_codigo, comentario
  ) values (
    p_loja_id, v_usuario_id, btrim(p_nfd_referencia),
    nullif(btrim(p_nfd_chave_acesso), ''), btrim(p_nfd_numero),
    nullif(btrim(p_loja_codigo), ''),
    coalesce(nullif(btrim(p_comentario), ''), 'NFD marcada como desconhecida pelo usuÃ¡rio Gerencial.')
  ) returning * into v_result;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."desconhecer_nfd_gerencial"("p_loja_id" "uuid", "p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_loja_codigo" "text", "p_comentario" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."editar_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text" DEFAULT NULL::"text", "p_fotos" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "public"."fstd_produtos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_item public.fstd_produtos;
  v_processo_id uuid;
  v_total_faturado integer;
  v_total_divisoes_faturado integer;
  v_total_retorno integer;
  v_photo_prefix text;
begin
  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = v_auth_user_id
    and u.perfil in ('Promotor', 'Gerencial', 'Admin')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  if p_quantidade_faturada_galinha is null
    or p_quantidade_faturada_codorna is null
    or p_quantidade_faturada_galinha < 0
    or p_quantidade_faturada_codorna < 0 then
    raise exception 'As quantidades faturadas devem ser numeros inteiros nao negativos.';
  end if;

  v_total_faturado :=
    p_quantidade_faturada_galinha + p_quantidade_faturada_codorna;

  if v_total_faturado <= 0 then
    raise exception 'O faturado geral deve ser maior que zero.';
  end if;

  if jsonb_typeof(coalesce(p_divisoes, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_divisoes, '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos um motivo e um faturado.';
  end if;

  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' then
    raise exception 'As fotos devem ser enviadas como uma lista.';
  end if;


  if jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) = 0 then
    raise exception 'Ao menos uma foto e obrigatoria para concluir o FSTD.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    where division.motivo_id is null
      or division.quantidade_faturada is null
      or division.quantidade_retorno is null
  ) then
    raise exception 'Motivo, faturado e retorno sao obrigatorios em todos os campos.';
  end if;


  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    where division.motivo_id is null
      or coalesce(division.quantidade_faturada, division.quantidade, 0) <= 0
      or coalesce(division.quantidade_retorno, division.quantidade, 0) < 0
      or coalesce(division.quantidade_retorno, division.quantidade, 0)
        > coalesce(division.quantidade_faturada, division.quantidade, 0)
  ) then
    raise exception 'Cada motivo deve possuir faturado maior que zero e retorno entre zero e o faturado.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    left join public.motivos_devolucao as m
      on m.id = division.motivo_id
     and m.ativo is true
    where m.id is null
  ) then
    raise exception 'Motivo de devolucao invalido ou inativo.';
  end if;

  if exists (
    select division.motivo_id
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    group by division.motivo_id
    having count(*) > 1
  ) then
    raise exception 'Use um motivo diferente para cada divisao da quantidade.';
  end if;

  select fp.*
  into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and fp.status = 'concluido'
    and (
      (
        app_private.can_current_user_access_product(p_produto_id)
        and p.status in ('em_andamento', 'concluida')
      )
      or (
        p.status = 'em_andamento'
        and p.promotor_id = v_promotor_id
        and exists (
          select 1
          from public.loja_promotores as lp
          where lp.loja_id = p.loja_id
            and lp.promotor_id = v_promotor_id
        )
      )
    )
  for update of fp, p;

  if v_item.id is null then
    raise exception 'Produto de FSTD nao encontrado, nao concluido ou processo finalizado.';
  end if;

  v_processo_id := v_item.processo_id;
  v_photo_prefix := v_auth_user_id::text || '/' || v_processo_id::text || '/';

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_fotos, '[]'::jsonb)) as uploaded(path)
    where (
        not app_private.can_current_user_access_product(p_produto_id)
        and left(uploaded.path, length(v_photo_prefix)) <> v_photo_prefix
      )
      or not exists (
        select 1
        from storage.objects as object
        where object.bucket_id = 'fstd-fotos'
          and object.name = uploaded.path
      )
  ) then
    raise exception 'As fotos devem existir e pertencer ao usuario e processo autenticados.';
  end if;

  select
    coalesce(sum(coalesce(division.quantidade_faturada, division.quantidade, 0)), 0),
    coalesce(sum(coalesce(division.quantidade_retorno, division.quantidade, 0)), 0)
  into v_total_divisoes_faturado, v_total_retorno
  from jsonb_to_recordset(p_divisoes) as division(
    motivo_id uuid,
    quantidade_faturada integer,
    quantidade_retorno integer,
    quantidade integer
  );

  if v_total_divisoes_faturado <> v_total_faturado then
    raise exception
      'A soma dos faturados por motivo deve ser exatamente igual ao novo faturado geral (% ovos).',
      v_total_faturado;
  end if;

  delete from public.fstd_produto_motivos
  where produto_id = p_produto_id;

  insert into public.fstd_produto_motivos (
    produto_id,
    motivo_id,
    quantidade_faturada,
    quantidade
  )
  select
    p_produto_id,
    division.motivo_id,
    coalesce(division.quantidade_faturada, division.quantidade),
    coalesce(division.quantidade_retorno, division.quantidade)
  from jsonb_to_recordset(p_divisoes) as division(
    motivo_id uuid,
    quantidade_faturada integer,
    quantidade_retorno integer,
    quantidade integer
  );

  update public.fstd_produtos
  set
    quantidade_faturada_galinha = p_quantidade_faturada_galinha,
    quantidade_faturada_codorna = p_quantidade_faturada_codorna,
    motivo_id = case
      when jsonb_array_length(p_divisoes) = 1 then (p_divisoes->0->>'motivo_id')::uuid
      else null
    end,
    quantidade_retorno = v_total_retorno,
    observacao = nullif(btrim(p_observacao), ''),
    fotos = coalesce(p_fotos, '[]'::jsonb),
    concluido_em = now(),
    updated_at = now()
  where id = p_produto_id
  returning * into v_item;

  if exists (
    select 1
    from public.fstd_processos as p
    where p.id = v_processo_id
      and p.status = 'concluida'
  ) then
    update public.fstd_processos
    set updated_at = now()
    where id = v_processo_id;

    update public.fstd_documentos
    set pdf_metadata = coalesce(pdf_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'template_version', 0,
            'invalidated_by', 'gerencial_edit',
            'invalidated_at', now()
          ),
        updated_at = now()
    where processo_id = v_processo_id;
  end if;

  return v_item;
end;
$$;


ALTER FUNCTION "public"."editar_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text", "p_fotos" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fstd_processos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nfd_chave_acesso" "text" NOT NULL,
    "nfd_numero" "text" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "promotor_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'em_andamento'::"text" NOT NULL,
    "finalizada_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_avulsa" boolean DEFAULT false NOT NULL,
    "nfd_data_emissao" "date",
    "nfd_valor" numeric(14,2),
    "conferencia_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "conferencia_detalhes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "conferencia_em" timestamp with time zone,
    "api_nfd_chave_acesso" "text",
    CONSTRAINT "fstd_processos_conferencia_status_check" CHECK (("conferencia_status" = ANY (ARRAY['pendente'::"text", 'conferida'::"text", 'divergente'::"text"]))),
    CONSTRAINT "fstd_processos_status_check" CHECK (("status" = ANY (ARRAY['em_andamento'::"text", 'concluida'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."fstd_processos" OWNER TO "postgres";


COMMENT ON TABLE "public"."fstd_processos" IS 'Processos de FSTD por NFD para o fluxo de conclusao produto a produto.';



COMMENT ON COLUMN "public"."fstd_processos"."is_avulsa" IS 'Identifica processos criados manualmente a partir de uma NFD fisica.';



COMMENT ON COLUMN "public"."fstd_processos"."nfd_data_emissao" IS 'Data informada na criacao da NFD avulsa.';



COMMENT ON COLUMN "public"."fstd_processos"."nfd_valor" IS 'Valor informado na criacao da NFD avulsa.';



COMMENT ON COLUMN "public"."fstd_processos"."conferencia_status" IS 'Resultado da conferencia entre a FSTD avulsa e a NFD importada da API.';



COMMENT ON COLUMN "public"."fstd_processos"."conferencia_detalhes" IS 'Campos divergentes ou informacoes da ultima tentativa de conferencia.';



COMMENT ON COLUMN "public"."fstd_processos"."conferencia_em" IS 'Data e hora da ultima tentativa de conferencia.';



COMMENT ON COLUMN "public"."fstd_processos"."api_nfd_chave_acesso" IS 'Chave de acesso encontrada na NFD importada pela API.';



CREATE OR REPLACE FUNCTION "public"."finalizar_fstd_produtos"("p_processo_id" "uuid") RETURNS "public"."fstd_processos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_promotor_id uuid;
  v_processo public.fstd_processos;
begin
  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil in ('Promotor', 'Gerencial', 'Admin')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  select p.*
  into v_processo
  from public.fstd_processos as p
  where p.id = p_processo_id
    and p.status = 'em_andamento'
    and (
      app_private.can_current_user_access_process(p_processo_id)
      or (
        p.promotor_id = v_promotor_id
        and exists (
          select 1
          from public.loja_promotores as lp
          where lp.loja_id = p.loja_id
            and lp.promotor_id = v_promotor_id
        )
      )
    )
  for update;

  if v_processo.id is null then
    raise exception 'Processo FSTD nao encontrado, nao autorizado ou ja finalizado.';
  end if;

  if not exists (
    select 1
    from public.fstd_produtos as fp
    where fp.processo_id = p_processo_id
  ) then
    raise exception 'Nenhum produto foi encontrado neste processo FSTD.';
  end if;

  if exists (
    select 1
    from public.fstd_produtos as fp
    where fp.processo_id = p_processo_id
      and fp.status <> 'concluido'
  ) then
    raise exception 'Conclua todos os produtos antes de finalizar a NFD.';
  end if;

  update public.fstd_processos
  set
    status = 'concluida',
    finalizada_em = now(),
    updated_at = now()
  where id = p_processo_id
  returning * into v_processo;

  return v_processo;
end;
$$;


ALTER FUNCTION "public"."finalizar_fstd_produtos"("p_processo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fstd_processos_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."fstd_processos_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_fstd_document"("p_processo_id" "uuid") RETURNS "public"."fstd_documentos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = p_processo_id
      and p.status = 'concluida'
      and (
        app_private.can_current_user_access_process(p.id)
        or (u.auth_user_id = (select auth.uid()) and u.ativo is true)
      )
  ) then
    raise exception 'FSTD concluida nao encontrada ou sem permissao.' using errcode = '42501';
  end if;

  return app_private.ensure_fstd_document(p_processo_id);
end;
$$;


ALTER FUNCTION "public"."get_or_create_fstd_document"("p_processo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."iniciar_fstd_avulsa"("p_loja_id" "uuid", "p_nfd_numero" "text", "p_nfd_valor" numeric, "p_nfd_data_emissao" "date", "p_produtos" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_processo public.fstd_processos;
  v_numero text := nullif(pg_catalog.btrim(p_nfd_numero), '');
  v_valid_products integer;
  v_total_products integer;
begin
  if v_auth_user_id is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;

  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = v_auth_user_id
    and u.perfil = 'Promotor'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  if not exists (
    select 1
    from public.loja_promotores as lp
    where lp.loja_id = p_loja_id
      and lp.promotor_id = v_promotor_id
  ) then
    raise exception 'Loja nao atribuida ao promotor autenticado.';
  end if;

  if v_numero is null then
    raise exception 'Codigo da NFD obrigatorio.';
  end if;

  if p_nfd_valor is null or p_nfd_valor < 0 then
    raise exception 'Informe um valor de NFD valido.';
  end if;

  if p_nfd_data_emissao is null then
    raise exception 'Data de emissao da NFD obrigatoria.';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_produtos, '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_array_length(coalesce(p_produtos, '[]'::jsonb)) = 0 then
    raise exception 'Selecione ao menos um produto para a NFD avulsa.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
    where nullif(pg_catalog.btrim(item.codigo_produto), '') is null
  ) then
    raise exception 'Produto invalido na NFD avulsa.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
    where not exists (
      select 1
      from public.produtos_expandidos as catalog
      where catalog.codigo_produto = pg_catalog.upper(pg_catalog.btrim(item.codigo_produto))
        and catalog.status is true
    )
  ) then
    raise exception 'Um ou mais produtos selecionados nao estao disponiveis no catalogo.';
  end if;

  select count(*)
  into v_valid_products
  from (
    select distinct pg_catalog.upper(pg_catalog.btrim(item.codigo_produto)) as codigo_produto
    from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
  ) as requested
  join public.produtos_expandidos as catalog
    on catalog.codigo_produto = requested.codigo_produto
   and catalog.status is true;

  if v_valid_products = 0 then
    raise exception 'Nenhum produto valido foi selecionado para a NFD avulsa.';
  end if;

  select p.*
  into v_processo
  from public.fstd_processos as p
  where p.is_avulsa is true
    and p.loja_id = p_loja_id
    and p.nfd_numero = v_numero
    and p.status <> 'cancelada'
  for update;

  if v_processo.id is not null and v_processo.promotor_id <> v_promotor_id then
    raise exception 'Esta NFD avulsa ja pertence a outro Promotor.';
  end if;

  if v_processo.status = 'concluida' then
    raise exception 'Esta NFD avulsa ja foi finalizada.';
  end if;

  if v_processo.id is null then
    insert into public.fstd_processos (
      nfd_chave_acesso,
      nfd_numero,
      loja_id,
      promotor_id,
      is_avulsa,
      nfd_data_emissao,
      nfd_valor
    )
    values (
      'AVULSA:' || pg_catalog.md5(v_promotor_id::text || ':' || p_loja_id::text || ':' || v_numero),
      v_numero,
      p_loja_id,
      v_promotor_id,
      true,
      p_nfd_data_emissao,
      round(p_nfd_valor, 2)
    )
    returning * into v_processo;
  else
    update public.fstd_processos
    set
      nfd_data_emissao = p_nfd_data_emissao,
      nfd_valor = round(p_nfd_valor, 2),
      updated_at = now()
    where id = v_processo.id
    returning * into v_processo;
  end if;

  insert into public.fstd_produtos (
    processo_id,
    produto_id,
    codigo_produto,
    nome,
    descricao,
    imagem_url
  )
  select
    selected.processo_id,
    selected.produto_id,
    selected.codigo_produto,
    selected.nome,
    selected.nome,
    selected.imagem_url
  from (
    select distinct on (catalog.produto_id)
      v_processo.id as processo_id,
      catalog.produto_id,
      catalog.codigo_produto,
      catalog.nome,
      catalog.imagem_url
    from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
    join public.produtos_expandidos as catalog
      on catalog.codigo_produto = pg_catalog.upper(pg_catalog.btrim(item.codigo_produto))
     and catalog.status is true
    order by catalog.produto_id, catalog.codigo_produto
  ) as selected
  where not exists (
    select 1
    from public.fstd_produtos as existing
    where existing.processo_id = selected.processo_id
      and existing.produto_id = selected.produto_id
  )
  on conflict (processo_id, codigo_produto) do nothing;

  select count(*)
  into v_total_products
  from public.fstd_produtos as fp
  where fp.processo_id = v_processo.id;

  if v_total_products = 0 then
    raise exception 'Nenhum produto foi adicionado a NFD avulsa.';
  end if;

  return v_processo.id;
end;
$$;


ALTER FUNCTION "public"."iniciar_fstd_avulsa"("p_loja_id" "uuid", "p_nfd_numero" "text", "p_nfd_valor" numeric, "p_nfd_data_emissao" "date", "p_produtos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."iniciar_fstd_produtos"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_produtos" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return public.iniciar_fstd_produtos_v2(
    p_loja_id,
    p_nfd_chave_acesso
  );
end;
$$;


ALTER FUNCTION "public"."iniciar_fstd_produtos"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_produtos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."iniciar_fstd_produtos_v2"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_loja_codigo text;
  v_chave_acesso text := nullif(btrim(p_nfd_chave_acesso), '');
  v_nfd_numero text;
  v_processo public.fstd_processos;
begin
  if v_auth_user_id is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;

  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = v_auth_user_id
    and u.perfil in ('Promotor', 'Gerencial', 'Admin')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  select l.codigo
  into v_loja_codigo
  from public.lojas as l
  where l.id = p_loja_id
    and (
      app_private.can_current_user_access_loja(l.id)
      or exists (
        select 1
        from public.loja_promotores as lp
        where lp.loja_id = l.id
          and lp.promotor_id = v_promotor_id
      )
    )
  limit 1;

  if v_loja_codigo is null then
    raise exception 'Loja nao encontrada ou sem acesso para o usuario autenticado.';
  end if;

  if v_chave_acesso is null then
    raise exception 'Chave de acesso da NFD obrigatoria.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_chave_acesso, 0)
  );

  select min(ni.nota_fiscal)::text
  into v_nfd_numero
  from public.nfd_itens as ni
  where ni.chave_acesso::text = v_chave_acesso
    and ni.codigo_cliente::text = v_loja_codigo;

  if v_nfd_numero is null then
    raise exception 'NFD nao encontrada para a loja informada.';
  end if;

  if exists (
    select 1
    from public.nfd_itens as ni
    where ni.chave_acesso::text = v_chave_acesso
      and ni.codigo_cliente::text <> v_loja_codigo
  ) then
    raise exception 'A NFD possui itens associados a outra loja.';
  end if;

  select p.*
  into v_processo
  from public.fstd_processos as p
  where p.nfd_chave_acesso = v_chave_acesso
    and p.status <> 'cancelada'
  for update;

  if v_processo.id is not null then
    if v_processo.promotor_id <> v_promotor_id
      or v_processo.loja_id <> p_loja_id then
      if app_private.can_current_user_access_loja(v_processo.loja_id) then
        update public.fstd_processos
        set promotor_id = v_promotor_id,
            updated_at = now()
        where id = v_processo.id;
      else
        raise exception 'Esta NFD ja pertence a outro Promotor ou loja.';
      end if;
    end if;
  else
    insert into public.fstd_processos (
      nfd_chave_acesso,
      nfd_numero,
      loja_id,
      promotor_id
    )
    values (
      v_chave_acesso,
      v_nfd_numero,
      p_loja_id,
      v_promotor_id
    )
    returning * into v_processo;
  end if;

  insert into public.fstd_produtos (
    processo_id,
    produto_id,
    codigo_produto,
    nome,
    descricao,
    imagem_url,
    quantidade_faturada_galinha,
    quantidade_faturada_codorna
  )
  select
    v_processo.id,
    catalog.produto_id,
    items.codigo_produto,
    coalesce(catalog.nome, items.descricao, items.codigo_produto),
    items.descricao,
    catalog.imagem_url,
    items.quantidade_galinha,
    items.quantidade_codorna
  from (
    select
      upper(btrim(ni.codigo_produto)) as codigo_produto,
      max(nullif(btrim(ni.descricao_produto), '')) as descricao,
      sum(greatest(coalesce(ni.quantidade_galinha, 0), 0))::integer as quantidade_galinha,
      sum(greatest(coalesce(ni.quantidade_codorna, 0), 0))::integer as quantidade_codorna
    from public.nfd_itens as ni
    where ni.chave_acesso::text = v_chave_acesso
      and ni.codigo_cliente::text = v_loja_codigo
      and nullif(btrim(ni.codigo_produto), '') is not null
    group by upper(btrim(ni.codigo_produto))
  ) as items
  left join public.produtos_expandidos as catalog
    on catalog.codigo_produto = items.codigo_produto
  on conflict (processo_id, codigo_produto) do nothing;

  if not exists (
    select 1
    from public.fstd_produtos as fp
    where fp.processo_id = v_processo.id
  ) then
    raise exception 'Nenhum produto valido foi encontrado para esta NFD.';
  end if;

  return v_processo.id;
end;
$$;


ALTER FUNCTION "public"."iniciar_fstd_produtos_v2"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_current_user_gerencial_ativo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select app_private.is_current_user_gerencial_ativo();
$$;


ALTER FUNCTION "public"."is_current_user_gerencial_ativo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listar_nfd_notas_gerencial"("p_data_inicial" "date" DEFAULT NULL::"date", "p_data_final" "date" DEFAULT NULL::"date", "p_status" "text" DEFAULT NULL::"text", "p_uf" "text" DEFAULT NULL::"text", "p_cidade" "text" DEFAULT NULL::"text", "p_pesquisa" "text" DEFAULT NULL::"text", "p_ordenar_por" "text" DEFAULT 'data_emissao'::"text", "p_direcao" "text" DEFAULT 'desc'::"text", "p_limite" integer DEFAULT 10, "p_deslocamento" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    SET "statement_timeout" TO '30s'
    AS $_$
declare
  v_order text;
  v_direction text := lower(coalesce(p_direcao, 'desc'));
  v_result jsonb;
  v_search text := nullif(trim(p_pesquisa), '');
  v_numeric_search integer;
  v_access_key_search text;
  v_name_search text;
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Acesso gerencial ativo obrigatorio.' using errcode = '42501';
  end if;
  if p_ordenar_por not in ('loja', 'nota_fiscal', 'data_emissao', 'uf', 'status') then
    raise exception 'Coluna de ordenacao invalida.' using errcode = '22023';
  end if;
  if v_direction not in ('asc', 'desc') then
    raise exception 'Direcao de ordenacao invalida.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('Finalizada', 'Pendente', 'Desconhecida') then
    raise exception 'Status invalido.' using errcode = '22023';
  end if;
  if p_limite not between 1 and 100 or p_deslocamento < 0 then
    raise exception 'Limite ou deslocamento invalido.' using errcode = '22023';
  end if;

  if v_search ~ '^\d{1,10}$' then
    if v_search::numeric between 0 and 2147483647 then
      v_numeric_search := v_search::integer;
    end if;
  elsif v_search ~ '^\d{44}$' then
    v_access_key_search := v_search;
  elsif v_search ~ '[[:alpha:]]' then
    v_name_search := v_search;
  end if;

  v_order := case p_ordenar_por
    when 'loja' then 'nome_ordenacao'
    when 'nota_fiscal' then 'nota_fiscal'
    when 'data_emissao' then 'data_ordenacao'
    when 'uf' then 'uf'
    when 'status' then 'status'
  end;

  execute format($query$
    with scope as materialized (
      select app_private.is_current_user_admin_ativo() is_admin,
        app_private.current_user_ufs() ufs
    ), numeric_matches as materialized (
      select m.chave_acesso
      from app_private.search_nfd_chaves_numeric($6) m
      where $9 is not null
    ), name_matches as materialized (
      select m.chave_acesso
      from app_private.search_nfd_chaves_by_name($6) m
      where $11 is not null
    ), candidates as materialized (
      select
        ni.chave_acesso::text,
        ni.estabelecimento::text,
        ni.nota_fiscal::bigint,
        ni.data_emissao::date,
        ni.data_referencia::date,
        ni.codigo_cliente::bigint,
        ni.nome_abreviado::text,
        upper(ni.uf::text) uf,
        ni.cidade::text,
        sum(coalesce(ni.quantidade_galinha, 0))::bigint quantidade_galinha,
        sum(coalesce(ni.quantidade_codorna, 0))::bigint quantidade_codorna,
        round(sum(coalesce(ni.valor, 0::numeric)), 2)::numeric(14, 2) valor_total,
        coalesce(ni.data_emissao, ni.data_referencia)::date data_ordenacao,
        coalesce(nullif(trim(ni.nome_abreviado::text), ''),
          nullif(trim(ni.estabelecimento::text), ''), ni.codigo_cliente::text) nome_ordenacao
      from public.nfd_itens ni
      cross join scope s
      where (s.is_admin or upper(trim(ni.uf::text)) = any(s.ufs))
        and ($1 is null or coalesce(ni.data_emissao, ni.data_referencia)::date >= $1)
        and ($2 is null or coalesce(ni.data_emissao, ni.data_referencia)::date <= $2)
        and ($4 is null or upper(trim(ni.uf::text)) = any(string_to_array(upper($4), ',')))
        and ($5 is null or lower(ni.cidade::text) = any(string_to_array(lower($5), ',')))
        and (
          $6 is null
          or ($9 is not null and exists (
            select 1 from numeric_matches m where m.chave_acesso = ni.chave_acesso
          ))
          or ($10 is not null and ni.chave_acesso = $10)
          or ($11 is not null and exists (
            select 1 from name_matches m where m.chave_acesso = ni.chave_acesso
          ))
        )
      group by
        ni.chave_acesso, ni.estabelecimento, ni.nota_fiscal, ni.data_emissao,
        ni.data_referencia, ni.codigo_cliente, ni.nome_abreviado, ni.uf, ni.cidade
    ), base as materialized (
      select c.*,
        case
          when legado.legado_id is not null or processo.status = 'concluida' then 'Finalizada'
          when desconhecida.encontrada then 'Desconhecida'
          else 'Pendente'
        end status,
        legado.legado_id is not null fstd_legado
      from candidates c
      left join lateral (
        select p.status from public.fstd_processos p
        where p.nfd_chave_acesso = c.chave_acesso
        order by p.created_at desc, p.id desc limit 1
      ) processo on true
      left join lateral (
        select true encontrada from public.nfd_desconhecimentos d
        where d.reconhecida_em is null
          and (d.nfd_chave_acesso = c.chave_acesso
            or d.nfd_referencia = concat(c.codigo_cliente, ':', c.nota_fiscal))
        limit 1
      ) desconhecida on true
      left join lateral (
        select fl.legado_id from public.fstd_legado fl
        where fl.codigo_loja = c.codigo_cliente::text
          and fl.numero_nfd = c.nota_fiscal::text
        order by fl.legado_id limit 1
      ) legado on true
    ), filtered as materialized (
      select * from base where $3 is null or status = $3
    ), page as (
      select * from filtered
      order by %I %s nulls last, chave_acesso asc
      limit $7 offset $8
    )
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(to_jsonb(p) - 'data_ordenacao' - 'nome_ordenacao'
          order by %I %s nulls last, chave_acesso asc)
        from page p
      ), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'counts', jsonb_build_object(
        'Finalizada', count(*) filter (where status = 'Finalizada'),
        'Pendente', count(*) filter (where status = 'Pendente'),
        'Desconhecida', count(*) filter (where status = 'Desconhecida')
      ),
      'ufs', coalesce((select jsonb_agg(distinct uf order by uf) from candidates), '[]'::jsonb),
      'cities', coalesce((
        select jsonb_agg(distinct cidade order by cidade) from candidates
        where $4 is null or upper(trim(uf)) = any(string_to_array(upper($4), ','))
      ), '[]'::jsonb)
    ) from filtered
  $query$, v_order, v_direction, v_order, v_direction)
  into v_result
  using p_data_inicial, p_data_final, p_status, p_uf, p_cidade, v_search,
    p_limite, p_deslocamento, v_numeric_search, v_access_key_search, v_name_search;

  return v_result;
end
$_$;


ALTER FUNCTION "public"."listar_nfd_notas_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_status" "text", "p_uf" "text", "p_cidade" "text", "p_pesquisa" "text", "p_ordenar_por" "text", "p_direcao" "text", "p_limite" integer, "p_deslocamento" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."listar_nfd_notas_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_status" "text", "p_uf" "text", "p_cidade" "text", "p_pesquisa" "text", "p_ordenar_por" "text", "p_direcao" "text", "p_limite" integer, "p_deslocamento" integer) IS 'Pagina NFDs gerenciais; procura parcialmente por NFD/cliente ou nome/estabelecimento com chaves autorizadas e indices trigrama.';



CREATE TABLE IF NOT EXISTS "public"."fstd_legado" (
    "legado_id" bigint NOT NULL,
    "codigo_loja" "text" NOT NULL,
    "numero_nfd" "text" NOT NULL,
    "id" "text" NOT NULL,
    "numero_controle" "text",
    "data_preenchimento" timestamp with time zone,
    "responsavel_fstd" "text",
    "motivo" "text",
    "qtd_total_galinha" bigint,
    "qtd_retorno_galinha" bigint,
    "qtd_total_codorna" bigint,
    "qtd_retorno_codorna" bigint,
    "origem" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_hash" "text"
);


ALTER TABLE "public"."fstd_legado" OWNER TO "postgres";


COMMENT ON COLUMN "public"."fstd_legado"."source_hash" IS 'Hash imutavel da linha de origem para importacoes legadas idempotentes e rollback auditavel.';



CREATE OR REPLACE FUNCTION "public"."obter_fstd_legado"("p_codigo_loja" "text", "p_numero_nfd" "text") RETURNS SETOF "public"."fstd_legado"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select *
  from public.fstd_legado_canonico
  where codigo_loja = trim(p_codigo_loja)
    and numero_nfd = trim(p_numero_nfd);
$$;


ALTER FUNCTION "public"."obter_fstd_legado"("p_codigo_loja" "text", "p_numero_nfd" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_usuario_own_privileges"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() = old.auth_user_id and (
    new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email
    or new.perfil is distinct from old.perfil or new.estado is distinct from old.estado
    or new.ufs is distinct from old.ufs or new.ativo is distinct from old.ativo
    or new.acesso_habilitado is distinct from old.acesso_habilitado
    or new.fotos_habilitadas is distinct from old.fotos_habilitadas
  ) then
    raise exception 'O usuario nao pode alterar o proprio privilegio ou escopo.' using errcode = '42501';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."protect_usuario_own_privileges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconhecer_nfd_gerencial"("p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_gerencial_id uuid;
  v_updated integer;
begin
  select u.id
  into v_gerencial_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil in ('Admin', 'Gerencial')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_gerencial_id is null then
    raise exception 'Usuario Gerencial ativo nao encontrado.';
  end if;

  if nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is null
    and nullif(btrim(coalesce(p_nfd_referencia, '')), '') is null then
    raise exception 'Informe a chave de acesso ou a referencia da NFD.';
  end if;

  update public.nfd_desconhecimentos as nd
  set reconhecida_em = now(),
      reconhecida_por = v_gerencial_id
  where nd.reconhecida_em is null
    and app_private.can_current_user_access_loja(nd.loja_id)
    and app_private.can_current_user_access_loja(nd.loja_id)
    and (
      (
        nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is not null
        and nd.nfd_chave_acesso = btrim(p_nfd_chave_acesso)
      )
      or (
        nullif(btrim(coalesce(p_nfd_referencia, '')), '') is not null
        and nd.nfd_referencia = btrim(p_nfd_referencia)
      )
    )
    and (
      nullif(btrim(coalesce(p_nfd_numero, '')), '') is null
      or nd.nfd_numero = btrim(p_nfd_numero)
    );

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Nenhuma marcacao desconhecida ativa foi encontrada para esta NFD.';
  end if;

  return v_updated;
end;
$$;


ALTER FUNCTION "public"."reconhecer_nfd_gerencial"("p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_usuario_access"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  recorded_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  update public.usuarios
  set last_access_at = recorded_at
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'Usuario cadastrado nao encontrado.' using errcode = '42501';
  end if;

  return recorded_at;
end;
$$;


ALTER FUNCTION "public"."record_usuario_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recuperar_fstd_documentos"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_processo_id uuid;
  v_criados integer := 0;
begin
  if (select auth.uid()) is not null
    and not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Somente um usuario Gerencial ativo pode recuperar documentos FSTD.'
      using errcode = '42501';
  end if;

  for v_processo_id in
    select p.id
    from public.fstd_processos as p
    where p.status = 'concluida'
      and not exists (
        select 1
        from public.fstd_documentos as d
        where d.processo_id = p.id
      )
    order by p.finalizada_em nulls first, p.id
  loop
    perform app_private.ensure_fstd_document(v_processo_id);
    v_criados := v_criados + 1;
  end loop;

  return v_criados;
end;
$$;


ALTER FUNCTION "public"."recuperar_fstd_documentos"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."recuperar_fstd_documentos"() IS 'Recupera manualmente documentos ausentes de processos FSTD concluidos; retorna a quantidade criada.';



CREATE OR REPLACE FUNCTION "public"."reset_fstd_avulsa_conferencia_on_process_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.is_avulsa is true
    and new.status = 'em_andamento'
    and (
      old.nfd_data_emissao is distinct from new.nfd_data_emissao
      or old.nfd_valor is distinct from new.nfd_valor
    ) then
    new.conferencia_status := 'pendente';
    new.conferencia_detalhes := '{}'::jsonb;
    new.conferencia_em := null;
    new.api_nfd_chave_acesso := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."reset_fstd_avulsa_conferencia_on_process_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_fstd_avulsa_conferencia_on_product_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  update public.fstd_processos as p
  set
    conferencia_status = 'pendente',
    conferencia_detalhes = '{}'::jsonb,
    conferencia_em = null,
    api_nfd_chave_acesso = null,
    updated_at = now()
  where p.id = new.processo_id
    and p.is_avulsa is true
    and p.status = 'em_andamento';

  return new;
end;
$$;


ALTER FUNCTION "public"."reset_fstd_avulsa_conferencia_on_product_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_atualizado_em"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_atualizado_em"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_fstd_document_pdf"("p_document_id" "uuid", "p_pdf_path" "text", "p_pdf_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."fstd_documentos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_document public.fstd_documentos;
begin
  if nullif(trim(p_pdf_path), '') is null then
    raise exception 'O caminho do PDF é obrigatório.' using errcode = '22023';
  end if;

  update public.fstd_documentos as d
  set
    pdf_path = case
      when d.pdf_path is null
        or (p_pdf_metadata ->> 'template_version') is distinct from (d.pdf_metadata ->> 'template_version')
        then trim(p_pdf_path)
      else d.pdf_path
    end,
    pdf_metadata = case
      when d.pdf_path is null
        or (p_pdf_metadata ->> 'template_version') is distinct from (d.pdf_metadata ->> 'template_version')
        then coalesce(p_pdf_metadata, '{}'::jsonb)
      else d.pdf_metadata
    end
  where d.id = p_document_id
    and exists (
      select 1
      from public.fstd_processos as p
      join public.usuarios as u on u.id = p.promotor_id
      where p.id = d.processo_id
        and p.status = 'concluida'
        and (
          (select app_private.is_current_user_gerencial_ativo())
          or (u.auth_user_id = (select auth.uid()) and u.ativo is true)
        )
    )
  returning d.* into v_document;

  if v_document.id is null then
    raise exception 'Documento FSTD não encontrado ou sem permissão.' using errcode = '42501';
  end if;

  return v_document;
end;
$$;


ALTER FUNCTION "public"."set_fstd_document_pdf"("p_document_id" "uuid", "p_pdf_path" "text", "p_pdf_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_gerencial_user"("p_usuario_id" "uuid", "p_nome" "text", "p_email" "text", "p_ativo" boolean) RETURNS "public"."usuarios"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
declare
  v_nome text := nullif(btrim(p_nome), '');
  v_email text := lower(nullif(btrim(p_email), ''));
  v_target public.usuarios;
  v_usuario public.usuarios;
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Apenas Gerenciais ativos podem editar Gerenciais.';
  end if;

  select * into v_target
  from public.usuarios
  where id = p_usuario_id
    and perfil = 'Gerencial';

  if v_target.id is null then
    raise exception 'Gerencial nao encontrado.';
  end if;

  if v_nome is null or char_length(v_nome) < 4 then
    raise exception 'Informe um nome valido.';
  end if;

  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail valido.';
  end if;

  if p_ativo is false and v_target.auth_user_id = (select auth.uid()) then
    raise exception 'Voce nao pode desativar o proprio usuario.';
  end if;

  if p_ativo is false and (
    select count(*)
    from public.usuarios
    where perfil = 'Gerencial'
      and ativo is true
      and id <> p_usuario_id
  ) = 0 then
    raise exception 'Nao e permitido desativar o ultimo Gerencial ativo.';
  end if;

  if exists (
    select 1
    from public.usuarios
    where lower(email) = v_email
      and id <> p_usuario_id
  ) then
    raise exception 'Este e-mail ja esta cadastrado.';
  end if;

  update public.usuarios
  set
    nome = v_nome,
    email = v_email,
    ativo = p_ativo
  where id = p_usuario_id
  returning * into v_usuario;

  if v_usuario.auth_user_id is not null then
    update auth.users
    set
      email = v_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', v_nome),
      updated_at = now()
    where id = v_usuario.auth_user_id;

    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email),
      updated_at = now()
    where user_id = v_usuario.auth_user_id
      and provider = 'email';
  end if;

  return v_usuario;
end;
$_$;


ALTER FUNCTION "public"."update_gerencial_user"("p_usuario_id" "uuid", "p_nome" "text", "p_email" "text", "p_ativo" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_loja_promotor_uf"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_loja_uf text; v_promotor_uf text; v_perfil text;
begin
  if new.promotor_id is null then return new; end if;
  select uf into v_loja_uf from public.lojas where id = new.loja_id;
  select estado, perfil into v_promotor_uf, v_perfil from public.usuarios where id = new.promotor_id;
  if v_perfil is distinct from 'Promotor' or v_promotor_uf is distinct from v_loja_uf then
    raise exception 'Promotor e loja devem pertencer a mesma UF.' using errcode = '23514';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."validate_loja_promotor_uf"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nfd_itens" (
    "id" bigint NOT NULL,
    "estabelecimento" "text" NOT NULL,
    "nota_fiscal" integer NOT NULL,
    "chave_acesso" character varying(44) NOT NULL,
    "data_emissao" "date" NOT NULL,
    "valor" numeric(14,2) DEFAULT 0 NOT NULL,
    "quantidade_galinha" integer DEFAULT 0 NOT NULL,
    "valor_galinha" numeric(14,2) DEFAULT 0 NOT NULL,
    "quantidade_codorna" integer DEFAULT 0 NOT NULL,
    "valor_codorna" numeric(14,2) DEFAULT 0 NOT NULL,
    "codigo_cliente" integer NOT NULL,
    "nome_abreviado" "text",
    "uf" character varying(2),
    "cidade" "text",
    "codigo_produto" "text" NOT NULL,
    "descricao_produto" "text",
    "data_referencia" "date" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."nfd_itens" OWNER TO "postgres";


ALTER TABLE "public"."nfd_itens" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."devolucoes_avine_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."nfd_logs" (
    "id" bigint NOT NULL,
    "data_referencia" "date" NOT NULL,
    "iniciado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finalizado_em" timestamp with time zone,
    "status" "text" DEFAULT 'executando'::"text" NOT NULL,
    "registros_recebidos" integer DEFAULT 0 NOT NULL,
    "registros_processados" integer DEFAULT 0 NOT NULL,
    "url_consultada" "text",
    "mensagem" "text",
    "erro" "text",
    "registros_invalidos" integer DEFAULT 0 NOT NULL,
    "detalhes_invalidos" "jsonb",
    "fonte" "text" DEFAULT 'api'::"text" NOT NULL,
    "registros_existentes" integer DEFAULT 0 NOT NULL,
    "registros_divergentes" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "devolucoes_avine_sync_logs_status_check" CHECK (("status" = ANY (ARRAY['executando'::"text", 'sucesso'::"text", 'sem_dados'::"text", 'erro'::"text"]))),
    CONSTRAINT "nfd_logs_fonte_check" CHECK (("fonte" = ANY (ARRAY['api'::"text", 'sheets'::"text", 'copia_v1'::"text"])))
);


ALTER TABLE "public"."nfd_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."nfd_logs"."fonte" IS 'Origem da sincronizacao de NFDs: API Avine, Google Sheets de itens ou COPIA V1 do Glide.';



COMMENT ON COLUMN "public"."nfd_logs"."registros_existentes" IS 'Quantidade de registros da fonte que ja existiam no destino ao finalizar a sincronizacao.';



COMMENT ON COLUMN "public"."nfd_logs"."registros_divergentes" IS 'Quantidade de registros COPIA V1 mantidos no legado, mas ausentes ou alterados na fonte.';



ALTER TABLE "public"."nfd_logs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."devolucoes_avine_sync_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."fstd_legado_canonico" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("codigo_loja", "numero_nfd") "legado_id",
    "codigo_loja",
    "numero_nfd",
    "id",
    "numero_controle",
    "data_preenchimento",
    "responsavel_fstd",
    "motivo",
    "qtd_total_galinha",
    "qtd_retorno_galinha",
    "qtd_total_codorna",
    "qtd_retorno_codorna",
    "origem",
    "created_at",
    "source_hash"
   FROM "public"."fstd_legado" "fl"
  ORDER BY "codigo_loja", "numero_nfd",
        CASE
            WHEN ("origem" = 'v1-atual'::"text") THEN 1
            WHEN (("origem" = 'COPIA V1'::"text") AND ("source_hash" ~~ 'copia-v1-live-%'::"text")) THEN 2
            WHEN ("origem" = 'FSTD DIGITAL CSV 2026-08-26'::"text") THEN 3
            WHEN ("origem" = 'COPIA V1'::"text") THEN 4
            WHEN ("origem" = 'v1-backup'::"text") THEN 5
            ELSE 6
        END, "data_preenchimento" DESC NULLS LAST, "created_at" DESC NULLS LAST, "legado_id" DESC;


ALTER VIEW "public"."fstd_legado_canonico" OWNER TO "postgres";


COMMENT ON VIEW "public"."fstd_legado_canonico" IS 'Uma versao operacional por loja/NFD; preserva todas as origens em fstd_legado.';



CREATE TABLE IF NOT EXISTS "public"."fstd_legado_import_staging" (
    "import_id" bigint NOT NULL,
    "codigo_loja" "text" NOT NULL,
    "numero_nfd" "text" NOT NULL,
    "id" "text" NOT NULL,
    "numero_controle" "text",
    "data_preenchimento" timestamp with time zone,
    "responsavel_fstd" "text",
    "motivo" "text",
    "qtd_total_galinha" bigint,
    "qtd_retorno_galinha" bigint,
    "qtd_total_codorna" bigint,
    "qtd_retorno_codorna" bigint,
    "origem" "text" NOT NULL,
    "source_hash" "text" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fstd_legado_import_staging" OWNER TO "postgres";


COMMENT ON TABLE "public"."fstd_legado_import_staging" IS 'Staging protegido para importacao idempotente de FSTD legado.';



ALTER TABLE "public"."fstd_legado_import_staging" ALTER COLUMN "import_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."fstd_legado_import_staging_import_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."fstd_legado" ALTER COLUMN "legado_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."fstd_legado_legado_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."fstd_produto_motivos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "produto_id" "uuid" NOT NULL,
    "motivo_id" "uuid" NOT NULL,
    "quantidade" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quantidade_faturada" integer NOT NULL,
    CONSTRAINT "fstd_produto_motivos_quantidade_check" CHECK (("quantidade" >= 0)),
    CONSTRAINT "fstd_produto_motivos_quantidade_faturada_check" CHECK (("quantidade_faturada" > 0))
);


ALTER TABLE "public"."fstd_produto_motivos" OWNER TO "postgres";


COMMENT ON TABLE "public"."fstd_produto_motivos" IS 'Divisao da quantidade retornada de um produto FSTD por motivo de devolucao.';



COMMENT ON COLUMN "public"."fstd_produto_motivos"."quantidade_faturada" IS 'Quantidade faturada atribuida a este motivo; a soma deve fechar com o faturado da nota.';



CREATE TABLE IF NOT EXISTS "public"."lojas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "uf" "text" NOT NULL,
    "cidade" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lojas_uf_check" CHECK (("uf" = ANY (ARRAY['CE'::"text", 'MA'::"text", 'BA'::"text", 'PA'::"text", 'PB'::"text", 'PI'::"text", 'PE'::"text", 'AP'::"text", 'SE'::"text", 'RN'::"text", 'AL'::"text", 'TO'::"text"])))
);


ALTER TABLE "public"."lojas" OWNER TO "postgres";


COMMENT ON TABLE "public"."lojas" IS 'Lojas exibidas na tela Lojas do Avine gerencial e digital.';



CREATE TABLE IF NOT EXISTS "public"."motivos_devolucao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."motivos_devolucao" OWNER TO "postgres";


COMMENT ON TABLE "public"."motivos_devolucao" IS 'Motivos padronizados de devolucao usados nos apps Gerencial e Promotor.';



CREATE OR REPLACE VIEW "public"."nfd_notas" WITH ("security_invoker"='true') AS
 SELECT "chave_acesso",
    "estabelecimento",
    "nota_fiscal",
    "data_emissao",
    "data_referencia",
    "codigo_cliente",
    "nome_abreviado",
    "uf",
    "cidade",
    "sum"(COALESCE("quantidade_galinha", 0)) AS "quantidade_galinha",
    ("round"("sum"(COALESCE("valor_galinha", (0)::numeric)), 2))::numeric(14,2) AS "valor_galinha",
    "sum"(COALESCE("quantidade_codorna", 0)) AS "quantidade_codorna",
    ("round"("sum"(COALESCE("valor_codorna", (0)::numeric)), 2))::numeric(14,2) AS "valor_codorna",
    ("round"("sum"(COALESCE("valor", (0)::numeric)), 2))::numeric(14,2) AS "valor_total",
    ("count"(*))::integer AS "quantidade_itens",
    ("count"(DISTINCT "codigo_produto"))::integer AS "quantidade_produtos_distintos",
    "jsonb_agg"("jsonb_build_object"('codigo_produto', "codigo_produto", 'descricao_produto', "descricao_produto", 'quantidade_galinha', "quantidade_galinha", 'valor_galinha', "valor_galinha", 'quantidade_codorna', "quantidade_codorna", 'valor_codorna', "valor_codorna", 'valor', "valor") ORDER BY "codigo_produto", "descricao_produto") AS "detalhes"
   FROM "public"."nfd_itens" "d"
  GROUP BY "chave_acesso", "estabelecimento", "nota_fiscal", "data_emissao", "data_referencia", "codigo_cliente", "nome_abreviado", "uf", "cidade";


ALTER VIEW "public"."nfd_notas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."fstd_relatorio" WITH ("security_invoker"='true') AS
 WITH "produtos_fstd" AS (
         SELECT "p_1"."id" AS "processo_id",
            "fp"."id" AS "produto_id",
            COALESCE("fp"."quantidade_faturada_galinha", 0) AS "galinha_faturada",
            COALESCE("fp"."quantidade_faturada_codorna", 0) AS "codorna_faturada",
            COALESCE("fp"."quantidade_retorno", 0) AS "retorno",
            "fp"."motivo_id" AS "motivo_produto_id"
           FROM ("public"."fstd_processos" "p_1"
             JOIN "public"."fstd_produtos" "fp" ON (("fp"."processo_id" = "p_1"."id")))
          WHERE ("p_1"."status" = 'concluida'::"text")
        ), "totais_fstd" AS (
         SELECT "produtos_fstd"."processo_id",
            "sum"("produtos_fstd"."galinha_faturada") AS "galinha_faturada",
            "sum"("produtos_fstd"."codorna_faturada") AS "codorna_faturada",
            "sum"(
                CASE
                    WHEN ("produtos_fstd"."galinha_faturada" > 0) THEN "produtos_fstd"."retorno"
                    ELSE 0
                END) AS "galinha_retorno",
            "sum"(
                CASE
                    WHEN (("produtos_fstd"."galinha_faturada" = 0) AND ("produtos_fstd"."codorna_faturada" > 0)) THEN "produtos_fstd"."retorno"
                    ELSE 0
                END) AS "codorna_retorno"
           FROM "produtos_fstd"
          GROUP BY "produtos_fstd"."processo_id"
        ), "motivos_por_nota" AS (
         SELECT "pf"."processo_id",
            COALESCE("fpm"."motivo_id", "pf"."motivo_produto_id") AS "motivo_id",
            "sum"(
                CASE
                    WHEN ("fpm"."id" IS NOT NULL) THEN COALESCE("fpm"."quantidade_faturada", 0)
                    ELSE ("pf"."galinha_faturada" + "pf"."codorna_faturada")
                END) AS "quantidade_faturada",
            "sum"(
                CASE
                    WHEN ("fpm"."id" IS NOT NULL) THEN COALESCE("fpm"."quantidade", 0)
                    ELSE "pf"."retorno"
                END) AS "quantidade_retorno"
           FROM ("produtos_fstd" "pf"
             LEFT JOIN "public"."fstd_produto_motivos" "fpm" ON (("fpm"."produto_id" = "pf"."produto_id")))
          WHERE (COALESCE("fpm"."motivo_id", "pf"."motivo_produto_id") IS NOT NULL)
          GROUP BY "pf"."processo_id", COALESCE("fpm"."motivo_id", "pf"."motivo_produto_id")
        ), "motivos_ordenados" AS (
         SELECT "mpn"."processo_id",
            "mpn"."motivo_id",
            "mpn"."quantidade_faturada",
            "mpn"."quantidade_retorno",
            "md"."nome" AS "motivo_nome",
            "row_number"() OVER (PARTITION BY "mpn"."processo_id" ORDER BY "mpn"."quantidade_faturada" DESC, "mpn"."quantidade_retorno" DESC, "md"."ordem", "md"."nome", "mpn"."motivo_id") AS "ordem_motivo"
           FROM ("motivos_por_nota" "mpn"
             JOIN "public"."motivos_devolucao" "md" ON (("md"."id" = "mpn"."motivo_id")))
        )
 SELECT COALESCE(NULLIF("btrim"("p"."nfd_numero"), ''::"text"), ("n"."nota_fiscal")::"text") AS "nfd",
    "d"."numero_controle" AS "fstd",
    "concat_ws"(' - '::"text", "l"."codigo", COALESCE(NULLIF("btrim"("p"."nfd_numero"), ''::"text"), ("n"."nota_fiscal")::"text")) AS "id",
    COALESCE("n"."data_emissao", "p"."nfd_data_emissao") AS "data_emissao",
    (("p"."finalizada_em" AT TIME ZONE 'America/Sao_Paulo'::"text"))::"date" AS "data_baixa",
    ("round"(
        CASE
            WHEN ("n"."chave_acesso" IS NOT NULL) THEN (COALESCE("n"."valor_galinha", (0)::numeric) + COALESCE("n"."valor_codorna", (0)::numeric))
            ELSE COALESCE("p"."nfd_valor", (0)::numeric)
        END, 2))::numeric(14,2) AS "valor",
    ("round"(COALESCE("n"."valor_galinha", (0)::numeric), 2))::numeric(14,2) AS "vl_galinha",
    ("round"(COALESCE("n"."valor_codorna", (0)::numeric), 2))::numeric(14,2) AS "vl_codorna",
    'MALOTE'::"text" AS "motorista",
    "mo"."motivo_nome" AS "motivo_emissao",
    COALESCE("n"."nome_abreviado", "l"."nome") AS "nome_abreviado",
    "u"."nome" AS "responsavel_fstd",
    COALESCE("n"."quantidade_galinha", "tf"."galinha_faturada", (0)::bigint) AS "galinha_nfd",
    COALESCE("n"."quantidade_codorna", "tf"."codorna_faturada", (0)::bigint) AS "codorna_nfd",
    COALESCE("tf"."galinha_retorno", (0)::bigint) AS "galinha_retorno",
    COALESCE("tf"."codorna_retorno", (0)::bigint) AS "codorna_retorno"
   FROM (((((("public"."fstd_processos" "p"
     JOIN "public"."lojas" "l" ON (("l"."id" = "p"."loja_id")))
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
     LEFT JOIN "public"."fstd_documentos" "d" ON (("d"."processo_id" = "p"."id")))
     LEFT JOIN "public"."nfd_notas" "n" ON ((("n"."chave_acesso")::"text" = "p"."nfd_chave_acesso")))
     LEFT JOIN "totais_fstd" "tf" ON (("tf"."processo_id" = "p"."id")))
     LEFT JOIN "motivos_ordenados" "mo" ON ((("mo"."processo_id" = "p"."id") AND ("mo"."ordem_motivo" = 1))))
  WHERE ("p"."status" = 'concluida'::"text");


ALTER VIEW "public"."fstd_relatorio" OWNER TO "postgres";


COMMENT ON VIEW "public"."fstd_relatorio" IS 'Relatorio consolidado das FSTDs concluidas, com dados da NFD, controle, motivos, quantidades e responsavel.';



CREATE OR REPLACE VIEW "public"."fstd_relatorio_produtos" WITH ("security_invoker"='true') AS
 WITH "produto_motivos" AS (
         SELECT "p_1"."id" AS "processo_id",
            "fp"."id" AS "produto_id",
            "fp"."codigo_produto",
            "fp"."nome" AS "nome_produto",
            COALESCE("fp"."quantidade_faturada_galinha", 0) AS "galinha_faturada_produto",
            COALESCE("fp"."quantidade_faturada_codorna", 0) AS "codorna_faturada_produto",
            COALESCE("fpm"."motivo_id", "fp"."motivo_id") AS "motivo_id",
            "md"."nome" AS "motivo_nome",
                CASE
                    WHEN ("fpm"."id" IS NOT NULL) THEN COALESCE("fpm"."quantidade_faturada", 0)
                    ELSE (COALESCE("fp"."quantidade_faturada_galinha", 0) + COALESCE("fp"."quantidade_faturada_codorna", 0))
                END AS "quantidade_faturada_motivo",
                CASE
                    WHEN ("fpm"."id" IS NOT NULL) THEN COALESCE("fpm"."quantidade", 0)
                    ELSE COALESCE("fp"."quantidade_retorno", 0)
                END AS "quantidade_retorno_motivo"
           FROM ((("public"."fstd_processos" "p_1"
             JOIN "public"."fstd_produtos" "fp" ON (("fp"."processo_id" = "p_1"."id")))
             LEFT JOIN "public"."fstd_produto_motivos" "fpm" ON (("fpm"."produto_id" = "fp"."id")))
             LEFT JOIN "public"."motivos_devolucao" "md" ON (("md"."id" = COALESCE("fpm"."motivo_id", "fp"."motivo_id"))))
          WHERE ("p_1"."status" = 'concluida'::"text")
        )
 SELECT COALESCE(NULLIF("btrim"("p"."nfd_numero"), ''::"text"), ("n"."nota_fiscal")::"text") AS "nfd",
    "d"."numero_controle" AS "fstd",
    "concat_ws"(' - '::"text", "l"."codigo", COALESCE(NULLIF("btrim"("p"."nfd_numero"), ''::"text"), ("n"."nota_fiscal")::"text")) AS "id",
    COALESCE("n"."data_emissao", "p"."nfd_data_emissao") AS "data_emissao",
    (("p"."finalizada_em" AT TIME ZONE 'America/Sao_Paulo'::"text"))::"date" AS "data_baixa",
    ("round"(("valores"."vl_galinha" + "valores"."vl_codorna"), 2))::numeric(14,2) AS "valor",
    "valores"."vl_galinha",
    "valores"."vl_codorna",
    'MALOTE'::"text" AS "motorista",
    "pm"."motivo_nome" AS "motivo_emissao",
    COALESCE("n"."nome_abreviado", "l"."nome") AS "nome_abreviado",
    "u"."nome" AS "responsavel_fstd",
    (
        CASE
            WHEN ("pm"."galinha_faturada_produto" > 0) THEN "pm"."quantidade_faturada_motivo"
            ELSE 0
        END)::bigint AS "galinha_nfd",
    (
        CASE
            WHEN ("pm"."codorna_faturada_produto" > 0) THEN "pm"."quantidade_faturada_motivo"
            ELSE 0
        END)::bigint AS "codorna_nfd",
    (
        CASE
            WHEN ("pm"."galinha_faturada_produto" > 0) THEN "pm"."quantidade_retorno_motivo"
            ELSE 0
        END)::bigint AS "galinha_retorno",
    (
        CASE
            WHEN ("pm"."codorna_faturada_produto" > 0) THEN "pm"."quantidade_retorno_motivo"
            ELSE 0
        END)::bigint AS "codorna_retorno",
    "pm"."nome_produto"
   FROM (((((((("public"."fstd_processos" "p"
     JOIN "produto_motivos" "pm" ON (("pm"."processo_id" = "p"."id")))
     JOIN "public"."lojas" "l" ON (("l"."id" = "p"."loja_id")))
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
     LEFT JOIN "public"."fstd_documentos" "d" ON (("d"."processo_id" = "p"."id")))
     LEFT JOIN "public"."nfd_notas" "n" ON ((("n"."chave_acesso")::"text" = "p"."nfd_chave_acesso")))
     LEFT JOIN LATERAL ( SELECT "sum"(COALESCE("ni_item"."quantidade_galinha", 0)) AS "quantidade_galinha",
            "sum"(COALESCE("ni_item"."quantidade_codorna", 0)) AS "quantidade_codorna",
            "sum"(COALESCE("ni_item"."valor_galinha", (0)::numeric)) AS "valor_galinha",
            "sum"(COALESCE("ni_item"."valor_codorna", (0)::numeric)) AS "valor_codorna"
           FROM "public"."nfd_itens" "ni_item"
          WHERE ((("ni_item"."chave_acesso")::"text" = "p"."nfd_chave_acesso") AND ("upper"("btrim"("ni_item"."codigo_produto")) = "upper"("btrim"("pm"."codigo_produto"))))) "ni" ON (true))
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN (("pm"."galinha_faturada_produto" + "pm"."codorna_faturada_produto") > 0) THEN (("pm"."quantidade_faturada_motivo")::numeric / (("pm"."galinha_faturada_produto" + "pm"."codorna_faturada_produto"))::numeric)
                    ELSE (1)::numeric
                END AS "fator_motivo") "rate" ON (true))
     LEFT JOIN LATERAL ( SELECT ("round"(
                CASE
                    WHEN ("pm"."galinha_faturada_produto" > 0) THEN (COALESCE("ni"."valor_galinha", (0)::numeric) * "rate"."fator_motivo")
                    ELSE (0)::numeric
                END, 2))::numeric(14,2) AS "vl_galinha",
            ("round"(
                CASE
                    WHEN ("pm"."codorna_faturada_produto" > 0) THEN (COALESCE("ni"."valor_codorna", (0)::numeric) * "rate"."fator_motivo")
                    ELSE (0)::numeric
                END, 2))::numeric(14,2) AS "vl_codorna") "valores" ON (true))
  WHERE ("p"."status" = 'concluida'::"text");


ALTER VIEW "public"."fstd_relatorio_produtos" OWNER TO "postgres";


COMMENT ON VIEW "public"."fstd_relatorio_produtos" IS 'Relatorio de FSTDs concluidas com uma linha por produto e motivo, com valores proporcionais a quantidade faturada.';



CREATE TABLE IF NOT EXISTS "public"."loja_promotores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_id" "uuid",
    "promotor_id" "uuid",
    "posicao" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "loja_promotores_posicao_check" CHECK (("posicao" = ANY (ARRAY[1, 2, 3])))
);


ALTER TABLE "public"."loja_promotores" OWNER TO "postgres";


COMMENT ON TABLE "public"."loja_promotores" IS 'Vinculos entre lojas e ate tres promotores por posicao.';



CREATE OR REPLACE VIEW "public"."lojas_com_promotores" WITH ("security_invoker"='true') AS
 SELECT "l"."id" AS "loja_id",
    "l"."codigo",
    "l"."nome" AS "loja_nome",
    "l"."uf",
    "l"."cidade",
    "max"(
        CASE
            WHEN ("lp"."posicao" = 1) THEN "u"."nome"
            ELSE NULL::"text"
        END) AS "promotor_1",
    "max"(
        CASE
            WHEN ("lp"."posicao" = 2) THEN "u"."nome"
            ELSE NULL::"text"
        END) AS "promotor_2",
    "max"(
        CASE
            WHEN ("lp"."posicao" = 3) THEN "u"."nome"
            ELSE NULL::"text"
        END) AS "promotor_3"
   FROM (("public"."lojas" "l"
     LEFT JOIN "public"."loja_promotores" "lp" ON (("lp"."loja_id" = "l"."id")))
     LEFT JOIN "public"."usuarios" "u" ON (("u"."id" = "lp"."promotor_id")))
  GROUP BY "l"."id", "l"."codigo", "l"."nome", "l"."uf", "l"."cidade";


ALTER VIEW "public"."lojas_com_promotores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."produtos" (
    "status" boolean,
    "nome" "text",
    "codigos_vinculados" "text",
    "ovos_und" bigint,
    "categoria" "text",
    "imagem_url" "text",
    "class_ia" "text",
    "color_ia" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."produtos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."produtos_expandidos" WITH ("security_invoker"='true') AS
 SELECT "p"."id" AS "produto_id",
    ((("p"."id")::"text" || ':'::"text") || "upper"(TRIM(BOTH FROM "c"."codigo_produto"))) AS "produto_codigo_id",
    "upper"(TRIM(BOTH FROM "c"."codigo_produto")) AS "codigo_produto",
    "p"."status",
    "p"."nome",
    "p"."ovos_und",
    "p"."categoria",
    "p"."imagem_url",
    "p"."class_ia",
    "p"."color_ia"
   FROM ("public"."produtos" "p"
     CROSS JOIN LATERAL "regexp_split_to_table"(COALESCE("p"."codigos_vinculados", ''::"text"), '\s*;\s*'::"text") "c"("codigo_produto"))
  WHERE (TRIM(BOTH FROM "c"."codigo_produto") <> ''::"text");


ALTER VIEW "public"."produtos_expandidos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."produtos_precos_unitarios" WITH ("security_invoker"='true') AS
 WITH "catalogo" AS (
         SELECT DISTINCT ON (("upper"("btrim"("pe"."codigo_produto")))) "upper"("btrim"("pe"."codigo_produto")) AS "codigo_produto",
            "pe"."nome" AS "nome_produto",
            "pe"."categoria",
            "pe"."ovos_und"
           FROM "public"."produtos_expandidos" "pe"
          WHERE ("pe"."status" IS TRUE)
          ORDER BY ("upper"("btrim"("pe"."codigo_produto"))), "pe"."nome", "pe"."produto_id"
        ), "ultima_data" AS (
         SELECT "upper"("btrim"("ni"."codigo_produto")) AS "codigo_produto",
            "max"("ni"."data_referencia") AS "data_preco"
           FROM "public"."nfd_itens" "ni"
          WHERE (("ni"."quantidade_galinha" > 0) OR ("ni"."quantidade_codorna" > 0))
          GROUP BY ("upper"("btrim"("ni"."codigo_produto")))
        ), "precos_recentes" AS (
         SELECT "upper"("btrim"("ni"."codigo_produto")) AS "codigo_produto",
            "ud"."data_preco",
            "sum"((COALESCE("ni"."valor_galinha", (0)::numeric) + COALESCE("ni"."valor_codorna", (0)::numeric))) AS "valor_analisado",
            "sum"((COALESCE("ni"."quantidade_galinha", 0) + COALESCE("ni"."quantidade_codorna", 0))) AS "quantidade_analisada",
            "sum"(COALESCE("ni"."quantidade_galinha", 0)) AS "quantidade_galinha",
            "sum"(COALESCE("ni"."quantidade_codorna", 0)) AS "quantidade_codorna",
            ("count"(*))::integer AS "registros_analisados",
            "max"("ni"."descricao_produto") AS "descricao_origem"
           FROM ("public"."nfd_itens" "ni"
             JOIN "ultima_data" "ud" ON ((("ud"."codigo_produto" = "upper"("btrim"("ni"."codigo_produto"))) AND ("ud"."data_preco" = "ni"."data_referencia"))))
          GROUP BY ("upper"("btrim"("ni"."codigo_produto"))), "ud"."data_preco"
        )
 SELECT COALESCE("c"."codigo_produto", "pr"."codigo_produto") AS "codigo_produto",
    COALESCE("c"."nome_produto", "pr"."descricao_origem") AS "nome_produto",
    "c"."categoria",
    "c"."ovos_und" AS "ovos_por_embalagem",
        CASE
            WHEN (("pr"."quantidade_galinha" > 0) AND ("pr"."quantidade_codorna" = 0)) THEN 'Galinha'::"text"
            WHEN (("pr"."quantidade_codorna" > 0) AND ("pr"."quantidade_galinha" = 0)) THEN 'Codorna'::"text"
            WHEN (("pr"."quantidade_galinha" > 0) AND ("pr"."quantidade_codorna" > 0)) THEN 'Misto'::"text"
            ELSE NULL::"text"
        END AS "tipo_ovo",
    "pr"."data_preco",
    "pr"."registros_analisados",
    "pr"."quantidade_analisada",
    ("round"(("pr"."valor_analisado" / (NULLIF("pr"."quantidade_analisada", 0))::numeric), 4))::numeric(14,4) AS "preco_unitario",
    ("round"("pr"."valor_analisado", 2))::numeric(14,2) AS "valor_analisado"
   FROM ("catalogo" "c"
     FULL JOIN "precos_recentes" "pr" ON (("pr"."codigo_produto" = "c"."codigo_produto")));


ALTER VIEW "public"."produtos_precos_unitarios" OWNER TO "postgres";


COMMENT ON VIEW "public"."produtos_precos_unitarios" IS 'Preco medio ponderado por unidade do produto, calculado no lote mais recente de NFDs por codigo.';



ALTER TABLE ONLY "public"."nfd_itens"
    ADD CONSTRAINT "devolucoes_avine_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nfd_logs"
    ADD CONSTRAINT "devolucoes_avine_sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fstd_documentos"
    ADD CONSTRAINT "fstd_documentos_numero_controle_unique" UNIQUE ("numero_controle");



ALTER TABLE ONLY "public"."fstd_documentos"
    ADD CONSTRAINT "fstd_documentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fstd_documentos"
    ADD CONSTRAINT "fstd_documentos_processo_unique" UNIQUE ("processo_id");



ALTER TABLE ONLY "public"."fstd_legado_import_staging"
    ADD CONSTRAINT "fstd_legado_import_staging_pkey" PRIMARY KEY ("import_id");



ALTER TABLE ONLY "public"."fstd_legado_import_staging"
    ADD CONSTRAINT "fstd_legado_import_staging_source_hash_key" UNIQUE ("source_hash");



ALTER TABLE ONLY "public"."fstd_legado"
    ADD CONSTRAINT "fstd_legado_pkey" PRIMARY KEY ("legado_id");



ALTER TABLE ONLY "public"."fstd_processos"
    ADD CONSTRAINT "fstd_processos_nfd_unique" UNIQUE ("nfd_chave_acesso");



ALTER TABLE ONLY "public"."fstd_processos"
    ADD CONSTRAINT "fstd_processos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fstd_produto_motivos"
    ADD CONSTRAINT "fstd_produto_motivos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fstd_produto_motivos"
    ADD CONSTRAINT "fstd_produto_motivos_produto_motivo_unique" UNIQUE ("produto_id", "motivo_id");



ALTER TABLE ONLY "public"."fstd_produtos"
    ADD CONSTRAINT "fstd_produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fstd_produtos"
    ADD CONSTRAINT "fstd_produtos_processo_codigo_unique" UNIQUE ("processo_id", "codigo_produto");



ALTER TABLE ONLY "public"."loja_promotores"
    ADD CONSTRAINT "loja_promotores_loja_id_posicao_key" UNIQUE ("loja_id", "posicao");



ALTER TABLE ONLY "public"."loja_promotores"
    ADD CONSTRAINT "loja_promotores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lojas"
    ADD CONSTRAINT "lojas_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."lojas"
    ADD CONSTRAINT "lojas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."motivos_devolucao"
    ADD CONSTRAINT "motivos_devolucao_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."motivos_devolucao"
    ADD CONSTRAINT "motivos_devolucao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nfd_desconhecimentos"
    ADD CONSTRAINT "nfd_desconhecimentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "devolucoes_avine_chave_produto_uidx" ON "public"."nfd_itens" USING "btree" ("chave_acesso", "codigo_produto");



CREATE INDEX "devolucoes_avine_codigo_cliente_idx" ON "public"."nfd_itens" USING "btree" ("codigo_cliente");



CREATE INDEX "devolucoes_avine_data_emissao_idx" ON "public"."nfd_itens" USING "btree" ("data_emissao");



CREATE INDEX "devolucoes_avine_data_referencia_idx" ON "public"."nfd_itens" USING "btree" ("data_referencia");



CREATE INDEX "devolucoes_avine_estabelecimento_idx" ON "public"."nfd_itens" USING "btree" ("estabelecimento");



CREATE INDEX "devolucoes_avine_nota_fiscal_idx" ON "public"."nfd_itens" USING "btree" ("nota_fiscal");



CREATE INDEX "devolucoes_avine_sync_logs_data_idx" ON "public"."nfd_logs" USING "btree" ("data_referencia");



CREATE INDEX "devolucoes_avine_sync_logs_status_idx" ON "public"."nfd_logs" USING "btree" ("status");



CREATE INDEX "devolucoes_avine_uf_cidade_idx" ON "public"."nfd_itens" USING "btree" ("uf", "cidade");



CREATE INDEX "fstd_documentos_numero_controle_idx" ON "public"."fstd_documentos" USING "btree" ("numero_controle");



CREATE INDEX "fstd_legado_id_idx" ON "public"."fstd_legado" USING "btree" ("id");



CREATE INDEX "fstd_legado_loja_nfd_idx" ON "public"."fstd_legado" USING "btree" ("codigo_loja", "numero_nfd", "legado_id");



CREATE INDEX "fstd_legado_lookup_idx" ON "public"."fstd_legado" USING "btree" ("codigo_loja", "numero_nfd");



CREATE UNIQUE INDEX "fstd_legado_source_hash_full_uidx" ON "public"."fstd_legado" USING "btree" ("source_hash");



CREATE UNIQUE INDEX "fstd_legado_source_hash_uidx" ON "public"."fstd_legado" USING "btree" ("source_hash") WHERE ("source_hash" IS NOT NULL);



CREATE INDEX "fstd_processos_avulsa_match_idx" ON "public"."fstd_processos" USING "btree" ("loja_id", "nfd_numero", "created_at" DESC) WHERE ("is_avulsa" IS TRUE);



CREATE UNIQUE INDEX "fstd_processos_avulsa_number_unique_idx" ON "public"."fstd_processos" USING "btree" ("loja_id", "nfd_numero") WHERE (("is_avulsa" IS TRUE) AND ("status" <> 'cancelada'::"text"));



CREATE INDEX "fstd_processos_conferencia_idx" ON "public"."fstd_processos" USING "btree" ("is_avulsa", "conferencia_status", "status", "updated_at" DESC) WHERE ("is_avulsa" IS TRUE);



CREATE INDEX "fstd_processos_loja_id_idx" ON "public"."fstd_processos" USING "btree" ("loja_id", "created_at" DESC);



CREATE INDEX "fstd_processos_nfd_created_idx" ON "public"."fstd_processos" USING "btree" ("nfd_chave_acesso", "created_at" DESC);



CREATE INDEX "fstd_processos_nfd_created_stable_idx" ON "public"."fstd_processos" USING "btree" ("nfd_chave_acesso", "created_at" DESC, "id" DESC) INCLUDE ("status");



CREATE INDEX "fstd_processos_promotor_id_idx" ON "public"."fstd_processos" USING "btree" ("promotor_id", "created_at" DESC);



CREATE INDEX "fstd_processos_status_idx" ON "public"."fstd_processos" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "fstd_produto_motivos_motivo_id_idx" ON "public"."fstd_produto_motivos" USING "btree" ("motivo_id");



CREATE INDEX "fstd_produto_motivos_produto_id_idx" ON "public"."fstd_produto_motivos" USING "btree" ("produto_id");



CREATE INDEX "fstd_produtos_codigo_produto_idx" ON "public"."fstd_produtos" USING "btree" ("codigo_produto");



CREATE INDEX "fstd_produtos_motivo_id_idx" ON "public"."fstd_produtos" USING "btree" ("motivo_id");



CREATE INDEX "fstd_produtos_processo_id_idx" ON "public"."fstd_produtos" USING "btree" ("processo_id", "status");



CREATE INDEX "loja_promotores_loja_id_idx" ON "public"."loja_promotores" USING "btree" ("loja_id");



CREATE INDEX "loja_promotores_promotor_id_idx" ON "public"."loja_promotores" USING "btree" ("promotor_id");



CREATE INDEX "lojas_cidade_idx" ON "public"."lojas" USING "btree" ("cidade");



CREATE INDEX "lojas_nome_idx" ON "public"."lojas" USING "btree" ("nome");



CREATE INDEX "lojas_uf_idx" ON "public"."lojas" USING "btree" ("uf");



CREATE INDEX "motivos_devolucao_ativo_ordem_idx" ON "public"."motivos_devolucao" USING "btree" ("ativo", "ordem", "nome");



CREATE INDEX "nfd_desconhecimentos_ativos_chave_idx" ON "public"."nfd_desconhecimentos" USING "btree" ("nfd_chave_acesso") WHERE ("reconhecida_em" IS NULL);



CREATE INDEX "nfd_desconhecimentos_ativos_referencia_idx" ON "public"."nfd_desconhecimentos" USING "btree" ("nfd_referencia") WHERE ("reconhecida_em" IS NULL);



CREATE INDEX "nfd_desconhecimentos_chave_ativa_idx" ON "public"."nfd_desconhecimentos" USING "btree" ("nfd_chave_acesso") WHERE ("reconhecida_em" IS NULL);



CREATE INDEX "nfd_desconhecimentos_loja_id_idx" ON "public"."nfd_desconhecimentos" USING "btree" ("loja_id", "created_at" DESC);



CREATE INDEX "nfd_desconhecimentos_nfd_referencia_idx" ON "public"."nfd_desconhecimentos" USING "btree" ("nfd_referencia", "created_at" DESC);



CREATE INDEX "nfd_desconhecimentos_reconhecida_por_idx" ON "public"."nfd_desconhecimentos" USING "btree" ("reconhecida_por") WHERE ("reconhecida_por" IS NOT NULL);



CREATE INDEX "nfd_desconhecimentos_referencia_ativa_idx" ON "public"."nfd_desconhecimentos" USING "btree" ("nfd_referencia") WHERE ("reconhecida_em" IS NULL);



CREATE INDEX "nfd_desconhecimentos_usuario_id_idx" ON "public"."nfd_desconhecimentos" USING "btree" ("usuario_id", "created_at" DESC);



CREATE INDEX "nfd_itens_codigo_cliente_trgm_idx" ON "public"."nfd_itens" USING "gin" ((("codigo_cliente")::"text") "extensions"."gin_trgm_ops");



CREATE INDEX "nfd_itens_dashboard_chave_idx" ON "public"."nfd_itens" USING "btree" ("chave_acesso") INCLUDE ("codigo_produto", "quantidade_galinha", "valor_galinha", "quantidade_codorna", "valor_codorna");



COMMENT ON INDEX "public"."nfd_itens_dashboard_chave_idx" IS 'Cobre a leitura dos itens financeiros da dashboard por chave de acesso.';



CREATE INDEX "nfd_itens_estabelecimento_trgm_idx" ON "public"."nfd_itens" USING "gin" ("lower"("estabelecimento") "extensions"."gin_trgm_ops");



CREATE INDEX "nfd_itens_gerencial_data_idx" ON "public"."nfd_itens" USING "btree" (COALESCE("data_emissao", "data_referencia"));



CREATE INDEX "nfd_itens_gerencial_effective_date_uf_idx" ON "public"."nfd_itens" USING "btree" (COALESCE("data_emissao", "data_referencia"), "upper"(TRIM(BOTH FROM "uf")));



CREATE INDEX "nfd_itens_gerencial_uf_cidade_idx" ON "public"."nfd_itens" USING "btree" ("upper"(("uf")::"text"), "lower"("cidade"));



CREATE INDEX "nfd_itens_nome_abreviado_trgm_idx" ON "public"."nfd_itens" USING "gin" ("lower"("nome_abreviado") "extensions"."gin_trgm_ops");



CREATE INDEX "nfd_itens_nota_fiscal_trgm_idx" ON "public"."nfd_itens" USING "gin" ((("nota_fiscal")::"text") "extensions"."gin_trgm_ops");



CREATE INDEX "usuarios_ativo_idx" ON "public"."usuarios" USING "btree" ("ativo");



CREATE UNIQUE INDEX "usuarios_auth_user_id_unique_idx" ON "public"."usuarios" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "usuarios_estado_idx" ON "public"."usuarios" USING "btree" ("estado");



CREATE INDEX "usuarios_nome_idx" ON "public"."usuarios" USING "btree" ("nome");



CREATE UNIQUE INDEX "usuarios_nome_unico_idx" ON "public"."usuarios" USING "btree" ("lower"("btrim"("nome")));



CREATE INDEX "usuarios_perfil_idx" ON "public"."usuarios" USING "btree" ("perfil");



CREATE INDEX "usuarios_ufs_gin_idx" ON "public"."usuarios" USING "gin" ("ufs");



CREATE OR REPLACE TRIGGER "fstd_avulsa_conferencia_process_change" BEFORE UPDATE ON "public"."fstd_processos" FOR EACH ROW EXECUTE FUNCTION "public"."reset_fstd_avulsa_conferencia_on_process_change"();



CREATE OR REPLACE TRIGGER "fstd_avulsa_conferencia_product_change" AFTER INSERT OR UPDATE OF "codigo_produto", "quantidade_faturada_galinha", "quantidade_faturada_codorna", "status" ON "public"."fstd_produtos" FOR EACH ROW EXECUTE FUNCTION "public"."reset_fstd_avulsa_conferencia_on_product_change"();



CREATE OR REPLACE TRIGGER "fstd_documentos_set_updated_at" BEFORE UPDATE ON "public"."fstd_documentos" FOR EACH ROW EXECUTE FUNCTION "public"."fstd_processos_set_updated_at"();



CREATE OR REPLACE TRIGGER "fstd_processos_set_updated_at" BEFORE UPDATE ON "public"."fstd_processos" FOR EACH ROW EXECUTE FUNCTION "public"."fstd_processos_set_updated_at"();



CREATE OR REPLACE TRIGGER "fstd_produtos_set_updated_at" BEFORE UPDATE ON "public"."fstd_produtos" FOR EACH ROW EXECUTE FUNCTION "public"."fstd_processos_set_updated_at"();



CREATE OR REPLACE TRIGGER "protect_usuario_own_privileges" BEFORE UPDATE ON "public"."usuarios" FOR EACH ROW EXECUTE FUNCTION "public"."protect_usuario_own_privileges"();



CREATE OR REPLACE TRIGGER "trg_devolucoes_avine_atualizado_em" BEFORE UPDATE ON "public"."nfd_itens" FOR EACH ROW EXECUTE FUNCTION "public"."set_atualizado_em"();



CREATE OR REPLACE TRIGGER "validate_loja_promotor_uf" BEFORE INSERT OR UPDATE ON "public"."loja_promotores" FOR EACH ROW EXECUTE FUNCTION "public"."validate_loja_promotor_uf"();



ALTER TABLE ONLY "public"."fstd_documentos"
    ADD CONSTRAINT "fstd_documentos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."fstd_processos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fstd_processos"
    ADD CONSTRAINT "fstd_processos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."fstd_processos"
    ADD CONSTRAINT "fstd_processos_promotor_id_fkey" FOREIGN KEY ("promotor_id") REFERENCES "public"."usuarios"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."fstd_produto_motivos"
    ADD CONSTRAINT "fstd_produto_motivos_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivos_devolucao"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."fstd_produto_motivos"
    ADD CONSTRAINT "fstd_produto_motivos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "public"."fstd_produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fstd_produtos"
    ADD CONSTRAINT "fstd_produtos_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivos_devolucao"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."fstd_produtos"
    ADD CONSTRAINT "fstd_produtos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."fstd_processos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_promotores"
    ADD CONSTRAINT "loja_promotores_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_promotores"
    ADD CONSTRAINT "loja_promotores_promotor_id_fkey" FOREIGN KEY ("promotor_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nfd_desconhecimentos"
    ADD CONSTRAINT "nfd_desconhecimentos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."nfd_desconhecimentos"
    ADD CONSTRAINT "nfd_desconhecimentos_promotor_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."nfd_desconhecimentos"
    ADD CONSTRAINT "nfd_desconhecimentos_reconhecida_por_fkey" FOREIGN KEY ("reconhecida_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "usuarios_auth_user_id_fkey" ON "public"."usuarios" IS 'Preserva o perfil e o historico operacional quando a conta de acesso e excluida.';



ALTER TABLE "public"."fstd_documentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fstd_documentos_select_scoped" ON "public"."fstd_documentos" FOR SELECT TO "authenticated" USING (("app_private"."can_current_user_access_process"("processo_id") OR (EXISTS ( SELECT 1
   FROM ("public"."fstd_processos" "p"
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
  WHERE (("p"."id" = "fstd_documentos"."processo_id") AND ("u"."auth_user_id" = "auth"."uid"()) AND ("u"."perfil" = 'Promotor'::"text") AND "u"."ativo" AND "u"."acesso_habilitado")))));



ALTER TABLE "public"."fstd_legado" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fstd_legado_import_staging" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fstd_legado_select_authorized" ON "public"."fstd_legado" FOR SELECT TO "authenticated" USING ((( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo") OR (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."ativo" IS TRUE))))));



ALTER TABLE "public"."fstd_processos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fstd_processos_insert_own_assigned_store" ON "public"."fstd_processos" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "fstd_processos"."promotor_id") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."perfil" = 'Promotor'::"text") AND ("u"."ativo" IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM "public"."loja_promotores" "lp"
  WHERE (("lp"."loja_id" = "fstd_processos"."loja_id") AND ("lp"."promotor_id" = "fstd_processos"."promotor_id"))))));



CREATE POLICY "fstd_processos_select_scoped" ON "public"."fstd_processos" FOR SELECT TO "authenticated" USING (("app_private"."can_current_user_access_loja"("loja_id") OR (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "fstd_processos"."promotor_id") AND ("u"."auth_user_id" = "auth"."uid"()) AND ("u"."perfil" = 'Promotor'::"text") AND "u"."ativo" AND "u"."acesso_habilitado")))));



CREATE POLICY "fstd_processos_update_own" ON "public"."fstd_processos" FOR UPDATE TO "authenticated" USING (("app_private"."is_current_user_admin_ativo"() OR ("app_private"."is_current_user_scoped_gerencial_ativo"() AND (EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "fstd_processos"."loja_id") AND ("l"."uf" = "app_private"."current_user_uf"()))))) OR (("status" = 'em_andamento'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "fstd_processos"."promotor_id") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."perfil" = 'Promotor'::"text") AND ("u"."ativo" IS TRUE))))))) WITH CHECK (("app_private"."is_current_user_admin_ativo"() OR ("app_private"."is_current_user_scoped_gerencial_ativo"() AND (EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "fstd_processos"."loja_id") AND ("l"."uf" = "app_private"."current_user_uf"()))))) OR (("status" = 'em_andamento'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "fstd_processos"."promotor_id") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."perfil" = 'Promotor'::"text") AND ("u"."ativo" IS TRUE)))))));



ALTER TABLE "public"."fstd_produto_motivos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fstd_produto_motivos_delete_own" ON "public"."fstd_produto_motivos" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."fstd_produtos" "fp"
     JOIN "public"."fstd_processos" "p" ON (("p"."id" = "fp"."processo_id")))
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
  WHERE (("fp"."id" = "fstd_produto_motivos"."produto_id") AND ("p"."status" = 'em_andamento'::"text") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."perfil" = 'Promotor'::"text") AND ("u"."ativo" IS TRUE)))));



CREATE POLICY "fstd_produto_motivos_insert_own" ON "public"."fstd_produto_motivos" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."fstd_produtos" "fp"
     JOIN "public"."fstd_processos" "p" ON (("p"."id" = "fp"."processo_id")))
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
  WHERE (("fp"."id" = "fstd_produto_motivos"."produto_id") AND ("p"."status" = 'em_andamento'::"text") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."perfil" = 'Promotor'::"text") AND ("u"."ativo" IS TRUE)))));



CREATE POLICY "fstd_produto_motivos_select_scoped" ON "public"."fstd_produto_motivos" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."fstd_produtos" "fp"
  WHERE (("fp"."id" = "fstd_produto_motivos"."produto_id") AND "app_private"."can_current_user_access_process"("fp"."processo_id")))) OR (EXISTS ( SELECT 1
   FROM (("public"."fstd_produtos" "fp"
     JOIN "public"."fstd_processos" "p" ON (("p"."id" = "fp"."processo_id")))
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
  WHERE (("fp"."id" = "fstd_produto_motivos"."produto_id") AND ("u"."auth_user_id" = "auth"."uid"()) AND ("u"."perfil" = 'Promotor'::"text") AND "u"."ativo" AND "u"."acesso_habilitado")))));



ALTER TABLE "public"."fstd_produtos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fstd_produtos_insert_own" ON "public"."fstd_produtos" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."fstd_processos" "p"
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
  WHERE (("p"."id" = "fstd_produtos"."processo_id") AND ("p"."status" = 'em_andamento'::"text") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."perfil" = 'Promotor'::"text") AND ("u"."ativo" IS TRUE)))));



CREATE POLICY "fstd_produtos_select_scoped" ON "public"."fstd_produtos" FOR SELECT TO "authenticated" USING (("app_private"."can_current_user_access_process"("processo_id") OR (EXISTS ( SELECT 1
   FROM ("public"."fstd_processos" "p"
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
  WHERE (("p"."id" = "fstd_produtos"."processo_id") AND ("u"."auth_user_id" = "auth"."uid"()) AND ("u"."perfil" = 'Promotor'::"text") AND "u"."ativo" AND "u"."acesso_habilitado")))));



CREATE POLICY "fstd_produtos_update_own" ON "public"."fstd_produtos" FOR UPDATE TO "authenticated" USING ((( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo") OR (EXISTS ( SELECT 1
   FROM ("public"."fstd_processos" "p"
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
  WHERE (("p"."id" = "fstd_produtos"."processo_id") AND ("p"."status" = 'em_andamento'::"text") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."perfil" = 'Promotor'::"text") AND ("u"."ativo" IS TRUE)))))) WITH CHECK ((( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo") OR (EXISTS ( SELECT 1
   FROM ("public"."fstd_processos" "p"
     JOIN "public"."usuarios" "u" ON (("u"."id" = "p"."promotor_id")))
  WHERE (("p"."id" = "fstd_produtos"."processo_id") AND ("p"."status" = 'em_andamento'::"text") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."perfil" = 'Promotor'::"text") AND ("u"."ativo" IS TRUE))))));



ALTER TABLE "public"."loja_promotores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loja_promotores_delete_authorized" ON "public"."loja_promotores" FOR DELETE TO "authenticated" USING ("app_private"."can_current_user_access_loja"("loja_id"));



CREATE POLICY "loja_promotores_insert_authorized" ON "public"."loja_promotores" FOR INSERT TO "authenticated" WITH CHECK ((("promotor_id" IS NOT NULL) AND "app_private"."can_current_user_assign_promotor"("loja_id", "promotor_id")));



CREATE POLICY "loja_promotores_select_authorized" ON "public"."loja_promotores" FOR SELECT TO "authenticated" USING (("app_private"."can_current_user_access_loja"("loja_id") OR (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "loja_promotores"."promotor_id") AND ("u"."auth_user_id" = "auth"."uid"()) AND ("u"."perfil" = 'Promotor'::"text") AND "u"."ativo" AND "u"."acesso_habilitado")))));



CREATE POLICY "loja_promotores_update_authorized" ON "public"."loja_promotores" FOR UPDATE TO "authenticated" USING ("app_private"."can_current_user_access_loja"("loja_id")) WITH CHECK ((("promotor_id" IS NOT NULL) AND "app_private"."can_current_user_assign_promotor"("loja_id", "promotor_id")));



ALTER TABLE "public"."lojas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lojas_delete_admin" ON "public"."lojas" FOR DELETE TO "authenticated" USING ("app_private"."is_current_user_admin_ativo"());



CREATE POLICY "lojas_insert_admin" ON "public"."lojas" FOR INSERT TO "authenticated" WITH CHECK ("app_private"."is_current_user_admin_ativo"());



CREATE POLICY "lojas_select_authorized" ON "public"."lojas" FOR SELECT TO "authenticated" USING (("app_private"."can_current_user_manage_uf"("uf") OR (EXISTS ( SELECT 1
   FROM ("public"."loja_promotores" "lp"
     JOIN "public"."usuarios" "u" ON (("u"."id" = "lp"."promotor_id")))
  WHERE (("lp"."loja_id" = "lojas"."id") AND ("u"."auth_user_id" = "auth"."uid"()) AND ("u"."perfil" = 'Promotor'::"text") AND "u"."ativo" AND "u"."acesso_habilitado")))));



CREATE POLICY "lojas_update_admin" ON "public"."lojas" FOR UPDATE TO "authenticated" USING ("app_private"."is_current_user_admin_ativo"()) WITH CHECK ("app_private"."is_current_user_admin_ativo"());



CREATE POLICY "motivos_delete_gerencial" ON "public"."motivos_devolucao" FOR DELETE TO "authenticated" USING (( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo"));



ALTER TABLE "public"."motivos_devolucao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "motivos_insert_gerencial" ON "public"."motivos_devolucao" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo"));



CREATE POLICY "motivos_select_authenticated" ON "public"."motivos_devolucao" FOR SELECT TO "authenticated" USING (((("ativo" IS TRUE) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."ativo" IS TRUE) AND ("u"."acesso_habilitado" IS TRUE))))) OR ( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo")));



CREATE POLICY "motivos_update_gerencial" ON "public"."motivos_devolucao" FOR UPDATE TO "authenticated" USING (( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo")) WITH CHECK (( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo"));



ALTER TABLE "public"."nfd_desconhecimentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nfd_desconhecimentos_insert_current_user_with_store_access" ON "public"."nfd_desconhecimentos" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "nfd_desconhecimentos"."usuario_id") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."ativo" IS TRUE)))) AND "app_private"."can_current_user_access_loja"("loja_id")));



CREATE POLICY "nfd_desconhecimentos_select_scoped" ON "public"."nfd_desconhecimentos" FOR SELECT TO "authenticated" USING (("public"."is_current_user_gerencial_ativo"() OR (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "nfd_desconhecimentos"."usuario_id") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."ativo" IS TRUE))))));



ALTER TABLE "public"."nfd_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nfd_itens_select_scoped" ON "public"."nfd_itens" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."codigo" = ("nfd_itens"."codigo_cliente")::"text") AND "app_private"."can_current_user_access_loja"("l"."id")))) OR (EXISTS ( SELECT 1
   FROM (("public"."lojas" "l"
     JOIN "public"."loja_promotores" "lp" ON (("lp"."loja_id" = "l"."id")))
     JOIN "public"."usuarios" "u" ON (("u"."id" = "lp"."promotor_id")))
  WHERE (("l"."codigo" = ("nfd_itens"."codigo_cliente")::"text") AND ("u"."auth_user_id" = "auth"."uid"()) AND ("u"."perfil" = 'Promotor'::"text") AND "u"."ativo" AND "u"."acesso_habilitado")))));



ALTER TABLE "public"."nfd_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."produtos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "produtos_select_authenticated" ON "public"."produtos" FOR SELECT TO "authenticated" USING (((("status" IS TRUE) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."ativo" IS TRUE) AND ("u"."acesso_habilitado" IS TRUE))))) OR ( SELECT "app_private"."is_current_user_gerencial_ativo"() AS "is_current_user_gerencial_ativo")));



ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuarios_insert_scoped_promotor" ON "public"."usuarios" FOR INSERT TO "authenticated" WITH CHECK (("app_private"."is_current_user_scoped_gerencial_ativo"() AND ("perfil" = 'Promotor'::"text") AND ("estado" = ANY ("app_private"."current_user_ufs"())) AND ("ufs" = ARRAY["estado"])));



CREATE POLICY "usuarios_select_scoped" ON "public"."usuarios" FOR SELECT TO "authenticated" USING (((("auth_user_id" = "auth"."uid"()) AND "ativo" AND "acesso_habilitado") OR "app_private"."is_current_user_admin_ativo"() OR ("app_private"."is_current_user_scoped_gerencial_ativo"() AND ("perfil" = 'Promotor'::"text") AND ("estado" = ANY ("app_private"."current_user_ufs"())))));



CREATE POLICY "usuarios_update_own_presentation" ON "public"."usuarios" FOR UPDATE TO "authenticated" USING ((("auth_user_id" = "auth"."uid"()) AND "ativo" AND "acesso_habilitado")) WITH CHECK ((("auth_user_id" = "auth"."uid"()) AND "ativo" AND "acesso_habilitado"));



CREATE POLICY "usuarios_update_scoped_promotor" ON "public"."usuarios" FOR UPDATE TO "authenticated" USING (("app_private"."is_current_user_scoped_gerencial_ativo"() AND ("perfil" = 'Promotor'::"text") AND ("estado" = ANY ("app_private"."current_user_ufs"())))) WITH CHECK (("app_private"."is_current_user_scoped_gerencial_ativo"() AND ("perfil" = 'Promotor'::"text") AND ("estado" = ANY ("app_private"."current_user_ufs"())) AND ("ufs" = ARRAY["estado"])));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fstd_numero_controle_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fstd_documentos" TO "service_role";
GRANT SELECT ON TABLE "public"."fstd_documentos" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."carregar_dashboard_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_uf" "text", "p_cidade" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."carregar_dashboard_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_uf" "text", "p_cidade" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."carregar_dashboard_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_uf" "text", "p_cidade" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."carregar_fontes_dashboard_gerencial"("p_chaves_acesso" "text"[], "p_referencias_legadas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."carregar_fontes_dashboard_gerencial"("p_chaves_acesso" "text"[], "p_referencias_legadas" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."carregar_fontes_dashboard_gerencial"("p_chaves_acesso" "text"[], "p_referencias_legadas" "jsonb") TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."fstd_produtos" TO "authenticated";
GRANT ALL ON TABLE "public"."fstd_produtos" TO "service_role";



REVOKE ALL ON FUNCTION "public"."concluir_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_observacao" "text", "p_fotos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."concluir_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_observacao" "text", "p_fotos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."concluir_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_observacao" "text", "p_fotos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."concluir_fstd_produto_avulso"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text", "p_fotos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."concluir_fstd_produto_avulso"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text", "p_fotos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."concluir_fstd_produto_avulso"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text", "p_fotos" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."conferir_fstd_avulsas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conferir_fstd_avulsas"() TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_gerencial_user"("p_auth_user_id" "uuid", "p_nome" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_gerencial_user"("p_auth_user_id" "uuid", "p_nome" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_gerencial_user"("p_auth_user_id" "uuid", "p_nome" "text", "p_email" "text") TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."nfd_desconhecimentos" TO "authenticated";
GRANT ALL ON TABLE "public"."nfd_desconhecimentos" TO "service_role";



REVOKE ALL ON FUNCTION "public"."desconhecer_nfd_gerencial"("p_loja_id" "uuid", "p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_loja_codigo" "text", "p_comentario" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."desconhecer_nfd_gerencial"("p_loja_id" "uuid", "p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_loja_codigo" "text", "p_comentario" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."desconhecer_nfd_gerencial"("p_loja_id" "uuid", "p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_loja_codigo" "text", "p_comentario" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."editar_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text", "p_fotos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."editar_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text", "p_fotos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."editar_fstd_produto"("p_produto_id" "uuid", "p_divisoes" "jsonb", "p_quantidade_faturada_galinha" integer, "p_quantidade_faturada_codorna" integer, "p_observacao" "text", "p_fotos" "jsonb") TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."fstd_processos" TO "authenticated";
GRANT ALL ON TABLE "public"."fstd_processos" TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalizar_fstd_produtos"("p_processo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalizar_fstd_produtos"("p_processo_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalizar_fstd_produtos"("p_processo_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fstd_processos_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fstd_processos_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fstd_processos_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_fstd_document"("p_processo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_fstd_document"("p_processo_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_or_create_fstd_document"("p_processo_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."iniciar_fstd_avulsa"("p_loja_id" "uuid", "p_nfd_numero" "text", "p_nfd_valor" numeric, "p_nfd_data_emissao" "date", "p_produtos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."iniciar_fstd_avulsa"("p_loja_id" "uuid", "p_nfd_numero" "text", "p_nfd_valor" numeric, "p_nfd_data_emissao" "date", "p_produtos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."iniciar_fstd_avulsa"("p_loja_id" "uuid", "p_nfd_numero" "text", "p_nfd_valor" numeric, "p_nfd_data_emissao" "date", "p_produtos" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."iniciar_fstd_produtos"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_produtos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."iniciar_fstd_produtos"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_produtos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."iniciar_fstd_produtos"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text", "p_produtos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."iniciar_fstd_produtos_v2"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."iniciar_fstd_produtos_v2"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."iniciar_fstd_produtos_v2"("p_loja_id" "uuid", "p_nfd_chave_acesso" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_current_user_gerencial_ativo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_current_user_gerencial_ativo"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_current_user_gerencial_ativo"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."listar_nfd_notas_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_status" "text", "p_uf" "text", "p_cidade" "text", "p_pesquisa" "text", "p_ordenar_por" "text", "p_direcao" "text", "p_limite" integer, "p_deslocamento" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listar_nfd_notas_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_status" "text", "p_uf" "text", "p_cidade" "text", "p_pesquisa" "text", "p_ordenar_por" "text", "p_direcao" "text", "p_limite" integer, "p_deslocamento" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."listar_nfd_notas_gerencial"("p_data_inicial" "date", "p_data_final" "date", "p_status" "text", "p_uf" "text", "p_cidade" "text", "p_pesquisa" "text", "p_ordenar_por" "text", "p_direcao" "text", "p_limite" integer, "p_deslocamento" integer) TO "authenticated";



GRANT ALL ON TABLE "public"."fstd_legado" TO "service_role";
GRANT SELECT ON TABLE "public"."fstd_legado" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."obter_fstd_legado"("p_codigo_loja" "text", "p_numero_nfd" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."obter_fstd_legado"("p_codigo_loja" "text", "p_numero_nfd" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."obter_fstd_legado"("p_codigo_loja" "text", "p_numero_nfd" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."protect_usuario_own_privileges"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconhecer_nfd_gerencial"("p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconhecer_nfd_gerencial"("p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."reconhecer_nfd_gerencial"("p_nfd_referencia" "text", "p_nfd_chave_acesso" "text", "p_nfd_numero" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_usuario_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_usuario_access"() TO "service_role";
GRANT ALL ON FUNCTION "public"."record_usuario_access"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."recuperar_fstd_documentos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recuperar_fstd_documentos"() TO "service_role";
GRANT ALL ON FUNCTION "public"."recuperar_fstd_documentos"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reset_fstd_avulsa_conferencia_on_process_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_fstd_avulsa_conferencia_on_process_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_fstd_avulsa_conferencia_on_product_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_fstd_avulsa_conferencia_on_product_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_atualizado_em"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_atualizado_em"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_atualizado_em"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_fstd_document_pdf"("p_document_id" "uuid", "p_pdf_path" "text", "p_pdf_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_fstd_document_pdf"("p_document_id" "uuid", "p_pdf_path" "text", "p_pdf_metadata" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_fstd_document_pdf"("p_document_id" "uuid", "p_pdf_path" "text", "p_pdf_metadata" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_gerencial_user"("p_usuario_id" "uuid", "p_nome" "text", "p_email" "text", "p_ativo" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_gerencial_user"("p_usuario_id" "uuid", "p_nome" "text", "p_email" "text", "p_ativo" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_gerencial_user"("p_usuario_id" "uuid", "p_nome" "text", "p_email" "text", "p_ativo" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_loja_promotor_uf"() TO "service_role";



GRANT ALL ON TABLE "public"."nfd_itens" TO "service_role";
GRANT SELECT ON TABLE "public"."nfd_itens" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."devolucoes_avine_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."devolucoes_avine_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."nfd_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."devolucoes_avine_sync_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."devolucoes_avine_sync_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fstd_legado_canonico" TO "service_role";
GRANT SELECT ON TABLE "public"."fstd_legado_canonico" TO "authenticated";



GRANT ALL ON TABLE "public"."fstd_legado_import_staging" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fstd_legado_import_staging_import_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fstd_legado_legado_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."fstd_produto_motivos" TO "authenticated";
GRANT ALL ON TABLE "public"."fstd_produto_motivos" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."lojas" TO "authenticated";
GRANT ALL ON TABLE "public"."lojas" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."motivos_devolucao" TO "authenticated";
GRANT ALL ON TABLE "public"."motivos_devolucao" TO "service_role";



GRANT ALL ON TABLE "public"."nfd_notas" TO "service_role";
GRANT SELECT ON TABLE "public"."nfd_notas" TO "authenticated";



GRANT ALL ON TABLE "public"."fstd_relatorio" TO "service_role";
GRANT SELECT ON TABLE "public"."fstd_relatorio" TO "authenticated";



GRANT ALL ON TABLE "public"."fstd_relatorio_produtos" TO "service_role";
GRANT SELECT ON TABLE "public"."fstd_relatorio_produtos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."loja_promotores" TO "authenticated";
GRANT ALL ON TABLE "public"."loja_promotores" TO "service_role";



GRANT ALL ON TABLE "public"."lojas_com_promotores" TO "service_role";
GRANT SELECT ON TABLE "public"."lojas_com_promotores" TO "authenticated";



GRANT ALL ON TABLE "public"."produtos" TO "service_role";
GRANT SELECT ON TABLE "public"."produtos" TO "authenticated";



GRANT ALL ON TABLE "public"."produtos_expandidos" TO "service_role";
GRANT SELECT ON TABLE "public"."produtos_expandidos" TO "authenticated";



GRANT ALL ON TABLE "public"."produtos_precos_unitarios" TO "service_role";
GRANT SELECT ON TABLE "public"."produtos_precos_unitarios" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
