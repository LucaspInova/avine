alter table public.fstd_produto_motivos
  add column if not exists quantidade_faturada integer;

update public.fstd_produto_motivos as fpm
set quantidade_faturada = case
  when (
    select count(*)
    from public.fstd_produto_motivos as fpm_count
    where fpm_count.produto_id = fpm.produto_id
  ) = 1 then fp.quantidade_faturada_galinha + fp.quantidade_faturada_codorna
  else fpm.quantidade
end
from public.fstd_produtos as fp
where fp.id = fpm.produto_id
  and fpm.quantidade_faturada is null;

update public.fstd_produto_motivos
set quantidade_faturada = quantidade
where quantidade_faturada is null;

alter table public.fstd_produto_motivos
  alter column quantidade_faturada set not null;

alter table public.fstd_produto_motivos
  drop constraint if exists fstd_produto_motivos_quantidade_check;

alter table public.fstd_produto_motivos
  add constraint fstd_produto_motivos_quantidade_check check (quantidade >= 0);

alter table public.fstd_produto_motivos
  add constraint fstd_produto_motivos_quantidade_faturada_check check (quantidade_faturada > 0);

comment on column public.fstd_produto_motivos.quantidade_faturada is
  'Quantidade faturada atribuida a este motivo; a soma deve fechar com o faturado da nota.';

create or replace function public.concluir_fstd_produto(
  p_produto_id uuid,
  p_divisoes jsonb,
  p_observacao text default null,
  p_fotos jsonb default '[]'::jsonb
)
returns public.fstd_produtos
language plpgsql
set search_path = public
as $$
declare
  v_promotor_id uuid;
  v_item public.fstd_produtos;
  v_total_faturado integer;
  v_total_divisoes_faturado integer;
  v_total_retorno integer;
  v_divisao_count integer;
begin
  select u.id into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Promotor'
    and u.ativo is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor ativo nao encontrado para o usuario autenticado.';
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
    from jsonb_array_elements_text(coalesce(p_fotos, '[]'::jsonb)) as uploaded(path)
    where left(uploaded.path, length((select auth.uid())::text) + 1)
      <> (select auth.uid())::text || '/'
  ) then
    raise exception 'As fotos enviadas nao pertencem ao usuario autenticado.';
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

  select fp.* into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
  for update;

  if v_item.id is null then
    raise exception 'Produto de FSTD nao encontrado ou ja finalizado.';
  end if;

  v_total_faturado := v_item.quantidade_faturada_galinha + v_item.quantidade_faturada_codorna;
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
    raise exception 'A soma dos faturados por motivo deve ser exatamente igual ao faturado geral (% ovos).', v_total_faturado;
  end if;

  insert into public.fstd_produto_motivos (produto_id, motivo_id, quantidade_faturada, quantidade)
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
    motivo_id = case when v_divisao_count = 1 then (p_divisoes->0->>'motivo_id')::uuid else null end,
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
$$;

revoke all on function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) from public;
grant execute on function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) to authenticated;

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
set search_path = public
as $$
declare
  v_promotor_id uuid;
  v_item public.fstd_produtos;
  v_total_faturado integer;
  v_total_divisoes_faturado integer;
  v_total_retorno integer;
begin
  select u.id into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Promotor'
    and u.ativo is true
  limit 1;

  if v_promotor_id is null then
    raise exception 'Promotor ativo nao encontrado para o usuario autenticado.';
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
    from jsonb_array_elements_text(coalesce(p_fotos, '[]'::jsonb)) as uploaded(path)
    where left(uploaded.path, length((select auth.uid())::text) + 1)
      <> (select auth.uid())::text || '/'
  ) then
    raise exception 'As fotos enviadas nao pertencem ao usuario autenticado.';
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

  select fp.* into v_item
  from public.fstd_produtos as fp
  join public.fstd_processos as p on p.id = fp.processo_id
  where fp.id = p_produto_id
    and fp.status = 'concluido'
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
  for update;

  if v_item.id is null then
    raise exception 'Produto de FSTD nao encontrado, nao concluido ou ja finalizado.';
  end if;

  v_total_faturado := v_item.quantidade_faturada_galinha + v_item.quantidade_faturada_codorna;
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
    raise exception 'A soma dos faturados por motivo deve ser exatamente igual ao faturado geral (% ovos).', v_total_faturado;
  end if;

  delete from public.fstd_produto_motivos
  where produto_id = p_produto_id;

  insert into public.fstd_produto_motivos (produto_id, motivo_id, quantidade_faturada, quantidade)
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
      when jsonb_array_length(p_divisoes) = 1 then (p_divisoes->0->>'motivo_id')::uuid
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
$$;

revoke all on function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) from public;
grant execute on function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
