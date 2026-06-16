create table if not exists public.lojas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  uf text not null,
  cidade text not null,
  created_at timestamptz default now(),
  constraint lojas_uf_check check (uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL'))
);

create table if not exists public.loja_promotores (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references public.lojas(id) on delete cascade,
  promotor_id uuid references public.usuarios(id) on delete set null,
  posicao integer not null check (posicao in (1, 2, 3)),
  created_at timestamptz default now(),
  unique (loja_id, posicao)
);

comment on table public.lojas is 'Lojas exibidas na tela Lojas do Avine gerencial e digital.';
comment on table public.loja_promotores is 'Vinculos entre lojas e ate tres promotores por posicao.';

create index if not exists lojas_nome_idx on public.lojas using btree (nome);
create index if not exists lojas_uf_idx on public.lojas using btree (uf);
create index if not exists lojas_cidade_idx on public.lojas using btree (cidade);
create index if not exists loja_promotores_loja_id_idx on public.loja_promotores using btree (loja_id);
create index if not exists loja_promotores_promotor_id_idx on public.loja_promotores using btree (promotor_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.lojas to anon, authenticated;
grant select, insert, update, delete on table public.loja_promotores to anon, authenticated;

alter table public.lojas enable row level security;
alter table public.loja_promotores enable row level security;

drop policy if exists "lojas_select_client" on public.lojas;
create policy "lojas_select_client"
on public.lojas
for select
to anon, authenticated
using (true);

drop policy if exists "lojas_insert_client" on public.lojas;
create policy "lojas_insert_client"
on public.lojas
for insert
to anon, authenticated
with check (uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL'));

drop policy if exists "lojas_update_client" on public.lojas;
create policy "lojas_update_client"
on public.lojas
for update
to anon, authenticated
using (true)
with check (uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL'));

drop policy if exists "lojas_delete_client" on public.lojas;
create policy "lojas_delete_client"
on public.lojas
for delete
to anon, authenticated
using (true);

drop policy if exists "loja_promotores_select_client" on public.loja_promotores;
create policy "loja_promotores_select_client"
on public.loja_promotores
for select
to anon, authenticated
using (true);

drop policy if exists "loja_promotores_insert_client" on public.loja_promotores;
create policy "loja_promotores_insert_client"
on public.loja_promotores
for insert
to anon, authenticated
with check (
  promotor_id is null
  or exists (
    select 1
    from public.usuarios as u
    where u.id = promotor_id
      and u.perfil = 'Promotor'
  )
);

drop policy if exists "loja_promotores_update_client" on public.loja_promotores;
create policy "loja_promotores_update_client"
on public.loja_promotores
for update
to anon, authenticated
using (true)
with check (
  promotor_id is null
  or exists (
    select 1
    from public.usuarios as u
    where u.id = promotor_id
      and u.perfil = 'Promotor'
  )
);

drop policy if exists "loja_promotores_delete_client" on public.loja_promotores;
create policy "loja_promotores_delete_client"
on public.loja_promotores
for delete
to anon, authenticated
using (true);

insert into public.lojas (codigo, nome, uf, cidade)
values
  ('228', 'BOM PAP 0094', 'CE', 'Fortaleza'),
  ('229', 'BOM NOI 0355', 'PI', 'Teresina'),
  ('232', 'BOMPRE CD PE', 'PE', 'Recife'),
  ('282', 'SUPER VILTON', 'CE', 'Caucaia'),
  ('289', 'CARREF PARAN', 'CE', 'Fortaleza'),
  ('290', 'CARREF ALDEO', 'CE', 'Fortaleza'),
  ('301', 'CASA SANTA L', 'PA', 'Belem'),
  ('330', 'SHALOM', 'CE', 'Maracanau'),
  ('337', 'P.A. 225', 'PI', 'Parnaiba'),
  ('338', 'P.A. 228', 'PI', 'Teresina'),
  ('339', 'P.A. 2382', 'PI', 'Picos'),
  ('340', 'P.A. 223', 'PI', 'Teresina')
on conflict (codigo) do update
set
  nome = excluded.nome,
  uf = excluded.uf,
  cidade = excluded.cidade;

with promotores as (
  select id, row_number() over (order by nome) as rn
  from public.usuarios
  where perfil = 'Promotor'
), vinculos(codigo, posicao, rn) as (
  values
    ('301', 1, 9),
    ('228', 1, 1),
    ('229', 1, 2),
    ('232', 1, 3),
    ('289', 2, 4),
    ('290', 2, 5),
    ('330', 3, 6),
    ('337', 1, 7),
    ('338', 2, 8),
    ('339', 3, 10),
    ('340', 1, 11)
)
insert into public.loja_promotores (loja_id, posicao, promotor_id)
select l.id, v.posicao, p.id
from vinculos as v
join public.lojas as l on l.codigo = v.codigo
join promotores as p on p.rn = v.rn
on conflict (loja_id, posicao) do update
set promotor_id = excluded.promotor_id;
