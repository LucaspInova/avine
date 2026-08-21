-- The management dashboard used one request per 45 access keys for each source.
-- A typical 20-day period contains thousands of NFDs, so latency accumulated
-- across dozens of browser-to-API round trips. This RPC accepts the selected
-- keys in the request body and returns the same RLS-filtered source rows at once.
create or replace function public.carregar_fontes_dashboard_gerencial(
  p_chaves_acesso text[] default '{}',
  p_referencias_legadas jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
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

revoke all on function public.carregar_fontes_dashboard_gerencial(text[], jsonb) from public;
grant execute on function public.carregar_fontes_dashboard_gerencial(text[], jsonb) to authenticated;

comment on function public.carregar_fontes_dashboard_gerencial(text[], jsonb) is
  'Agrupa as fontes da Dashboard Geral em uma unica chamada, preservando RLS e o escopo do usuario autenticado.';

notify pgrst, 'reload schema';
