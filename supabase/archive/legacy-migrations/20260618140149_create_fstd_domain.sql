-- ARCHIVED: FSTD prototype containing tables not present in production.
-- Supabase Data API note: SQL-created public tables need explicit grants in
-- projects using the 2026 stricter default privileges model.

-- ============================================================
-- Domain tables
-- ============================================================

create table if not exists public.motivos_devolucao (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.motivos_devolucao is 'Motivos padronizados de devolucao usados nos apps Gerencial e Promotor.';

create table if not exists public.nfds (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete restrict,
  numero text not null,
  data_emissao date not null,
  data_envio date,
  valor_total numeric(14, 2) not null default 0,
  quantidade_total integer not null default 0 check (quantidade_total >= 0),
  tipo_devolucao text not null default 'Devolucao',
  forma_envio text not null default 'pos',
  origem text not null default 'importacao',
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loja_id, numero)
);

comment on table public.nfds is 'Notas fiscais de devolucao importadas para acompanhamento e solicitacao de FSTD.';

create table if not exists public.fstds (
  id uuid primary key default gen_random_uuid(),
  nfd_id uuid references public.nfds(id) on delete set null,
  loja_id uuid not null references public.lojas(id) on delete restrict,
  promotor_id uuid not null references public.usuarios(id) on delete restrict,
  motivo_id uuid not null references public.motivos_devolucao(id) on delete restrict,
  status text not null default 'solicitada'
    check (status in ('solicitada', 'validada', 'cancelada', 'recolhida')),
  origem text not null default 'mobile'
    check (origem in ('mobile', 'gerencial', 'importacao')),
  observacao text,
  solicitada_em timestamptz not null default now(),
  validada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fstds is 'Solicitacoes FSTD registradas pelo Promotor ou pelo Gerencial.';

create unique index if not exists fstds_nfd_id_unique_idx
on public.fstds (nfd_id)
where nfd_id is not null and status <> 'cancelada';

create table if not exists public.fstd_itens (
  id uuid primary key default gen_random_uuid(),
  fstd_id uuid not null references public.fstds(id) on delete cascade,
  produto text not null check (produto in ('GAL', 'COD', 'SIU')),
  quantidade integer not null check (quantidade >= 0),
  created_at timestamptz not null default now(),
  unique (fstd_id, produto)
);

comment on table public.fstd_itens is 'Quantidades devolvidas por produto no FSTD.';

create table if not exists public.fstd_fotos (
  id uuid primary key default gen_random_uuid(),
  fstd_id uuid not null references public.fstds(id) on delete cascade,
  promotor_id uuid not null references public.usuarios(id) on delete restrict,
  storage_path text not null,
  legenda text,
  created_at timestamptz not null default now()
);

comment on table public.fstd_fotos is 'Metadados de fotos anexadas as solicitacoes FSTD.';

create table if not exists public.recolhimentos (
  id uuid primary key default gen_random_uuid(),
  fstd_id uuid not null references public.fstds(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete restrict,
  status text not null default 'solicitado'
    check (status in ('solicitado', 'roteirizado', 'recolhido', 'cancelado')),
  data_solicitacao timestamptz not null default now(),
  data_prevista date,
  data_recolhimento timestamptz,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fstd_id)
);

comment on table public.recolhimentos is 'Fila de recolhimento gerada a partir das solicitacoes FSTD.';

-- ============================================================
-- Indexes
-- ============================================================

create index if not exists motivos_devolucao_ativo_ordem_idx on public.motivos_devolucao (ativo, ordem, nome);
create index if not exists nfds_loja_id_idx on public.nfds (loja_id);
create index if not exists nfds_data_emissao_idx on public.nfds (data_emissao);
create index if not exists nfds_numero_idx on public.nfds (numero);
create index if not exists fstds_loja_id_idx on public.fstds (loja_id);
create index if not exists fstds_promotor_id_idx on public.fstds (promotor_id);
create index if not exists fstds_motivo_id_idx on public.fstds (motivo_id);
create index if not exists fstds_status_idx on public.fstds (status);
create index if not exists fstd_itens_fstd_id_idx on public.fstd_itens (fstd_id);
create index if not exists fstd_fotos_fstd_id_idx on public.fstd_fotos (fstd_id);
create index if not exists fstd_fotos_promotor_id_idx on public.fstd_fotos (promotor_id);
create index if not exists recolhimentos_loja_id_idx on public.recolhimentos (loja_id);
create index if not exists recolhimentos_status_idx on public.recolhimentos (status);

-- ============================================================
-- Updated_at triggers
-- ============================================================

drop trigger if exists nfds_set_updated_at on public.nfds;
create trigger nfds_set_updated_at
before update on public.nfds
for each row
execute function public.update_updated_at_column();

drop trigger if exists fstds_set_updated_at on public.fstds;
create trigger fstds_set_updated_at
before update on public.fstds
for each row
execute function public.update_updated_at_column();

drop trigger if exists recolhimentos_set_updated_at on public.recolhimentos;
create trigger recolhimentos_set_updated_at
before update on public.recolhimentos
for each row
execute function public.update_updated_at_column();

-- ============================================================
-- Seed data
-- ============================================================

insert into public.motivos_devolucao (nome, ordem)
values
  ('Avaria na Entrega', 10),
  ('Avaria no PDV', 20),
  ('Avaria no Deposito', 30),
  ('Ovos Vencidos', 40),
  ('Ovos Podres', 50)
on conflict (nome) do update
set
  ordem = excluded.ordem,
  ativo = true;

-- ============================================================
-- Data API grants
-- ============================================================

grant usage on schema public to authenticated;

revoke all on table public.motivos_devolucao from anon;
revoke all on table public.nfds from anon;
revoke all on table public.fstds from anon;
revoke all on table public.fstd_itens from anon;
revoke all on table public.fstd_fotos from anon;
revoke all on table public.recolhimentos from anon;

grant select, insert, update, delete on table public.motivos_devolucao to authenticated;
grant select, insert, update, delete on table public.nfds to authenticated;
grant select, insert, update, delete on table public.fstds to authenticated;
grant select, insert, update, delete on table public.fstd_itens to authenticated;
grant select, insert, update, delete on table public.fstd_fotos to authenticated;
grant select, insert, update, delete on table public.recolhimentos to authenticated;

-- ============================================================
-- RLS
-- ============================================================

alter table public.motivos_devolucao enable row level security;
alter table public.nfds enable row level security;
alter table public.fstds enable row level security;
alter table public.fstd_itens enable row level security;
alter table public.fstd_fotos enable row level security;
alter table public.recolhimentos enable row level security;

-- Extend existing route policies so the mobile Promotor can read assigned stores.
drop policy if exists "lojas_select_gerencial" on public.lojas;
drop policy if exists "lojas_select_gerencial_or_promotor_assigned" on public.lojas;
create policy "lojas_select_gerencial_or_promotor_assigned"
on public.lojas
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.loja_promotores as lp
    join public.usuarios as u on u.id = lp.promotor_id
    where lp.loja_id = lojas.id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "loja_promotores_select_gerencial" on public.loja_promotores;
drop policy if exists "loja_promotores_select_gerencial_or_own" on public.loja_promotores;
create policy "loja_promotores_select_gerencial_or_own"
on public.loja_promotores
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.usuarios as u
    where u.id = loja_promotores.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "motivos_select_authenticated" on public.motivos_devolucao;
create policy "motivos_select_authenticated"
on public.motivos_devolucao
for select
to authenticated
using (ativo is true or public.is_current_user_gerencial_ativo());

drop policy if exists "motivos_write_gerencial" on public.motivos_devolucao;
create policy "motivos_write_gerencial"
on public.motivos_devolucao
for all
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (public.is_current_user_gerencial_ativo());

drop policy if exists "nfds_select_gerencial_or_promotor_assigned" on public.nfds;
create policy "nfds_select_gerencial_or_promotor_assigned"
on public.nfds
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.loja_promotores as lp
    join public.usuarios as u on u.id = lp.promotor_id
    where lp.loja_id = nfds.loja_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "nfds_write_gerencial" on public.nfds;
create policy "nfds_write_gerencial"
on public.nfds
for all
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (public.is_current_user_gerencial_ativo());

drop policy if exists "fstds_select_gerencial_or_own" on public.fstds;
drop policy if exists "fstds_select_gerencial_or_assigned_store" on public.fstds;
create policy "fstds_select_gerencial_or_assigned_store"
on public.fstds
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.loja_promotores as lp
    join public.usuarios as u on u.id = lp.promotor_id
    where lp.loja_id = fstds.loja_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "fstds_insert_promotor_assigned" on public.fstds;
create policy "fstds_insert_promotor_assigned"
on public.fstds
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios as u
    where u.id = promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
  and exists (
    select 1
    from public.loja_promotores as lp
    where lp.loja_id = fstds.loja_id
      and lp.promotor_id = fstds.promotor_id
  )
  and (
    nfd_id is null
    or exists (
      select 1
      from public.nfds as n
      where n.id = fstds.nfd_id
        and n.loja_id = fstds.loja_id
    )
  )
);

