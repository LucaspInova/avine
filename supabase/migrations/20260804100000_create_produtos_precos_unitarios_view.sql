-- Lista de precos por unidade (ovo) baseada no registro mais recente
-- encontrado para cada codigo de produto na importacao das NFDs.

drop view if exists public.produtos_precos_unitarios;

create view public.produtos_precos_unitarios
with (security_invoker = true)
as
with catalogo as (
  select distinct on (upper(btrim(pe.codigo_produto)))
    upper(btrim(pe.codigo_produto)) as codigo_produto,
    pe.nome as nome_produto,
    pe.categoria,
    pe.ovos_und
  from public.produtos_expandidos as pe
  where pe.status is true
  order by
    upper(btrim(pe.codigo_produto)),
    pe.nome,
    pe.produto_id
),
ultima_data as (
  select
    upper(btrim(ni.codigo_produto)) as codigo_produto,
    max(ni.data_referencia) as data_preco
  from public.nfd_itens as ni
  where ni.quantidade_galinha > 0
     or ni.quantidade_codorna > 0
  group by upper(btrim(ni.codigo_produto))
),
precos_recentes as (
  select
    upper(btrim(ni.codigo_produto)) as codigo_produto,
    ud.data_preco,
    sum(coalesce(ni.valor_galinha, 0) + coalesce(ni.valor_codorna, 0))
      as valor_analisado,
    sum(coalesce(ni.quantidade_galinha, 0) + coalesce(ni.quantidade_codorna, 0))
      as quantidade_analisada,
    sum(coalesce(ni.quantidade_galinha, 0)) as quantidade_galinha,
    sum(coalesce(ni.quantidade_codorna, 0)) as quantidade_codorna,
    count(*)::integer as registros_analisados,
    max(ni.descricao_produto) as descricao_origem
  from public.nfd_itens as ni
  join ultima_data as ud
    on ud.codigo_produto = upper(btrim(ni.codigo_produto))
   and ud.data_preco = ni.data_referencia
  group by
    upper(btrim(ni.codigo_produto)),
    ud.data_preco
)
select
  coalesce(c.codigo_produto, pr.codigo_produto) as codigo_produto,
  coalesce(c.nome_produto, pr.descricao_origem) as nome_produto,
  c.categoria,
  c.ovos_und as ovos_por_embalagem,
  case
    when pr.quantidade_galinha > 0 and pr.quantidade_codorna = 0
      then 'Galinha'
    when pr.quantidade_codorna > 0 and pr.quantidade_galinha = 0
      then 'Codorna'
    when pr.quantidade_galinha > 0 and pr.quantidade_codorna > 0
      then 'Misto'
    else null
  end as tipo_ovo,
  pr.data_preco,
  pr.registros_analisados,
  pr.quantidade_analisada,
  round(pr.valor_analisado / nullif(pr.quantidade_analisada, 0), 4)
    ::numeric(14, 4) as preco_unitario,
  round(pr.valor_analisado, 2)::numeric(14, 2) as valor_analisado
from catalogo as c
full join precos_recentes as pr
  on pr.codigo_produto = c.codigo_produto;

comment on view public.produtos_precos_unitarios is
  'Preco medio ponderado por unidade do produto, calculado no lote mais recente de NFDs por codigo.';

revoke all on table public.produtos_precos_unitarios from anon;
grant select on table public.produtos_precos_unitarios to authenticated;

notify pgrst, 'reload schema';
