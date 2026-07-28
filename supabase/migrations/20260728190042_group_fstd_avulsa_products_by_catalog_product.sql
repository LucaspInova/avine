-- Keep one FSTD product per catalog product while accepting every linked code.
create or replace function public.iniciar_fstd_avulsa(
  p_loja_id uuid,
  p_nfd_numero text,
  p_nfd_valor numeric,
  p_nfd_data_emissao date,
  p_produtos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_processo public.fstd_processos;
  v_numero text := nullif(pg_catalog.btrim(p_nfd_numero), '');
  v_valid_products integer;
  v_total_products integer;
begin
  if v_auth_user_id is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;

  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = v_auth_user_id
    and u.perfil = 'Promotor'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  if not exists (
    select 1
    from public.loja_promotores as lp
    where lp.loja_id = p_loja_id
      and lp.promotor_id = v_promotor_id
  ) then
    raise exception 'Loja nao atribuida ao promotor autenticado.';
  end if;

  if v_numero is null then
    raise exception 'Codigo da NFD obrigatorio.';
  end if;

  if p_nfd_valor is null or p_nfd_valor < 0 then
    raise exception 'Informe um valor de NFD valido.';
  end if;

  if p_nfd_data_emissao is null then
    raise exception 'Data de emissao da NFD obrigatoria.';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_produtos, '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_array_length(coalesce(p_produtos, '[]'::jsonb)) = 0 then
    raise exception 'Selecione ao menos um produto para a NFD avulsa.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
    where nullif(pg_catalog.btrim(item.codigo_produto), '') is null
  ) then
    raise exception 'Produto invalido na NFD avulsa.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
    where not exists (
      select 1
      from public.produtos_expandidos as catalog
      where catalog.codigo_produto = pg_catalog.upper(pg_catalog.btrim(item.codigo_produto))
        and catalog.status is true
    )
  ) then
    raise exception 'Um ou mais produtos selecionados nao estao disponiveis no catalogo.';
  end if;

  select count(*)
  into v_valid_products
  from (
    select distinct pg_catalog.upper(pg_catalog.btrim(item.codigo_produto)) as codigo_produto
    from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
  ) as requested
  join public.produtos_expandidos as catalog
    on catalog.codigo_produto = requested.codigo_produto
   and catalog.status is true;

  if v_valid_products = 0 then
    raise exception 'Nenhum produto valido foi selecionado para a NFD avulsa.';
  end if;

  select p.*
  into v_processo
  from public.fstd_processos as p
  where p.is_avulsa is true
    and p.loja_id = p_loja_id
    and p.nfd_numero = v_numero
    and p.status <> 'cancelada'
  for update;

  if v_processo.id is not null and v_processo.promotor_id <> v_promotor_id then
    raise exception 'Esta NFD avulsa ja pertence a outro Promotor.';
  end if;

  if v_processo.status = 'concluida' then
    raise exception 'Esta NFD avulsa ja foi finalizada.';
  end if;

  if v_processo.id is null then
    insert into public.fstd_processos (
      nfd_chave_acesso,
      nfd_numero,
      loja_id,
      promotor_id,
      is_avulsa,
      nfd_data_emissao,
      nfd_valor
    )
    values (
      'AVULSA:' || pg_catalog.md5(v_promotor_id::text || ':' || p_loja_id::text || ':' || v_numero),
      v_numero,
      p_loja_id,
      v_promotor_id,
      true,
      p_nfd_data_emissao,
      round(p_nfd_valor, 2)
    )
    returning * into v_processo;
  else
    update public.fstd_processos
    set
      nfd_data_emissao = p_nfd_data_emissao,
      nfd_valor = round(p_nfd_valor, 2),
      updated_at = now()
    where id = v_processo.id
    returning * into v_processo;
  end if;

  insert into public.fstd_produtos (
    processo_id,
    produto_id,
    codigo_produto,
    nome,
    descricao,
    imagem_url
  )
  select
    selected.processo_id,
    selected.produto_id,
    selected.codigo_produto,
    selected.nome,
    selected.nome,
    selected.imagem_url
  from (
    select distinct on (catalog.produto_id)
      v_processo.id as processo_id,
      catalog.produto_id,
      catalog.codigo_produto,
      catalog.nome,
      catalog.imagem_url
    from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
    join public.produtos_expandidos as catalog
      on catalog.codigo_produto = pg_catalog.upper(pg_catalog.btrim(item.codigo_produto))
     and catalog.status is true
    order by catalog.produto_id, catalog.codigo_produto
  ) as selected
  where not exists (
    select 1
    from public.fstd_produtos as existing
    where existing.processo_id = selected.processo_id
      and existing.produto_id = selected.produto_id
  )
  on conflict (processo_id, codigo_produto) do nothing;

  select count(*)
  into v_total_products
  from public.fstd_produtos as fp
  where fp.processo_id = v_processo.id;

  if v_total_products = 0 then
    raise exception 'Nenhum produto foi adicionado a NFD avulsa.';
  end if;

  return v_processo.id;
