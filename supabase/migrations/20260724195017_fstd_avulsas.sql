-- Support physical NFDs that are entered by a promoter before they exist in
-- the imported NFD dataset.
alter table public.fstd_processos
  add column if not exists is_avulsa boolean not null default false,
  add column if not exists nfd_data_emissao date,
  add column if not exists nfd_valor numeric(14, 2);

comment on column public.fstd_processos.is_avulsa is
  'Identifica processos criados manualmente a partir de uma NFD fisica.';
comment on column public.fstd_processos.nfd_data_emissao is
  'Data informada na criacao da NFD avulsa.';
comment on column public.fstd_processos.nfd_valor is
  'Valor informado na criacao da NFD avulsa.';

create index if not exists fstd_processos_avulsa_match_idx
  on public.fstd_processos (loja_id, nfd_numero, created_at desc)
  where is_avulsa is true;

create unique index if not exists fstd_processos_avulsa_number_unique_idx
  on public.fstd_processos (loja_id, nfd_numero)
  where is_avulsa is true and status <> 'cancelada';

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
  select distinct on (catalog.codigo_produto)
    v_processo.id,
    catalog.produto_id,
    catalog.codigo_produto,
    catalog.nome,
    catalog.nome,
    catalog.imagem_url
  from pg_catalog.jsonb_to_recordset(p_produtos) as item(codigo_produto text)
  join public.produtos_expandidos as catalog
    on catalog.codigo_produto = pg_catalog.upper(pg_catalog.btrim(item.codigo_produto))
   and catalog.status is true
  order by catalog.codigo_produto, catalog.nome
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

create or replace function public.concluir_fstd_produto_avulso(
  p_produto_id uuid,
  p_divisoes jsonb,
  p_quantidade_faturada_galinha integer,
  p_quantidade_faturada_codorna integer,
  p_observacao text default null,
  p_fotos jsonb default '[]'::jsonb
)
returns public.fstd_produtos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_promotor_id uuid;
  v_item public.fstd_produtos;
begin
  select u.id
  into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Promotor'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor com acesso ativo nao encontrado para o usuario autenticado.';
  end if;

  if p_quantidade_faturada_galinha is null
    or p_quantidade_faturada_codorna is null
    or p_quantidade_faturada_galinha < 0
    or p_quantidade_faturada_codorna < 0
    or p_quantidade_faturada_galinha + p_quantidade_faturada_codorna <= 0 then
    raise exception 'Informe um faturado geral maior que zero.';
  end if;

  select fp.*
  into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and fp.status = 'pendente'
    and p.is_avulsa is true
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
    and exists (
      select 1
      from public.loja_promotores as lp
      where lp.loja_id = p.loja_id
        and lp.promotor_id = v_promotor_id
    )
  for update of fp, p;

  if v_item.id is null then
    raise exception 'Produto avulso nao encontrado, nao autorizado ou ja finalizado.';
  end if;

  update public.fstd_produtos
  set
    quantidade_faturada_galinha = p_quantidade_faturada_galinha,
    quantidade_faturada_codorna = p_quantidade_faturada_codorna,
    updated_at = now()
  where id = p_produto_id;

  return public.concluir_fstd_produto(
    p_produto_id,
    p_divisoes,
    p_observacao,
    p_fotos
  );
end;
$function$;

revoke all on function public.concluir_fstd_produto_avulso(uuid, jsonb, integer, integer, text, jsonb) from public, anon;
grant execute on function public.concluir_fstd_produto_avulso(uuid, jsonb, integer, integer, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
