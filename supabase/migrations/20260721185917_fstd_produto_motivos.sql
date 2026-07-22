create table if not exists public.fstd_produto_motivos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.fstd_produtos(id) on delete cascade,
  motivo_id uuid not null references public.motivos_devolucao(id) on delete restrict,
  quantidade integer not null check (quantidade > 0),
  created_at timestamptz not null default now(),
  constraint fstd_produto_motivos_produto_motivo_unique unique (produto_id, motivo_id)
);

comment on table public.fstd_produto_motivos is
  'Divisao da quantidade retornada de um produto FSTD por motivo de devolucao.';

create index if not exists fstd_produto_motivos_produto_id_idx
  on public.fstd_produto_motivos (produto_id);

revoke all on table public.fstd_produto_motivos from anon;
grant select, insert on table public.fstd_produto_motivos to authenticated;
alter table public.fstd_produto_motivos enable row level security;

drop policy if exists "fstd_produto_motivos_select_gerencial_or_own" on public.fstd_produto_motivos;
create policy "fstd_produto_motivos_select_gerencial_or_own"
on public.fstd_produto_motivos
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.fstd_produtos as fp
    join public.fstd_processos as p on p.id = fp.processo_id
    join public.usuarios as u on u.id = p.promotor_id
    where fp.id = fstd_produto_motivos.produto_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "fstd_produto_motivos_insert_own" on public.fstd_produto_motivos;
create policy "fstd_produto_motivos_insert_own"
on public.fstd_produto_motivos
for insert
to authenticated
with check (
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

insert into public.fstd_produto_motivos (produto_id, motivo_id, quantidade)
select fp.id, fp.motivo_id, fp.quantidade_retorno
from public.fstd_produtos as fp
where fp.status = 'concluido'
  and fp.motivo_id is not null
  and fp.quantidade_retorno > 0
  and not exists (
    select 1
    from public.fstd_produto_motivos as existing
    where existing.produto_id = fp.id
  );

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
    raise exception 'Informe ao menos um motivo e uma quantidade.';
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
    and p.promotor_id = v_promotor_id
    and p.status = 'em_andamento'
  for update;

  if v_item.id is null then
    raise exception 'Produto de FSTD nao encontrado ou ja finalizado.';
  end if;

  v_total_faturado := v_item.quantidade_faturada_galinha + v_item.quantidade_faturada_codorna;
  select coalesce(sum(division.quantidade), 0), count(*)
    into v_total_retorno, v_divisao_count
  from jsonb_to_recordset(p_divisoes) as division(motivo_id uuid, quantidade integer);

  if v_total_retorno <> v_total_faturado then
    raise exception 'A quantidade informada deve ser exatamente igual ao faturado (% ovos).', v_total_faturado;
  end if;

  insert into public.fstd_produto_motivos (produto_id, motivo_id, quantidade)
  select p_produto_id, division.motivo_id, division.quantidade
  from jsonb_to_recordset(p_divisoes) as division(motivo_id uuid, quantidade integer);

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

-- Mantem as assinaturas antigas para nao quebrar clientes que ainda nao
-- receberam a versao nova do frontend. Elas usam o retorno como faturado
-- legado, enquanto o frontend novo envia faturado e retorno por motivo.
create or replace function public.concluir_fstd_produto(
  p_produto_id uuid,
  p_motivo_id uuid,
  p_quantidade_retorno integer,
  p_observacao text default null
)
returns public.fstd_produtos
language plpgsql
set search_path = public
as $$
begin
  return public.concluir_fstd_produto(
    p_produto_id,
    jsonb_build_array(jsonb_build_object(
      'motivo_id', p_motivo_id,
      'quantidade', p_quantidade_retorno
    )),
    p_observacao,
    '[]'::jsonb
  );
end;
$$;

create or replace function public.concluir_fstd_produto(
  p_produto_id uuid,
  p_motivo_id uuid,
  p_quantidade_retorno integer,
  p_observacao text default null,
  p_fotos jsonb default '[]'::jsonb
)
returns public.fstd_produtos
language plpgsql
set search_path = public
as $$
begin
  return public.concluir_fstd_produto(
    p_produto_id,
    jsonb_build_array(jsonb_build_object(
      'motivo_id', p_motivo_id,
      'quantidade', p_quantidade_retorno
    )),
    p_observacao,
    p_fotos
  );
end;
$$;

revoke all on function public.concluir_fstd_produto(uuid, uuid, integer, text) from public;
grant execute on function public.concluir_fstd_produto(uuid, uuid, integer, text) to authenticated;
revoke all on function public.concluir_fstd_produto(uuid, uuid, integer, text, jsonb) from public;
grant execute on function public.concluir_fstd_produto(uuid, uuid, integer, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
