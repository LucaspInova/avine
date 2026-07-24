-- Stabilizes access control and the Promotor workflow without deleting legacy
-- data. The legacy start RPC remains as a compatibility wrapper, but it no
-- longer trusts products, quantities or the NFD number supplied by the client.

alter table public.usuarios
  add column if not exists acesso_habilitado boolean not null default false;

update public.usuarios
set acesso_habilitado = (auth_user_id is not null and ativo is true)
where acesso_habilitado is distinct from (auth_user_id is not null and ativo is true);

comment on column public.usuarios.acesso_habilitado is
  'Controls application access independently from the operational profile status.';

create or replace function public.is_current_user_gerencial_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.usuarios as u
    where u.auth_user_id = (select auth.uid())
      and u.perfil = 'Gerencial'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
$function$;

revoke all on function public.is_current_user_gerencial_ativo() from public, anon;
grant execute on function public.is_current_user_gerencial_ativo() to authenticated;

drop policy if exists usuarios_select_self_or_gerencial on public.usuarios;
create policy usuarios_select_self_or_gerencial
on public.usuarios
for select
to authenticated
using (
  (
    auth_user_id = (select auth.uid())
    and ativo is true
    and acesso_habilitado is true
  )
  or (select public.is_current_user_gerencial_ativo())
);

drop policy if exists usuarios_insert_gerencial on public.usuarios;
create policy usuarios_insert_gerencial
on public.usuarios
for insert
to authenticated
with check (
  (select public.is_current_user_gerencial_ativo())
  and perfil = any (array['Promotor', 'Entregador', 'Gerencial'])
  and estado = any (array['CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL'])
);

drop policy if exists usuarios_update_gerencial on public.usuarios;
create policy usuarios_update_gerencial
on public.usuarios
for update
to authenticated
using ((select public.is_current_user_gerencial_ativo()))
with check (
  (select public.is_current_user_gerencial_ativo())
  and perfil = any (array['Promotor', 'Entregador', 'Gerencial'])
  and estado = any (array['CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL'])
);

drop policy if exists usuarios_delete_gerencial on public.usuarios;
create policy usuarios_delete_gerencial
on public.usuarios
for delete
to authenticated
using ((select public.is_current_user_gerencial_ativo()));

create or replace function public.iniciar_fstd_produtos_v2(
  p_loja_id uuid,
  p_nfd_chave_acesso text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_loja_codigo text;
  v_chave_acesso text := nullif(btrim(p_nfd_chave_acesso), '');
  v_nfd_numero text;
  v_processo public.fstd_processos;
  v_produtos_inseridos integer;
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

  select l.codigo
  into v_loja_codigo
  from public.lojas as l
  join public.loja_promotores as lp
    on lp.loja_id = l.id
   and lp.promotor_id = v_promotor_id
  where l.id = p_loja_id
  limit 1;

  if v_loja_codigo is null then
    raise exception 'Loja nao atribuida ao promotor autenticado.';
  end if;

  if v_chave_acesso is null then
    raise exception 'Chave de acesso da NFD obrigatoria.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_chave_acesso, 0)
  );

  select min(ni.nota_fiscal)::text
  into v_nfd_numero
  from public.nfd_itens as ni
  where ni.chave_acesso::text = v_chave_acesso
    and ni.codigo_cliente::text = v_loja_codigo;

  if v_nfd_numero is null then
    raise exception 'NFD nao encontrada para a loja informada.';
  end if;

  if exists (
    select 1
    from public.nfd_itens as ni
    where ni.chave_acesso::text = v_chave_acesso
      and ni.codigo_cliente::text <> v_loja_codigo
  ) then
    raise exception 'A NFD possui itens associados a outra loja.';
  end if;

  select p.*
  into v_processo
  from public.fstd_processos as p
  where p.nfd_chave_acesso = v_chave_acesso
    and p.status <> 'cancelada'
  for update;

  if v_processo.id is not null then
    if v_processo.promotor_id <> v_promotor_id
      or v_processo.loja_id <> p_loja_id then
      raise exception 'Esta NFD ja pertence a outro Promotor ou loja.';
    end if;

    return v_processo.id;
  end if;

  insert into public.fstd_processos (
    nfd_chave_acesso,
    nfd_numero,
    loja_id,
    promotor_id
  )
  values (
    v_chave_acesso,
    v_nfd_numero,
    p_loja_id,
    v_promotor_id
  )
  returning * into v_processo;

  insert into public.fstd_produtos (
    processo_id,
    produto_id,
    codigo_produto,
    nome,
    descricao,
    imagem_url,
    quantidade_faturada_galinha,
    quantidade_faturada_codorna
  )
  select
    v_processo.id,
    catalog.produto_id,
    items.codigo_produto,
    coalesce(catalog.nome, items.descricao, items.codigo_produto),
    items.descricao,
    catalog.imagem_url,
    items.quantidade_galinha,
    items.quantidade_codorna
  from (
    select
      upper(btrim(ni.codigo_produto)) as codigo_produto,
      max(nullif(btrim(ni.descricao_produto), '')) as descricao,
      sum(greatest(coalesce(ni.quantidade_galinha, 0), 0))::integer as quantidade_galinha,
      sum(greatest(coalesce(ni.quantidade_codorna, 0), 0))::integer as quantidade_codorna
    from public.nfd_itens as ni
    where ni.chave_acesso::text = v_chave_acesso
      and ni.codigo_cliente::text = v_loja_codigo
      and nullif(btrim(ni.codigo_produto), '') is not null
    group by upper(btrim(ni.codigo_produto))
  ) as items
  left join public.produtos_expandidos as catalog
    on catalog.codigo_produto = items.codigo_produto
  on conflict (processo_id, codigo_produto) do nothing;

  get diagnostics v_produtos_inseridos = row_count;
  if v_produtos_inseridos = 0 then
    raise exception 'Nenhum produto valido foi encontrado para esta NFD.';
  end if;

  return v_processo.id;
