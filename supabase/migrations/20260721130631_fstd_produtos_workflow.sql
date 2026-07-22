-- Workflow de FSTD por produto para NFDs vindas da view nfd_notas.

create table if not exists public.fstd_processos (
  id uuid primary key default gen_random_uuid(),
  nfd_chave_acesso text not null,
  nfd_numero text not null,
  loja_id uuid not null references public.lojas(id) on delete restrict,
  promotor_id uuid not null references public.usuarios(id) on delete restrict,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluida', 'cancelada')),
  finalizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fstd_processos_nfd_unique unique (nfd_chave_acesso)
);

create table if not exists public.fstd_produtos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.fstd_processos(id) on delete cascade,
  produto_id uuid,
  codigo_produto text not null,
  nome text not null,
  descricao text,
  imagem_url text,
  quantidade_faturada_galinha integer not null default 0 check (quantidade_faturada_galinha >= 0),
  quantidade_faturada_codorna integer not null default 0 check (quantidade_faturada_codorna >= 0),
  quantidade_retorno integer not null default 0 check (quantidade_retorno >= 0),
  motivo_id uuid references public.motivos_devolucao(id) on delete restrict,
  observacao text,
  status text not null default 'pendente'
    check (status in ('pendente', 'concluido')),
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fstd_produtos_processo_codigo_unique unique (processo_id, codigo_produto)
);

comment on table public.fstd_processos is
  'Processos de FSTD por NFD para o fluxo de conclusao produto a produto.';
comment on table public.fstd_produtos is
  'Produtos de uma NFD que precisam ser tratados individualmente no FSTD.';

create index if not exists fstd_processos_loja_id_idx
  on public.fstd_processos (loja_id, created_at desc);
create index if not exists fstd_processos_promotor_id_idx
  on public.fstd_processos (promotor_id, created_at desc);
create index if not exists fstd_processos_status_idx
  on public.fstd_processos (status, created_at desc);
create index if not exists fstd_produtos_processo_id_idx
  on public.fstd_produtos (processo_id, status);
create index if not exists fstd_produtos_codigo_produto_idx
  on public.fstd_produtos (codigo_produto);

create or replace function public.fstd_processos_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.fstd_processos_set_updated_at() from public;

drop trigger if exists fstd_processos_set_updated_at on public.fstd_processos;
create trigger fstd_processos_set_updated_at
before update on public.fstd_processos
for each row
execute function public.fstd_processos_set_updated_at();

drop trigger if exists fstd_produtos_set_updated_at on public.fstd_produtos;
create trigger fstd_produtos_set_updated_at
before update on public.fstd_produtos
for each row
execute function public.fstd_processos_set_updated_at();

grant usage on schema public to authenticated;
revoke all on table public.fstd_processos from anon;
revoke all on table public.fstd_produtos from anon;
grant select, insert, update on table public.fstd_processos to authenticated;
grant select, insert, update on table public.fstd_produtos to authenticated;

alter table public.fstd_processos enable row level security;
alter table public.fstd_produtos enable row level security;

drop policy if exists "fstd_processos_select_gerencial_or_own" on public.fstd_processos;
create policy "fstd_processos_select_gerencial_or_own"
on public.fstd_processos
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.usuarios as u
    where u.id = fstd_processos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "fstd_processos_insert_own_assigned_store" on public.fstd_processos;
create policy "fstd_processos_insert_own_assigned_store"
on public.fstd_processos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios as u
    where u.id = fstd_processos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
  and exists (
    select 1
    from public.loja_promotores as lp
    where lp.loja_id = fstd_processos.loja_id
      and lp.promotor_id = fstd_processos.promotor_id
  )
);

