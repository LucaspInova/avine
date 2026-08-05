-- Relatorio consolidado de FSTDs concluidas para exportacao/consulta gerencial.
-- A view usa security_invoker para manter as politicas RLS das tabelas de origem.

drop view if exists public.fstd_relatorio;

create view public.fstd_relatorio
with (security_invoker = true)
as
with produtos_fstd as (
  select
    p.id as processo_id,
    fp.id as produto_id,
    coalesce(fp.quantidade_faturada_galinha, 0) as galinha_faturada,
    coalesce(fp.quantidade_faturada_codorna, 0) as codorna_faturada,
    coalesce(fp.quantidade_retorno, 0) as retorno,
    fp.motivo_id as motivo_produto_id
  from public.fstd_processos as p
  join public.fstd_produtos as fp
    on fp.processo_id = p.id
  where p.status = 'concluida'
),
totais_fstd as (
  select
    processo_id,
    sum(galinha_faturada)::bigint as galinha_faturada,
    sum(codorna_faturada)::bigint as codorna_faturada,
    sum(case when galinha_faturada > 0 then retorno else 0 end)::bigint
      as galinha_retorno,
    sum(case
      when galinha_faturada = 0 and codorna_faturada > 0 then retorno
      else 0
    end)::bigint as codorna_retorno
  from produtos_fstd
  group by processo_id
),
motivos_por_nota as (
  select
    pf.processo_id,
    coalesce(fpm.motivo_id, pf.motivo_produto_id) as motivo_id,
    sum(case
      when fpm.id is not null then coalesce(fpm.quantidade_faturada, 0)
      else pf.galinha_faturada + pf.codorna_faturada
    end)::bigint as quantidade_faturada,
    sum(case
      when fpm.id is not null then coalesce(fpm.quantidade, 0)
      else pf.retorno
    end)::bigint as quantidade_retorno
  from produtos_fstd as pf
  left join public.fstd_produto_motivos as fpm
    on fpm.produto_id = pf.produto_id
  where coalesce(fpm.motivo_id, pf.motivo_produto_id) is not null
  group by
    pf.processo_id,
    coalesce(fpm.motivo_id, pf.motivo_produto_id)
),
motivos_ordenados as (
  select
    mpn.*,
    md.nome as motivo_nome,
    row_number() over (
      partition by mpn.processo_id
      order by
        mpn.quantidade_faturada desc,
        mpn.quantidade_retorno desc,
        md.ordem asc,
        md.nome asc,
        mpn.motivo_id
    ) as ordem_motivo
  from motivos_por_nota as mpn
  join public.motivos_devolucao as md
    on md.id = mpn.motivo_id
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
  round(
    case
      when n.chave_acesso is not null
        then coalesce(n.valor_galinha, 0) + coalesce(n.valor_codorna, 0)
      else coalesce(p.nfd_valor, 0)
    end,
    2
  )::numeric(14, 2) as valor,
  round(coalesce(n.valor_galinha, 0), 2)::numeric(14, 2) as vl_galinha,
  round(coalesce(n.valor_codorna, 0), 2)::numeric(14, 2) as vl_codorna,
  'Malote'::text as motorista,
  mo.motivo_nome as motivo_emissao,
  coalesce(n.nome_abreviado, l.nome) as nome_abreviado,
  u.nome as responsavel_fstd,
  coalesce(n.quantidade_galinha, tf.galinha_faturada, 0) as galinha_nfd,
  coalesce(n.quantidade_codorna, tf.codorna_faturada, 0) as codorna_nfd,
  coalesce(tf.galinha_retorno, 0) as galinha_retorno,
  coalesce(tf.codorna_retorno, 0) as codorna_retorno
from public.fstd_processos as p
join public.lojas as l
  on l.id = p.loja_id
join public.usuarios as u
  on u.id = p.promotor_id
left join public.fstd_documentos as d
  on d.processo_id = p.id
left join public.nfd_notas as n
  on n.chave_acesso = p.nfd_chave_acesso
left join totais_fstd as tf
  on tf.processo_id = p.id
left join motivos_ordenados as mo
  on mo.processo_id = p.id
 and mo.ordem_motivo = 1
where p.status = 'concluida';

comment on view public.fstd_relatorio is
  'Relatorio consolidado das FSTDs concluidas, com dados da NFD, controle, motivos, quantidades e responsavel.';

revoke all on table public.fstd_relatorio from anon;
grant select on table public.fstd_relatorio to authenticated;

notify pgrst, 'reload schema';