end;
$function$;

revoke all on function public.iniciar_fstd_produtos_v2(uuid, text) from public, anon;
grant execute on function public.iniciar_fstd_produtos_v2(uuid, text) to authenticated;

-- Compatibility wrapper. The two client-supplied fields are intentionally
-- ignored so old frontend versions receive the same server-derived behavior.
create or replace function public.iniciar_fstd_produtos(
  p_loja_id uuid,
  p_nfd_chave_acesso text,
  p_nfd_numero text,
  p_produtos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return public.iniciar_fstd_produtos_v2(
    p_loja_id,
    p_nfd_chave_acesso
  );
end;
$function$;

revoke all on function public.iniciar_fstd_produtos(uuid, text, text, jsonb) from public, anon;
grant execute on function public.iniciar_fstd_produtos(uuid, text, text, jsonb) to authenticated;

create or replace function public.concluir_fstd_produto(
  p_produto_id uuid,
  p_divisoes jsonb,
  p_observacao text default null,
  p_fotos jsonb default '[]'::jsonb
)
returns public.fstd_produtos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_item public.fstd_produtos;
  v_processo_id uuid;
  v_total_faturado integer;
  v_total_divisoes_faturado integer;
  v_total_retorno integer;
  v_divisao_count integer;
  v_photo_prefix text;
begin
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

  if jsonb_typeof(coalesce(p_divisoes, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_divisoes, '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos um motivo e um faturado.';
  end if;

  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' then
    raise exception 'As fotos devem ser enviadas como uma lista.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    where division.motivo_id is null
      or coalesce(division.quantidade_faturada, division.quantidade, 0) <= 0
      or coalesce(division.quantidade_retorno, division.quantidade, 0) < 0
      or coalesce(division.quantidade_retorno, division.quantidade, 0)
        > coalesce(division.quantidade_faturada, division.quantidade, 0)
  ) then
    raise exception 'Cada motivo deve possuir faturado maior que zero e retorno entre zero e o faturado.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    left join public.motivos_devolucao as m
      on m.id = division.motivo_id
     and m.ativo is true
    where m.id is null
  ) then
    raise exception 'Motivo de devolucao invalido ou inativo.';
  end if;

  if exists (
    select division.motivo_id
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    group by division.motivo_id
    having count(*) > 1
  ) then
    raise exception 'Use um motivo diferente para cada divisao da quantidade.';
  end if;

  select fp.*
  into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and fp.status = 'pendente'
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
    raise exception 'Produto de FSTD nao encontrado, ja concluido ou processo finalizado.';
  end if;

  v_processo_id := v_item.processo_id;
  v_photo_prefix := v_auth_user_id::text || '/' || v_processo_id::text || '/';

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_fotos, '[]'::jsonb)) as uploaded(path)
    where left(uploaded.path, length(v_photo_prefix)) <> v_photo_prefix
      or not exists (
        select 1
        from storage.objects as object
        where object.bucket_id = 'fstd-fotos'
          and object.name = uploaded.path
      )
  ) then
    raise exception 'As fotos devem existir e pertencer ao usuario e processo autenticados.';
  end if;

  v_total_faturado :=
    v_item.quantidade_faturada_galinha + v_item.quantidade_faturada_codorna;

  select
    coalesce(sum(coalesce(division.quantidade_faturada, division.quantidade, 0)), 0),
    coalesce(sum(coalesce(division.quantidade_retorno, division.quantidade, 0)), 0),
    count(*)
  into v_total_divisoes_faturado, v_total_retorno, v_divisao_count
  from jsonb_to_recordset(p_divisoes) as division(
    motivo_id uuid,
    quantidade_faturada integer,
    quantidade_retorno integer,
    quantidade integer
  );

  if v_total_divisoes_faturado <> v_total_faturado then
    raise exception
      'A soma dos faturados por motivo deve ser exatamente igual ao faturado geral (% ovos).',
      v_total_faturado;
  end if;

  insert into public.fstd_produto_motivos (
    produto_id,
    motivo_id,
    quantidade_faturada,
    quantidade
  )
  select
    p_produto_id,
    division.motivo_id,
    coalesce(division.quantidade_faturada, division.quantidade),
    coalesce(division.quantidade_retorno, division.quantidade)
  from jsonb_to_recordset(p_divisoes) as division(
    motivo_id uuid,
    quantidade_faturada integer,
    quantidade_retorno integer,
    quantidade integer
  );

  update public.fstd_produtos
  set
    motivo_id = case
      when v_divisao_count = 1 then (p_divisoes->0->>'motivo_id')::uuid
      else null
    end,
    quantidade_retorno = v_total_retorno,
    observacao = nullif(btrim(p_observacao), ''),
    fotos = coalesce(p_fotos, '[]'::jsonb),
    status = 'concluido',
    concluido_em = now(),
    updated_at = now()
  where id = p_produto_id
  returning * into v_item;

  return v_item;