end;
$function$;

revoke all on function public.iniciar_fstd_avulsa(uuid, text, numeric, date, jsonb) from public, anon;
grant execute on function public.iniciar_fstd_avulsa(uuid, text, numeric, date, jsonb) to authenticated;

create or replace function public.conferir_fstd_avulsas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_processo record;
  v_nfd record;
  v_numero_normalizado text;
  v_mismatches jsonb;
  v_quantity_mismatches jsonb;
  v_conferidas integer := 0;
  v_divergentes integer := 0;
  v_pendentes integer := 0;
begin
  for v_processo in
    select
      p.id,
      p.nfd_numero,
      p.nfd_data_emissao,
      p.nfd_valor,
      p.loja_id,
      l.codigo::text as loja_codigo
    from public.fstd_processos as p
    join public.lojas as l on l.id = p.loja_id
    where p.is_avulsa is true
      and p.status <> 'cancelada'
  loop
    v_numero_normalizado := nullif(
      ltrim(btrim(v_processo.nfd_numero), '0'),
      ''
    );
    v_numero_normalizado := coalesce(v_numero_normalizado, '0');

    select n.*
    into v_nfd
    from public.nfd_notas as n
    where n.nota_fiscal::text = v_numero_normalizado
    order by
      case
        when btrim(coalesce(n.codigo_cliente::text, '')) = btrim(v_processo.loja_codigo)
          then 0
        else 1
      end,
      n.data_emissao desc nulls last
    limit 1;

    if not found then
      update public.fstd_processos
      set
        conferencia_status = 'pendente',
        conferencia_detalhes = jsonb_build_object(
          'status', 'aguardando_api',
          'mensagem', 'A NFD ainda nao foi encontrada na base importada da API.',
          'numero_nfd', v_processo.nfd_numero
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = null,
        updated_at = now()
      where id = v_processo.id;

      v_pendentes := v_pendentes + 1;
      continue;
    end if;

    v_mismatches := '[]'::jsonb;

    if btrim(coalesce(v_nfd.codigo_cliente::text, ''))
      is distinct from btrim(v_processo.loja_codigo) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'codigo_loja',
        'informado', v_processo.loja_codigo,
        'api', v_nfd.codigo_cliente
      ));
    end if;

    if v_processo.nfd_data_emissao is null
      or v_nfd.data_emissao is null
      or v_processo.nfd_data_emissao is distinct from v_nfd.data_emissao then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'data_emissao',
        'informado', v_processo.nfd_data_emissao,
        'api', v_nfd.data_emissao
      ));
    end if;

    if v_processo.nfd_valor is null
      or v_nfd.valor_total is null
      or abs(v_processo.nfd_valor - v_nfd.valor_total) > 0.01 then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'valor',
        'informado', v_processo.nfd_valor,
        'api', v_nfd.valor_total
      ));
    end if;

    if exists (
      select 1
      from public.fstd_produtos as fp
      where fp.processo_id = v_processo.id
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
          where (
            fp.produto_id is not null
            and exists (
              select 1
              from public.produtos_expandidos as catalog
              where catalog.produto_id = fp.produto_id
                and upper(btrim(catalog.codigo_produto)) = upper(btrim(item->>'codigo_produto'))
            )
          )
          or (
            fp.produto_id is null
            and upper(btrim(item->>'codigo_produto')) = upper(btrim(fp.codigo_produto))
          )
        )
    ) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'produtos',
        'mensagem', 'Existe produto na FSTD que nao foi encontrado na NFD da API.'
      ));
    end if;

    if exists (
      select 1
      from (
        select distinct upper(btrim(item->>'codigo_produto')) as codigo_produto
        from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
      ) as api_product
      where not exists (
        select 1
        from public.fstd_produtos as fp
        where fp.processo_id = v_processo.id
          and (
            (
              fp.produto_id is not null
              and exists (
                select 1
                from public.produtos_expandidos as catalog
                where catalog.produto_id = fp.produto_id
                  and upper(btrim(catalog.codigo_produto)) = api_product.codigo_produto
              )
            )
            or (
              fp.produto_id is null
              and upper(btrim(fp.codigo_produto)) = api_product.codigo_produto
            )
          )
      )
    ) then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'produtos',
        'mensagem', 'Existe produto na NFD da API que nao foi adicionado na FSTD.'
      ));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo_produto', fp.codigo_produto,
      'fstd_galinha', fp.quantidade_faturada_galinha,
      'api_galinha', api_product.quantidade_galinha,
      'fstd_codorna', fp.quantidade_faturada_codorna,
      'api_codorna', api_product.quantidade_codorna
    )), '[]'::jsonb)
    into v_quantity_mismatches
    from public.fstd_produtos as fp
    left join lateral (
      select
        coalesce(sum(coalesce((item->>'quantidade_galinha')::numeric, 0)), 0)::integer as quantidade_galinha,
        coalesce(sum(coalesce((item->>'quantidade_codorna')::numeric, 0)), 0)::integer as quantidade_codorna
      from jsonb_array_elements(coalesce(v_nfd.detalhes, '[]'::jsonb)) as item
      where (
        fp.produto_id is not null
        and exists (
          select 1
          from public.produtos_expandidos as catalog
          where catalog.produto_id = fp.produto_id
            and upper(btrim(catalog.codigo_produto)) = upper(btrim(item->>'codigo_produto'))
        )
      )
      or (
        fp.produto_id is null
        and upper(btrim(item->>'codigo_produto')) = upper(btrim(fp.codigo_produto))
      )
    ) as api_product on true
    where fp.processo_id = v_processo.id
      and (
        fp.quantidade_faturada_galinha <> api_product.quantidade_galinha
        or fp.quantidade_faturada_codorna <> api_product.quantidade_codorna
      );

    if jsonb_array_length(v_quantity_mismatches) > 0 then
      v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
        'campo', 'quantidades',
        'itens', v_quantity_mismatches
      ));
    end if;

    if jsonb_array_length(v_mismatches) > 0 then
      update public.fstd_processos
      set
        conferencia_status = 'divergente',
        conferencia_detalhes = jsonb_build_object(
          'numero_nfd', v_processo.nfd_numero,
          'api_chave_acesso', v_nfd.chave_acesso,
          'divergencias', v_mismatches
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = v_nfd.chave_acesso,
        updated_at = now()
      where id = v_processo.id;

      v_divergentes := v_divergentes + 1;
    else
      update public.fstd_processos
      set
        conferencia_status = 'conferida',
        conferencia_detalhes = jsonb_build_object(
          'numero_nfd', v_processo.nfd_numero,
          'api_chave_acesso', v_nfd.chave_acesso,
          'mensagem', 'NFD avulsa conferida com sucesso.'
        ),
        conferencia_em = now(),
        api_nfd_chave_acesso = v_nfd.chave_acesso,
        updated_at = now()
      where id = v_processo.id;

      v_conferidas := v_conferidas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'conferidas', v_conferidas,
    'divergentes', v_divergentes,
    'pendentes', v_pendentes
  );
end;
$function$;

revoke all on function public.iniciar_fstd_avulsa(uuid, text, numeric, date, jsonb) from public, anon;
grant execute on function public.iniciar_fstd_avulsa(uuid, text, numeric, date, jsonb) to authenticated;
revoke all on function public.conferir_fstd_avulsas() from public, anon, authenticated;
grant execute on function public.conferir_fstd_avulsas() to service_role;

notify pgrst, 'reload schema';