drop policy if exists "fstd_processos_update_own" on public.fstd_processos;
create policy "fstd_processos_update_own"
on public.fstd_processos
for update
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.usuarios as u
    where u.id = fstd_processos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
)
with check (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.usuarios as u
    where u.id = fstd_processos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "fstd_produtos_select_gerencial_or_own" on public.fstd_produtos;
create policy "fstd_produtos_select_gerencial_or_own"
on public.fstd_produtos
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = fstd_produtos.processo_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "fstd_produtos_insert_own" on public.fstd_produtos;
create policy "fstd_produtos_insert_own"
on public.fstd_produtos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = fstd_produtos.processo_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "fstd_produtos_update_own" on public.fstd_produtos;
create policy "fstd_produtos_update_own"
on public.fstd_produtos
for update
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = fstd_produtos.processo_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
)
with check (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = fstd_produtos.processo_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

create or replace function public.iniciar_fstd_produtos(
  p_loja_id uuid,
  p_nfd_chave_acesso text,
  p_nfd_numero text,
  p_produtos jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_promotor_id uuid;
  v_processo_id uuid;
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

  if not exists (
    select 1
    from public.loja_promotores as lp
    where lp.loja_id = p_loja_id
      and lp.promotor_id = v_promotor_id
  ) then
    raise exception 'Loja nao atribuida ao promotor autenticado.';
  end if;

  if nullif(btrim(p_nfd_chave_acesso), '') is null then
    raise exception 'Chave de acesso da NFD obrigatoria.';
  end if;

  if jsonb_typeof(coalesce(p_produtos, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_produtos, '[]'::jsonb)) = 0 then
    raise exception 'Nenhum produto encontrado para esta NFD.';
  end if;

  select p.id into v_processo_id
  from public.fstd_processos as p
  where p.nfd_chave_acesso = btrim(p_nfd_chave_acesso)
    and p.status <> 'cancelada'
  limit 1;

  if v_processo_id is not null then
    return v_processo_id;
  end if;

  insert into public.fstd_processos (
    nfd_chave_acesso,
    nfd_numero,
    loja_id,
    promotor_id
  )
  values (
    btrim(p_nfd_chave_acesso),
    coalesce(nullif(btrim(p_nfd_numero), ''), btrim(p_nfd_chave_acesso)),
    p_loja_id,
    v_promotor_id
  )
  returning id into v_processo_id;

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
    v_processo_id,
    catalog.produto_id,
    upper(btrim(item.codigo_produto)),
    coalesce(catalog.nome, nullif(btrim(item.nome), ''), upper(btrim(item.codigo_produto))),
    nullif(btrim(item.descricao), ''),
    catalog.imagem_url,
    greatest(coalesce(item.quantidade_faturada_galinha, 0), 0),
    greatest(coalesce(item.quantidade_faturada_codorna, 0), 0)
  from jsonb_to_recordset(p_produtos) as item(
    codigo_produto text,
    nome text,
    descricao text,
    quantidade_faturada_galinha integer,
    quantidade_faturada_codorna integer
  )
  left join public.produtos_expandidos as catalog
    on catalog.codigo_produto = upper(btrim(item.codigo_produto))
  where nullif(btrim(item.codigo_produto), '') is not null
  on conflict (processo_id, codigo_produto) do nothing;

  return v_processo_id;
end;
$$;

revoke all on function public.iniciar_fstd_produtos(uuid, text, text, jsonb) from public;
grant execute on function public.iniciar_fstd_produtos(uuid, text, text, jsonb) to authenticated;

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
declare
  v_promotor_id uuid;
  v_item public.fstd_produtos;
  v_total_faturado integer;
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

  if not exists (
    select 1
    from public.motivos_devolucao as m
    where m.id = p_motivo_id and m.ativo is true
  ) then
    raise exception 'Motivo de devolucao invalido ou inativo.';
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

  if coalesce(p_quantidade_retorno, 0) <= 0
    or coalesce(p_quantidade_retorno, 0) > v_total_faturado then
    raise exception 'A quantidade de retorno deve ser maior que zero e nao pode exceder o faturado.';
  end if;

  update public.fstd_produtos
  set
    motivo_id = p_motivo_id,
    quantidade_retorno = p_quantidade_retorno,
    observacao = nullif(btrim(p_observacao), ''),
    status = 'concluido',
    concluido_em = now(),
    updated_at = now()
  where id = p_produto_id
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.concluir_fstd_produto(uuid, uuid, integer, text) from public;
grant execute on function public.concluir_fstd_produto(uuid, uuid, integer, text) to authenticated;

create or replace function public.finalizar_fstd_produtos(
  p_processo_id uuid
)
returns public.fstd_processos
language plpgsql
set search_path = public
as $$
declare
  v_promotor_id uuid;
  v_processo public.fstd_processos;
begin
  select u.id into v_promotor_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Promotor'
    and u.ativo is true
  limit 1;

  select * into v_processo
  from public.fstd_processos
  where id = p_processo_id
    and promotor_id = v_promotor_id
    and status = 'em_andamento'
  for update;

  if v_processo.id is null then
    raise exception 'Processo FSTD nao encontrado ou ja finalizado.';
  end if;

  if not exists (
    select 1 from public.fstd_produtos where processo_id = p_processo_id
  ) then
    raise exception 'Nenhum produto foi encontrado neste processo FSTD.';
  end if;

  if exists (
    select 1
    from public.fstd_produtos
    where processo_id = p_processo_id
      and status <> 'concluido'
  ) then
    raise exception 'Conclua todos os produtos antes de finalizar a NFD.';
  end if;

  update public.fstd_processos
  set status = 'concluida', finalizada_em = now(), updated_at = now()
  where id = p_processo_id
  returning * into v_processo;

  return v_processo;
end;
$$;

revoke all on function public.finalizar_fstd_produtos(uuid) from public;
grant execute on function public.finalizar_fstd_produtos(uuid) to authenticated;

notify pgrst, 'reload schema';