drop policy if exists "fstds_write_gerencial" on public.fstds;
create policy "fstds_write_gerencial"
on public.fstds
for update
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (public.is_current_user_gerencial_ativo());

drop policy if exists "fstd_itens_select_gerencial_or_own" on public.fstd_itens;
drop policy if exists "fstd_itens_select_gerencial_or_assigned_store" on public.fstd_itens;
create policy "fstd_itens_select_gerencial_or_assigned_store"
on public.fstd_itens
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or
  exists (
    select 1
    from public.fstds as f
    join public.loja_promotores as lp on lp.loja_id = f.loja_id
    join public.usuarios as u on u.id = lp.promotor_id
    where f.id = fstd_itens.fstd_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "fstd_itens_insert_own" on public.fstd_itens;
create policy "fstd_itens_insert_own"
on public.fstd_itens
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fstds as f
    join public.usuarios as u on u.id = f.promotor_id
    where f.id = fstd_itens.fstd_id
      and f.status = 'solicitada'
      and u.auth_user_id = (select auth.uid())
      and u.ativo is true
  )
);

drop policy if exists "fstd_itens_write_gerencial" on public.fstd_itens;
create policy "fstd_itens_write_gerencial"
on public.fstd_itens
for all
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (public.is_current_user_gerencial_ativo());

