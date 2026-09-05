-- Restore substring semantics for numeric searches without returning to an
-- unindexed scan of the invoice item source. The grouped nfd_notas view can
-- push these predicates down because both fields are grouping columns.
create extension if not exists pg_trgm with schema extensions;

create index if not exists nfd_itens_nota_fiscal_trgm_idx
  on public.nfd_itens using gin ((nota_fiscal::text) extensions.gin_trgm_ops);

create index if not exists nfd_itens_codigo_cliente_trgm_idx
  on public.nfd_itens using gin ((codigo_cliente::text) extensions.gin_trgm_ops);

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

  -- Keep casts guarded so oversized digit-only input never raises 22003.
  if v_search ~ '^\d{1,10}$' then
    if v_search::numeric between 0 and 2147483647 then
      v_numeric_search := v_search::integer;
    end if;
  elsif v_search ~ '^\d{44}$' then
    v_access_key_search := v_search;
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
    ), candidates as materialized (
      select n.chave_acesso::text, n.estabelecimento::text,
        n.nota_fiscal::bigint, n.data_emissao::date, n.data_referencia::date,
        n.codigo_cliente::bigint, n.nome_abreviado::text, upper(n.uf::text) uf,
        n.cidade::text, n.quantidade_galinha::bigint,
        n.quantidade_codorna::bigint, n.valor_total::numeric,
        coalesce(n.data_emissao, n.data_referencia)::date data_ordenacao,
        coalesce(nullif(trim(n.nome_abreviado::text), ''),
          nullif(trim(n.estabelecimento::text), ''), n.codigo_cliente::text) nome_ordenacao
      from public.nfd_notas n
      cross join scope s
      where (s.is_admin or upper(trim(n.uf::text)) = any(s.ufs))
        and ($1 is null or coalesce(n.data_emissao, n.data_referencia)::date >= $1)
        and ($2 is null or coalesce(n.data_emissao, n.data_referencia)::date <= $2)
        and ($4 is null or upper(trim(n.uf::text)) = any(string_to_array(upper($4), ',')))
        and ($5 is null or lower(n.cidade::text) = any(string_to_array(lower($5), ',')))
        and (
          $6 is null
          or ($9 is not null and (
            n.nota_fiscal = $9
            or n.codigo_cliente = $9
            or n.nota_fiscal::text like '%%' || $6 || '%%'
            or n.codigo_cliente::text like '%%' || $6 || '%%'
          ))
          or ($10 is not null and n.chave_acesso = $10)
          or ($9 is null and $10 is null
            and concat_ws(' ', n.nome_abreviado, n.estabelecimento,
              n.nota_fiscal, n.codigo_cliente) ilike '%%' || $6 || '%%')
        )
    ), base as materialized (
      select c.*,
        case
          when desconhecida.encontrada then 'Desconhecida'
          when legado.legado_id is not null or processo.status = 'concluida' then 'Finalizada'
          else 'Pendente'
        end status,
        legado.legado_id is not null fstd_legado
      from candidates c
      left join lateral (
        select p.status
        from public.fstd_processos p
        where p.nfd_chave_acesso = c.chave_acesso
        order by p.created_at desc, p.id desc
        limit 1
      ) processo on true
      left join lateral (
        select true encontrada
        from public.nfd_desconhecimentos d
        where d.reconhecida_em is null
          and (d.nfd_chave_acesso = c.chave_acesso
            or d.nfd_referencia = concat(c.codigo_cliente, ':', c.nota_fiscal))
        limit 1
      ) desconhecida on true
      left join lateral (
        select fl.legado_id
        from public.fstd_legado fl
        where fl.codigo_loja = c.codigo_cliente::text
          and fl.numero_nfd = c.nota_fiscal::text
        order by fl.legado_id
        limit 1
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
      'ufs', coalesce((
        select jsonb_agg(distinct uf order by uf) from candidates
      ), '[]'::jsonb),
      'cities', coalesce((
        select jsonb_agg(distinct cidade order by cidade)
        from candidates
        where $4 is null
          or upper(trim(uf)) = any(string_to_array(upper($4), ','))
      ), '[]'::jsonb)
    )
    from filtered
  $query$, v_order, v_direction, v_order, v_direction)
  into v_result
  using p_data_inicial, p_data_final, p_status, p_uf, p_cidade,
    v_search, p_limite, p_deslocamento, v_numeric_search, v_access_key_search;

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
) is 'Pagina NFDs gerenciais; pesquisa numerica encontra ocorrencias parciais em NFD/cliente com suporte de indices trigrama.';

notify pgrst, 'reload schema';