end;
$function$;

create or replace function public.editar_fstd_produto(
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
  v_auth_user_id uuid := (select auth.uid());
  v_promotor_id uuid;
  v_item public.fstd_produtos;
  v_processo_id uuid;
  v_total_faturado integer;
  v_total_divisoes_faturado integer;
  v_total_retorno integer;
  v_photo_prefix text;
begin
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

  if p_quantidade_faturada_galinha is null
    or p_quantidade_faturada_codorna is null
    or p_quantidade_faturada_galinha < 0
    or p_quantidade_faturada_codorna < 0 then
    raise exception 'As quantidades faturadas devem ser numeros inteiros nao negativos.';
  end if;

  v_total_faturado :=
    p_quantidade_faturada_galinha + p_quantidade_faturada_codorna;

  if v_total_faturado <= 0 then
    raise exception 'O faturado geral deve ser maior que zero.';
  end if;

  if jsonb_typeof(coalesce(p_divisoes, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_divisoes, '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos um motivo e um faturado.';
  end if;

  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' then
    raise exception 'As fotos devem ser enviadas como uma lista.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    where division.motivo_id is null
      or coalesce(division.quantidade_faturada, division.quantidade, 0) <= 0
      or coalesce(division.quantidade_retorno, division.quantidade, 0) < 0
      or coalesce(division.quantidade_retorno, division.quantidade, 0)
        > coalesce(division.quantidade_faturada, division.quantidade, 0)
  ) then
    raise exception 'Cada motivo deve possuir faturado maior que zero e retorno entre zero e o faturado.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    left join public.motivos_devolucao as m
      on m.id = division.motivo_id
     and m.ativo is true
    where m.id is null
  ) then
    raise exception 'Motivo de devolucao invalido ou inativo.';
  end if;

  if exists (
    select division.motivo_id
    from jsonb_to_recordset(p_divisoes) as division(
      motivo_id uuid,
      quantidade_faturada integer,
      quantidade_retorno integer,
      quantidade integer
    )
    group by division.motivo_id
    having count(*) > 1
  ) then
    raise exception 'Use um motivo diferente para cada divisao da quantidade.';
  end if;

  select fp.*
  into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and fp.status = 'concluido'
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
    raise exception 'Produto de FSTD nao encontrado, nao concluido ou processo finalizado.';
  end if;

  v_processo_id := v_item.processo_id;
  v_photo_prefix := v_auth_user_id::text || '/' || v_processo_id::text || '/';

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_fotos, '[]'::jsonb)) as uploaded(path)
    where left(uploaded.path, length(v_photo_prefix)) <> v_photo_prefix
      or not exists (
        select 1
        from storage.objects as object
        where object.bucket_id = 'fstd-fotos'
          and object.name = uploaded.path
      )
  ) then
    raise exception 'As fotos devem existir e pertencer ao usuario e processo autenticados.';
  end if;

  select
    coalesce(sum(coalesce(division.quantidade_faturada, division.quantidade, 0)), 0),
    coalesce(sum(coalesce(division.quantidade_retorno, division.quantidade, 0)), 0)
  into v_total_divisoes_faturado, v_total_retorno
  from jsonb_to_recordset(p_divisoes) as division(
    motivo_id uuid,
    quantidade_faturada integer,
    quantidade_retorno integer,
    quantidade integer
  );

  if v_total_divisoes_faturado <> v_total_faturado then
    raise exception
      'A soma dos faturados por motivo deve ser exatamente igual ao novo faturado geral (% ovos).',
      v_total_faturado;
  end if;

  delete from public.fstd_produto_motivos
  where produto_id = p_produto_id;

  insert into public.fstd_produto_motivos (
    produto_id,
    motivo_id,
    quantidade_faturada,
    quantidade
  )
  select
    p_produto_id,
    division.motivo_id,
    coalesce(division.quantidade_faturada, division.quantidade),
    coalesce(division.quantidade_retorno, division.quantidade)
  from jsonb_to_recordset(p_divisoes) as division(
    motivo_id uuid,
    quantidade_faturada integer,
    quantidade_retorno integer,
    quantidade integer
  );

  update public.fstd_produtos
  set
    quantidade_faturada_galinha = p_quantidade_faturada_galinha,
    quantidade_faturada_codorna = p_quantidade_faturada_codorna,
    motivo_id = case
      when jsonb_array_length(p_divisoes) = 1 then (p_divisoes->0->>'motivo_id')::uuid
      else null
    end,
    quantidade_retorno = v_total_retorno,
    observacao = nullif(btrim(p_observacao), ''),
    fotos = coalesce(p_fotos, '[]'::jsonb),
    concluido_em = now(),
    updated_at = now()
  where id = p_produto_id
  returning * into v_item;

  return v_item;
