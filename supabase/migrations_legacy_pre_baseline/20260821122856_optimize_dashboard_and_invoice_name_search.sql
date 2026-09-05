-- The dashboard already receives the modern FSTD products and legacy returns
-- from their source tables. Its additional read of fstd_relatorio rebuilt a
-- broad reporting view during every initial render, causing statement timeouts.
-- Keep the reporting view for exports, but do not make the dashboard depend on
-- it. This migration also makes the Notes "Procurar" field use indexed,
-- authorized substring matching for client/store names.

create extension if not exists pg_trgm with schema extensions;

create index if not exists nfd_itens_nome_abreviado_trgm_idx
  on public.nfd_itens using gin (lower(nome_abreviado) extensions.gin_trgm_ops);

create index if not exists nfd_itens_estabelecimento_trgm_idx
  on public.nfd_itens using gin (lower(estabelecimento) extensions.gin_trgm_ops);

create or replace function app_private.search_nfd_chaves_by_name(
  p_search text
) returns table (chave_acesso text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
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

revoke all on function app_private.search_nfd_chaves_by_name(text) from public;
grant execute on function app_private.search_nfd_chaves_by_name(text) to authenticated;

comment on function app_private.search_nfd_chaves_by_name(text) is
  'Retorna somente chaves NFD autorizadas para a pesquisa parcial por nome antes da barreira RLS; o RPC publico reaplica RLS ao carregar as notas.';

create or replace function public.listar_nfd_notas_gerencial(
  p_data_inicial date default null,
  p_data_final date default null,
  p_status text default null,
  p_uf text default null,
  p_cidade text default null,
  p_pesquisa text default null,
  p_ordenar_por text default 'data_emissao',
  p_direcao text default 'desc',
  p_limite integer default 10,
  p_deslocamento integer default 0
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
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
$$;

revoke all on function public.listar_nfd_notas_gerencial(
  date, date, text, text, text, text, text, text, integer, integer
) from public;

grant execute on function public.listar_nfd_notas_gerencial(
  date, date, text, text, text, text, text, text, integer, integer
) to authenticated;

comment on function public.listar_nfd_notas_gerencial(
  date, date, text, text, text, text, text, text, integer, integer
) is 'Pagina NFDs gerenciais; procura parcialmente por NFD/cliente ou nome/estabelecimento com chaves autorizadas e indices trigrama.';

notify pgrst, 'reload schema';
