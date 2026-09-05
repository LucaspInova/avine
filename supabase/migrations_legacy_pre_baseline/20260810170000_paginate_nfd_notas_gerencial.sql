-- Server-side filtering/paging for the managerial NFD grid.  Authorization is
-- repeated here deliberately: callers cannot broaden a Gerencial user's UF.
drop function if exists public.listar_nfd_notas_gerencial(date, date);

create function public.listar_nfd_notas_gerencial(
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
language plpgsql stable security invoker set search_path = public, pg_temp
as $$
declare
  v_order text;
  v_direction text := lower(coalesce(p_direcao, 'desc'));
  v_result jsonb;
begin
  if not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Acesso gerencial ativo obrigatorio.' using errcode = '42501';
  end if;
  if p_ordenar_por not in ('loja','nota_fiscal','data_emissao','uf','status') then
    raise exception 'Coluna de ordenacao invalida.' using errcode = '22023';
  end if;
  if v_direction not in ('asc','desc') then
    raise exception 'Direcao de ordenacao invalida.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('Finalizada','Pendente','Desconhecida') then
    raise exception 'Status invalido.' using errcode = '22023';
  end if;
  if p_limite not between 1 and 100 or p_deslocamento < 0 then
    raise exception 'Limite ou deslocamento invalido.' using errcode = '22023';
  end if;

  v_order := case p_ordenar_por
    when 'loja' then 'nome_ordenacao'
    when 'nota_fiscal' then 'nota_fiscal'
    when 'data_emissao' then 'data_ordenacao'
    when 'uf' then 'uf'
    when 'status' then 'status'
  end;

  execute format($query$
    with base as materialized (
      select n.chave_acesso::text, n.estabelecimento::text,
        n.nota_fiscal::bigint, n.data_emissao::date, n.data_referencia::date,
        n.codigo_cliente::bigint, n.nome_abreviado::text, upper(n.uf::text) uf,
        n.cidade::text, n.quantidade_galinha::bigint, n.quantidade_codorna::bigint,
        n.valor_total::numeric, legado.legado_id is not null fstd_legado,
        coalesce(n.data_emissao, n.data_referencia)::date data_ordenacao,
        coalesce(nullif(trim(n.nome_abreviado::text), ''), nullif(trim(n.estabelecimento::text), ''), n.codigo_cliente::text) nome_ordenacao,
        case when desconhecida.encontrada then 'Desconhecida'
             when legado.legado_id is not null or processo.status = 'concluida' then 'Finalizada'
             else 'Pendente' end status
      from public.nfd_notas n
      left join lateral (select p.status from public.fstd_processos p
        where p.nfd_chave_acesso = n.chave_acesso order by p.created_at desc, p.id desc limit 1) processo on true
      left join lateral (select true encontrada from public.nfd_desconhecimentos d
        where d.reconhecida_em is null and (d.nfd_chave_acesso = n.chave_acesso
          or d.nfd_referencia = concat(n.codigo_cliente, ':', n.nota_fiscal)) limit 1) desconhecida on true
      left join lateral (select fl.legado_id from public.fstd_legado fl
        where fl.codigo_loja = n.codigo_cliente::text and fl.numero_nfd = n.nota_fiscal::text
        order by fl.legado_id limit 1) legado on true
      where app_private.can_current_user_manage_uf(n.uf::text)
        and ($1 is null or coalesce(n.data_emissao, n.data_referencia)::date >= $1)
        and ($2 is null or coalesce(n.data_emissao, n.data_referencia)::date <= $2)
        and ($4 is null or upper(n.uf::text) = upper($4))
        and ($5 is null or lower(n.cidade::text) = lower($5))
        and ($6 is null or concat_ws(' ', n.nome_abreviado, n.estabelecimento, n.nota_fiscal, n.codigo_cliente) ilike '%%' || $6 || '%%')
    ), filtered as materialized (select * from base where $3 is null or status = $3),
    page as (select * from filtered order by %I %s nulls last, chave_acesso asc limit $7 offset $8)
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(p) - 'data_ordenacao' - 'nome_ordenacao' order by %I %s nulls last, chave_acesso asc) from page p), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'counts', jsonb_build_object('Finalizada', count(*) filter (where status='Finalizada'), 'Pendente', count(*) filter (where status='Pendente'), 'Desconhecida', count(*) filter (where status='Desconhecida')),
      'ufs', coalesce((select jsonb_agg(distinct uf order by uf) from base), '[]'::jsonb),
      'cities', coalesce((select jsonb_agg(distinct cidade order by cidade) from base where $4 is null or uf=upper($4)), '[]'::jsonb)
    ) from filtered
  $query$, v_order, v_direction, v_order, v_direction)
  into v_result using p_data_inicial, p_data_final, p_status, p_uf, p_cidade,
    nullif(trim(p_pesquisa), ''), p_limite, p_deslocamento;
  return v_result;
end $$;

revoke all on function public.listar_nfd_notas_gerencial(date,date,text,text,text,text,text,text,integer,integer) from public;
grant execute on function public.listar_nfd_notas_gerencial(date,date,text,text,text,text,text,text,integer,integer) to authenticated;

-- The effective date expression and location filters used above.
create index if not exists nfd_itens_gerencial_data_idx on public.nfd_itens ((coalesce(data_emissao, data_referencia)::date));
create index if not exists nfd_itens_gerencial_uf_cidade_idx on public.nfd_itens ((upper(uf)), (lower(cidade)));
create index if not exists fstd_processos_nfd_created_stable_idx on public.fstd_processos (nfd_chave_acesso, created_at desc, id desc) include (status);
create index if not exists nfd_desconhecimentos_chave_ativa_idx on public.nfd_desconhecimentos (nfd_chave_acesso) where reconhecida_em is null;
create index if not exists nfd_desconhecimentos_referencia_ativa_idx on public.nfd_desconhecimentos (nfd_referencia) where reconhecida_em is null;
create index if not exists fstd_legado_loja_nfd_idx on public.fstd_legado (codigo_loja, numero_nfd, legado_id);

comment on function public.listar_nfd_notas_gerencial(date,date,text,text,text,text,text,text,integer,integer) is
  'Pagina e agregados de NFDs; ordenacao allowlisted e escopo de UF aplicado no banco.';
notify pgrst, 'reload schema';