end;
$function$;

create or replace function public.finalizar_fstd_produtos(
  p_processo_id uuid
)
returns public.fstd_processos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_promotor_id uuid;
  v_processo public.fstd_processos;
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

  select p.*
  into v_processo
  from public.fstd_processos as p
  where p.id = p_processo_id
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
    and exists (
      select 1
      from public.loja_promotores as lp
      where lp.loja_id = p.loja_id
        and lp.promotor_id = v_promotor_id
    )
  for update;

  if v_processo.id is null then
    raise exception 'Processo FSTD nao encontrado, nao autorizado ou ja finalizado.';
  end if;

  if not exists (
    select 1
    from public.fstd_produtos as fp
    where fp.processo_id = p_processo_id
  ) then
    raise exception 'Nenhum produto foi encontrado neste processo FSTD.';
  end if;

  if exists (
    select 1
    from public.fstd_produtos as fp
    where fp.processo_id = p_processo_id
      and fp.status <> 'concluido'
  ) then
    raise exception 'Conclua todos os produtos antes de finalizar a NFD.';
  end if;

  update public.fstd_processos
  set
    status = 'concluida',
    finalizada_em = now(),
    updated_at = now()
  where id = p_processo_id
  returning * into v_processo;

  return v_processo;
end;
$function$;

alter function public.concluir_fstd_produto(uuid, jsonb, text, jsonb)
  set search_path = '';
alter function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb)
  set search_path = '';
alter function public.finalizar_fstd_produtos(uuid)
  set search_path = '';

revoke all on function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) from public, anon;
revoke all on function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) from public, anon;
revoke all on function public.finalizar_fstd_produtos(uuid) from public, anon;
grant execute on function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) to authenticated;
grant execute on function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) to authenticated;
grant execute on function public.finalizar_fstd_produtos(uuid) to authenticated;

-- Active access is required in addition to profile and store ownership.
drop policy if exists nfd_itens_select_gerencial_or_assigned_promotor on public.nfd_itens;
create policy nfd_itens_select_gerencial_or_assigned_promotor
on public.nfd_itens
for select
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.lojas as l
    join public.loja_promotores as lp on lp.loja_id = l.id
    join public.usuarios as u on u.id = lp.promotor_id
    where l.codigo = public.nfd_itens.codigo_cliente::text
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists produtos_select_authenticated on public.produtos;
create policy produtos_select_authenticated
on public.produtos
for select
to authenticated
using (
  (
    status is true
    and exists (
      select 1
      from public.usuarios as u
      where u.auth_user_id = (select auth.uid())
        and u.ativo is true
        and u.acesso_habilitado is true
    )
  )
  or (select public.is_current_user_gerencial_ativo())
);

