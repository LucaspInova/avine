-- Fetch the complete Dashboard Geral payload in one request.  The prior flow
-- first paginated the expensive nfd_notas view and then called a second RPC.
-- This reads only the dashboard columns from nfd_itens and keeps RLS active.
create or replace function public.carregar_dashboard_gerencial(
  p_data_inicial date,
  p_data_final date,
  p_uf text default null,
  p_cidade text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
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

revoke all on function public.carregar_dashboard_gerencial(date, date, text, text) from public;
grant execute on function public.carregar_dashboard_gerencial(date, date, text, text) to authenticated;

comment on function public.carregar_dashboard_gerencial(date, date, text, text) is
  'Payload completo da Dashboard Geral em uma chamada, usando nfd_itens com RLS em vez da view nfd_notas paginada.';

notify pgrst, 'reload schema';
