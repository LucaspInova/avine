-- A tela gerencial precisa apenas de um resumo por NFD. Consolidar o status no
-- banco evita transferir e combinar, no navegador, quatro conjuntos completos.
create or replace function public.listar_nfd_notas_gerencial(
  p_data_inicial date default null,
  p_data_final date default null
)
returns table (
  chave_acesso text,
  estabelecimento text,
  nota_fiscal bigint,
  data_emissao date,
  data_referencia date,
  codigo_cliente bigint,
  nome_abreviado text,
  uf text,
  cidade text,
  quantidade_galinha bigint,
  quantidade_codorna bigint,
  valor_total numeric,
  status text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    n.chave_acesso::text,
    n.estabelecimento::text,
    n.nota_fiscal::bigint,
    n.data_emissao::date,
    n.data_referencia::date,
    n.codigo_cliente::bigint,
    n.nome_abreviado::text,
    n.uf::text,
    n.cidade::text,
    n.quantidade_galinha::bigint,
    n.quantidade_codorna::bigint,
    n.valor_total::numeric,
    case
      when exists (
        select 1 from public.nfd_desconhecimentos d
        where d.reconhecida_em is null
          and (d.nfd_chave_acesso = n.chave_acesso
            or d.nfd_referencia = concat(n.codigo_cliente, ':', n.nota_fiscal))
      ) then 'Desconhecida'
      when processo.status = 'concluida' then 'Finalizada'
      else 'Pendente'
    end
  from public.nfd_notas n
  left join lateral (
    select p.status
    from public.fstd_processos p
    where p.nfd_chave_acesso = n.chave_acesso
    order by p.created_at desc
    limit 1
  ) processo on true
  where (p_data_inicial is null or coalesce(n.data_emissao, n.data_referencia)::date >= p_data_inicial)
    and (p_data_final is null or coalesce(n.data_emissao, n.data_referencia)::date <= p_data_final)
  order by coalesce(n.data_emissao, n.data_referencia) desc, n.nota_fiscal desc;
$$;

revoke all on function public.listar_nfd_notas_gerencial(date, date) from public;
grant execute on function public.listar_nfd_notas_gerencial(date, date) to authenticated;

create index if not exists fstd_processos_nfd_created_idx
  on public.fstd_processos (nfd_chave_acesso, created_at desc);
create index if not exists nfd_desconhecimentos_chave_ativa_idx
  on public.nfd_desconhecimentos (nfd_chave_acesso) where reconhecida_em is null;
create index if not exists nfd_desconhecimentos_referencia_ativa_idx
  on public.nfd_desconhecimentos (nfd_referencia) where reconhecida_em is null;

comment on function public.listar_nfd_notas_gerencial(date, date) is
  'Resumo filtrado de NFDs para Admin/Gerencial, com status consolidado no banco.';
