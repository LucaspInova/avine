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

-- Stores and assignments are synchronized/provisioned server-side. Production
-- data is intentionally not reproduced by migrations.