drop policy if exists lojas_select_gerencial_or_promotor_assigned on public.lojas;
create policy lojas_select_gerencial_or_promotor_assigned
on public.lojas
for select
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.loja_promotores as lp
    join public.usuarios as u on u.id = lp.promotor_id
    where lp.loja_id = public.lojas.id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists loja_promotores_select_gerencial_or_own on public.loja_promotores;
create policy loja_promotores_select_gerencial_or_own
on public.loja_promotores
for select
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.usuarios as u
    where u.id = public.loja_promotores.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists fstd_processos_select_gerencial_or_own on public.fstd_processos;
create policy fstd_processos_select_gerencial_or_own
on public.fstd_processos
for select
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.usuarios as u
    where u.id = public.fstd_processos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists fstd_produtos_select_gerencial_or_own on public.fstd_produtos;
create policy fstd_produtos_select_gerencial_or_own
on public.fstd_produtos
for select
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = public.fstd_produtos.processo_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists fstd_produto_motivos_select_gerencial_or_own on public.fstd_produto_motivos;
create policy fstd_produto_motivos_select_gerencial_or_own
on public.fstd_produto_motivos
for select
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.fstd_produtos as fp
    join public.fstd_processos as p on p.id = fp.processo_id
    join public.usuarios as u on u.id = p.promotor_id
    where fp.id = public.fstd_produto_motivos.produto_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists nfd_desconhecimentos_select_gerencial_or_own on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_select_gerencial_or_own
on public.nfd_desconhecimentos
for select
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.usuarios as u
    where u.id = public.nfd_desconhecimentos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists nfd_desconhecimentos_insert_own_assigned_store on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_insert_own_assigned_store
on public.nfd_desconhecimentos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios as u
    where u.id = public.nfd_desconhecimentos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
  and exists (
    select 1
    from public.loja_promotores as lp
    where lp.loja_id = public.nfd_desconhecimentos.loja_id
      and lp.promotor_id = public.nfd_desconhecimentos.promotor_id
  )
);

drop policy if exists motivos_select_authenticated on public.motivos_devolucao;
drop policy if exists motivos_write_gerencial on public.motivos_devolucao;

create policy motivos_select_authenticated
on public.motivos_devolucao
for select
to authenticated
using (
  (
    ativo is true
    and exists (
      select 1
      from public.usuarios as u
      where u.auth_user_id = (select auth.uid())
        and u.ativo is true
        and u.acesso_habilitado is true
    )
  )
  or (select public.is_current_user_gerencial_ativo())
);

create policy motivos_insert_gerencial
on public.motivos_devolucao
for insert
to authenticated
with check ((select public.is_current_user_gerencial_ativo()));

create policy motivos_update_gerencial
on public.motivos_devolucao
for update
to authenticated
using ((select public.is_current_user_gerencial_ativo()))
with check ((select public.is_current_user_gerencial_ativo()));

create policy motivos_delete_gerencial
on public.motivos_devolucao
for delete
to authenticated
using ((select public.is_current_user_gerencial_ativo()));

drop policy if exists fstd_fotos_select_own on storage.objects;
drop policy if exists fstd_fotos_select_own_or_gerencial on storage.objects;
create policy fstd_fotos_select_own_or_gerencial
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_current_user_gerencial_ativo())
  )
);

drop policy if exists fstd_fotos_insert_own on storage.objects;
create policy fstd_fotos_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.usuarios as u
    where u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists fstd_fotos_delete_own on storage.objects;
create policy fstd_fotos_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.usuarios as u
    where u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

-- Prevent accidental Data API exposure of future objects. Existing grants are
-- tightened below without removing operations still used by the current UI.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on function public.set_atualizado_em() from public;

revoke all on table public.lojas_com_promotores from authenticated;
revoke all on table public.nfd_notas from authenticated;
revoke all on table public.produtos_expandidos from authenticated;
grant select on table public.lojas_com_promotores to authenticated;
grant select on table public.nfd_notas to authenticated;
grant select on table public.produtos_expandidos to authenticated;

revoke truncate, references, trigger
  on table public.usuarios,
           public.lojas,
           public.loja_promotores,
           public.motivos_devolucao,
           public.nfd_desconhecimentos,
           public.fstd_processos,
           public.fstd_produtos,
           public.fstd_produto_motivos
  from authenticated;

revoke all on table public.fstds from authenticated;
drop function if exists public.solicitar_fstd(
  uuid, uuid, uuid, integer, integer, integer, text[], text
);

notify pgrst, 'reload schema';
