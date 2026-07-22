grant delete on table public.fstd_produto_motivos to authenticated;

drop policy if exists "fstd_produto_motivos_delete_own" on public.fstd_produto_motivos;
create policy "fstd_produto_motivos_delete_own"
on public.fstd_produto_motivos
for delete
to authenticated
using (
  exists (
    select 1
    from public.fstd_produtos as fp
    join public.fstd_processos as p on p.id = fp.processo_id
    join public.usuarios as u on u.id = p.promotor_id
    where fp.id = fstd_produto_motivos.produto_id
      and p.status = 'em_andamento'
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

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
    raise exception 'Informe ao menos um motivo e uma quantidade.';
  end if;

  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' then
    raise exception 'As fotos devem ser enviadas como uma lista.';
  end if;

  if coalesce(p_quantidade_faturada_galinha, 0) < 0
    or coalesce(p_quantidade_faturada_codorna, 0) < 0 then
    raise exception 'A quantidade faturada nao pode ser negativa.';
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
    from jsonb_to_recordset(p_divisoes) as division(motivo_id uuid, quantidade integer)
    where division.motivo_id is null or coalesce(division.quantidade, 0) <= 0
  ) then
    raise exception 'Cada motivo deve possuir uma quantidade maior que zero.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_divisoes) as division(motivo_id uuid, quantidade integer)
    left join public.motivos_devolucao as m
      on m.id = division.motivo_id
     and m.ativo is true
    where m.id is null
  ) then
    raise exception 'Motivo de devolucao invalido ou inativo.';
  end if;

  if exists (
    select division.motivo_id
    from jsonb_to_recordset(p_divisoes) as division(motivo_id uuid, quantidade integer)
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

  v_total_faturado := coalesce(p_quantidade_faturada_galinha, 0)
    + coalesce(p_quantidade_faturada_codorna, 0);

  select coalesce(sum(division.quantidade), 0)
    into v_total_retorno
  from jsonb_to_recordset(p_divisoes) as division(motivo_id uuid, quantidade integer);

  if v_total_retorno <> v_total_faturado then
    raise exception 'A quantidade informada deve ser exatamente igual ao faturado (% ovos).', v_total_faturado;
  end if;

  delete from public.fstd_produto_motivos
  where produto_id = p_produto_id;

  insert into public.fstd_produto_motivos (produto_id, motivo_id, quantidade)
  select p_produto_id, division.motivo_id, division.quantidade
  from jsonb_to_recordset(p_divisoes) as division(motivo_id uuid, quantidade integer);

  update public.fstd_produtos
  set
    quantidade_faturada_galinha = coalesce(p_quantidade_faturada_galinha, 0),
    quantidade_faturada_codorna = coalesce(p_quantidade_faturada_codorna, 0),
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
