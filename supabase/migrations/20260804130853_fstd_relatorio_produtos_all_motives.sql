-- Relatorio de FSTDs concluidas com uma linha para cada produto e motivo.
-- A fstd_relatorio continua usando o motivo dominante; esta view nao.

create or replace view public.fstd_relatorio_produtos
with (security_invoker = true)
as
with produto_motivos as (
  select
    p.id as processo_id,
    fp.id as produto_id,
    fp.codigo_produto as codigo_produto,
    fp.nome as nome_produto,
    coalesce(fp.quantidade_faturada_galinha, 0) as galinha_faturada_produto,
    coalesce(fp.quantidade_faturada_codorna, 0) as codorna_faturada_produto,
    coalesce(fpm.motivo_id, fp.motivo_id) as motivo_id,
    md.nome as motivo_nome,
    case
      when fpm.id is not null then coalesce(fpm.quantidade_faturada, 0)
      else coalesce(fp.quantidade_faturada_galinha, 0)
        + coalesce(fp.quantidade_faturada_codorna, 0)
    end as quantidade_faturada_motivo,
    case
      when fpm.id is not null then coalesce(fpm.quantidade, 0)
      else coalesce(fp.quantidade_retorno, 0)
    end as quantidade_retorno_motivo
  from public.fstd_processos as p
  join public.fstd_produtos as fp
    on fp.processo_id = p.id
  left join public.fstd_produto_motivos as fpm
    on fpm.produto_id = fp.id
  left join public.motivos_devolucao as md
    on md.id = coalesce(fpm.motivo_id, fp.motivo_id)
  where p.status = 'concluida'
)
select
  coalesce(nullif(btrim(p.nfd_numero), ''), n.nota_fiscal::text) as nfd,
  d.numero_controle as fstd,
  concat_ws(
    ' - ',
    l.codigo,
    coalesce(nullif(btrim(p.nfd_numero), ''), n.nota_fiscal::text)
  ) as id,
  coalesce(n.data_emissao, p.nfd_data_emissao) as data_emissao,
  (p.finalizada_em at time zone 'America/Sao_Paulo')::date as data_baixa,
  round(valores.vl_galinha + valores.vl_codorna, 2)::numeric(14, 2) as valor,
  valores.vl_galinha,
  valores.vl_codorna,
  'Malote'::text as motorista,
  pm.motivo_nome as motivo_emissao,
  coalesce(n.nome_abreviado, l.nome) as nome_abreviado,
  u.nome as responsavel_fstd,
  case
    when pm.galinha_faturada_produto > 0
      then pm.quantidade_faturada_motivo
    else 0
  end::bigint as galinha_nfd,
  case
    when pm.codorna_faturada_produto > 0
      then pm.quantidade_faturada_motivo
    else 0
  end::bigint as codorna_nfd,
  case
    when pm.galinha_faturada_produto > 0
      then pm.quantidade_retorno_motivo
    else 0
  end::bigint as galinha_retorno,
  case
    when pm.codorna_faturada_produto > 0
      then pm.quantidade_retorno_motivo
    else 0
  end::bigint as codorna_retorno,
  pm.nome_produto as nome_produto
from public.fstd_processos as p
join produto_motivos as pm
  on pm.processo_id = p.id
join public.lojas as l
  on l.id = p.loja_id
join public.usuarios as u
  on u.id = p.promotor_id
left join public.fstd_documentos as d
  on d.processo_id = p.id
left join public.nfd_notas as n
  on n.chave_acesso = p.nfd_chave_acesso
left join lateral (
  select
    sum(coalesce(ni_item.quantidade_galinha, 0)) as quantidade_galinha,
    sum(coalesce(ni_item.quantidade_codorna, 0)) as quantidade_codorna,
    sum(coalesce(ni_item.valor_galinha, 0)) as valor_galinha,
    sum(coalesce(ni_item.valor_codorna, 0)) as valor_codorna
  from public.nfd_itens as ni_item
  where ni_item.chave_acesso = p.nfd_chave_acesso
    and upper(btrim(ni_item.codigo_produto)) = upper(btrim(pm.codigo_produto))
) as ni
  on true
left join lateral (
  select case
    when pm.galinha_faturada_produto + pm.codorna_faturada_produto > 0
      then pm.quantidade_faturada_motivo::numeric
        / (pm.galinha_faturada_produto + pm.codorna_faturada_produto)
    else 1::numeric
  end as fator_motivo
) as rate
  on true
left join lateral (
  select
    round(
      case
        when pm.galinha_faturada_produto > 0
          then coalesce(ni.valor_galinha, 0) * rate.fator_motivo
        else 0
      end,
      2
    )::numeric(14, 2) as vl_galinha,
    round(
      case
        when pm.codorna_faturada_produto > 0
          then coalesce(ni.valor_codorna, 0) * rate.fator_motivo
        else 0
      end,
      2
    )::numeric(14, 2) as vl_codorna
) as valores
  on true
where p.status = 'concluida';

comment on view public.fstd_relatorio_produtos is
  'Relatorio de FSTDs concluidas com uma linha por produto e motivo, com valores proporcionais a quantidade faturada.';

revoke all on table public.fstd_relatorio_produtos from anon;
grant select on table public.fstd_relatorio_produtos to authenticated;

notify pgrst, 'reload schema';
