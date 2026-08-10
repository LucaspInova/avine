-- FSTD legado is an independent source of completed notes. It participates in
-- status resolution without creating rows in the current product workflow.
drop function if exists public.listar_nfd_notas_gerencial(date, date);

create function public.listar_nfd_notas_gerencial(
  p_data_inicial date default null,
  p_data_final date default null
)
returns table (
  chave_acesso text, estabelecimento text, nota_fiscal bigint, data_emissao date,
  data_referencia date, codigo_cliente bigint, nome_abreviado text, uf text,
  cidade text, quantidade_galinha bigint, quantidade_codorna bigint,
  valor_total numeric, status text, fstd_legado boolean
)
language sql stable security invoker set search_path = public
as $$
  select n.chave_acesso::text, n.estabelecimento::text, n.nota_fiscal::bigint,
    n.data_emissao::date, n.data_referencia::date, n.codigo_cliente::bigint,
    n.nome_abreviado::text, n.uf::text, n.cidade::text,
    n.quantidade_galinha::bigint, n.quantidade_codorna::bigint,
    n.valor_total::numeric,
    case
      when exists (select 1 from public.nfd_desconhecimentos d where d.reconhecida_em is null and (d.nfd_chave_acesso = n.chave_acesso or d.nfd_referencia = concat(n.codigo_cliente, ':', n.nota_fiscal))) then 'Desconhecida'
      when legado.legado_id is not null then 'Finalizada'
      when processo.status = 'concluida' then 'Finalizada'
      else 'Pendente'
    end,
    legado.legado_id is not null
  from public.nfd_notas n
  left join lateral (select p.status from public.fstd_processos p where p.nfd_chave_acesso = n.chave_acesso order by p.created_at desc limit 1) processo on true
  left join lateral (select fl.legado_id from public.fstd_legado fl where fl.codigo_loja = n.codigo_cliente::text and fl.numero_nfd = n.nota_fiscal::text order by fl.legado_id limit 1) legado on true
  where (p_data_inicial is null or coalesce(n.data_emissao, n.data_referencia)::date >= p_data_inicial)
    and (p_data_final is null or coalesce(n.data_emissao, n.data_referencia)::date <= p_data_final)
  order by coalesce(n.data_emissao, n.data_referencia) desc, n.nota_fiscal desc;
$$;

revoke all on function public.listar_nfd_notas_gerencial(date, date) from public;
grant execute on function public.listar_nfd_notas_gerencial(date, date) to authenticated;
comment on function public.listar_nfd_notas_gerencial(date, date) is 'Resumo de NFDs com status atual e FSTD legado por codigo_loja-numero_nfd.';
notify pgrst, 'reload schema';