drop policy if exists "fstd_fotos_select_gerencial_or_own" on public.fstd_fotos;
drop policy if exists "fstd_fotos_select_gerencial_or_assigned_store" on public.fstd_fotos;
create policy "fstd_fotos_select_gerencial_or_assigned_store"
on public.fstd_fotos
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.fstds as f
    join public.loja_promotores as lp on lp.loja_id = f.loja_id
    join public.usuarios as u on u.id = lp.promotor_id
    where f.id = fstd_fotos.fstd_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "fstd_fotos_insert_own" on public.fstd_fotos;
create policy "fstd_fotos_insert_own"
on public.fstd_fotos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fstds as f
    join public.usuarios as u on u.id = f.promotor_id
    where f.id = fstd_fotos.fstd_id
      and fstd_fotos.promotor_id = f.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.ativo is true
  )
);

drop policy if exists "fstd_fotos_write_gerencial" on public.fstd_fotos;
create policy "fstd_fotos_write_gerencial"
on public.fstd_fotos
for all
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (public.is_current_user_gerencial_ativo());

drop policy if exists "recolhimentos_select_gerencial_or_own_store" on public.recolhimentos;
create policy "recolhimentos_select_gerencial_or_own_store"
on public.recolhimentos
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.loja_promotores as lp
    join public.usuarios as u on u.id = lp.promotor_id
    where lp.loja_id = recolhimentos.loja_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists "recolhimentos_insert_own_fstd" on public.recolhimentos;
create policy "recolhimentos_insert_own_fstd"
on public.recolhimentos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fstds as f
    join public.usuarios as u on u.id = f.promotor_id
    where f.id = recolhimentos.fstd_id
      and f.loja_id = recolhimentos.loja_id
      and u.auth_user_id = (select auth.uid())
      and u.ativo is true
  )
);

drop policy if exists "recolhimentos_write_gerencial" on public.recolhimentos;
create policy "recolhimentos_write_gerencial"
on public.recolhimentos
for all
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (public.is_current_user_gerencial_ativo());

-- ============================================================
-- View
-- ============================================================

drop view if exists public.nfds_com_status;
create view public.nfds_com_status
with (security_invoker = true)
as
select
  n.id,
  n.loja_id,
  l.codigo as loja_codigo,
  l.nome as loja_nome,
  l.uf,
  l.cidade,
  n.numero,
  n.data_emissao,
  n.data_envio,
  n.valor_total,
  n.quantidade_total,
  n.tipo_devolucao,
  n.forma_envio,
  n.origem,
  f.id as fstd_id,
  f.status as fstd_status,
  case
    when f.id is not null and f.status <> 'cancelada' then 'finalizada'
    when n.origem = 'avulsa' then 'avulsa'
    when n.data_emissao < current_date - interval '21 days' then 'atrasada'
    else 'outros'
  end as status_nfd
from public.nfds as n
join public.lojas as l on l.id = n.loja_id
left join public.fstds as f on f.nfd_id = n.id and f.status <> 'cancelada';

grant select on public.nfds_com_status to authenticated;

-- ============================================================
-- RPC: mobile FSTD solicitation
-- ============================================================

create or replace function public.solicitar_fstd(
  p_loja_id uuid,
  p_motivo_id uuid,
  p_nfd_id uuid default null,
  p_quantidade_gal integer default 0,
  p_quantidade_cod integer default 0,
  p_quantidade_siu integer default 0,
  p_fotos text[] default '{}'::text[],
  p_observacao text default null
)
returns public.fstds
language plpgsql
set search_path = public
as $$
declare
  v_promotor_id uuid;
  v_fstd public.fstds;
  v_foto text;
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

  if not exists (
    select 1
    from public.motivos_devolucao as m
    where m.id = p_motivo_id
      and m.ativo is true
  ) then
    raise exception 'Motivo de devolucao invalido ou inativo.';
  end if;

  if p_nfd_id is not null and not exists (
    select 1
    from public.nfds as n
    where n.id = p_nfd_id
      and n.loja_id = p_loja_id
  ) then
    raise exception 'NFD nao encontrada para a loja informada.';
  end if;

  if coalesce(p_quantidade_gal, 0) < 0
    or coalesce(p_quantidade_cod, 0) < 0
    or coalesce(p_quantidade_siu, 0) < 0 then
    raise exception 'Quantidades nao podem ser negativas.';
  end if;

  if coalesce(p_quantidade_gal, 0)
    + coalesce(p_quantidade_cod, 0)
    + coalesce(p_quantidade_siu, 0) <= 0 then
    raise exception 'Informe pelo menos uma quantidade devolvida.';
  end if;

  if p_nfd_id is not null and exists (
    select 1
    from public.fstds as f
    where f.nfd_id = p_nfd_id
      and f.status <> 'cancelada'
  ) then
    raise exception 'Esta NFD ja possui FSTD ativa.';
  end if;

  insert into public.fstds (
    nfd_id,
    loja_id,
    promotor_id,
    motivo_id,
    origem,
    observacao
  )
  values (
    p_nfd_id,
    p_loja_id,
    v_promotor_id,
    p_motivo_id,
    'mobile',
    nullif(btrim(p_observacao), '')
  )
  returning * into v_fstd;

  insert into public.fstd_itens (fstd_id, produto, quantidade)
  select v_fstd.id, produto, quantidade
  from (
    values
      ('GAL', coalesce(p_quantidade_gal, 0)),
      ('COD', coalesce(p_quantidade_cod, 0)),
      ('SIU', coalesce(p_quantidade_siu, 0))
  ) as itens(produto, quantidade)
  where quantidade > 0;

  foreach v_foto in array coalesce(p_fotos, '{}'::text[]) loop
    if nullif(btrim(v_foto), '') is not null then
      insert into public.fstd_fotos (fstd_id, promotor_id, storage_path)
      values (v_fstd.id, v_promotor_id, btrim(v_foto));
    end if;
  end loop;

  insert into public.recolhimentos (fstd_id, loja_id, status)
  values (v_fstd.id, p_loja_id, 'solicitado');

  return v_fstd;
end;
$$;

revoke all on function public.solicitar_fstd(uuid, uuid, uuid, integer, integer, integer, text[], text) from public;
grant execute on function public.solicitar_fstd(uuid, uuid, uuid, integer, integer, integer, text[], text) to authenticated;
