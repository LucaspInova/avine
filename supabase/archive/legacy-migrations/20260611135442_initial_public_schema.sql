-- ARCHIVED: Initial public schema for the abandoned profiles/stores domain.
-- All application tables and helper functions are created in public.

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text unique not null,
  role text not null check (role in ('promotor', 'gerencial')),
  uf char(2),
  fotos boolean default true,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.profiles is 'Application profile linked one-to-one with Supabase Auth users.';
comment on column public.profiles.fotos is 'Controls whether the promotor can use the photos module.';
comment on column public.profiles.ativo is 'Controls whether the user can access application data.';

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  codigo integer unique not null,
  nome text not null,
  nome_old text,
  uf char(2),
  cidade text,
  cidade_normalizada text,
  icon text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.stores is 'Stores managed by gerencial users and assigned to promotores.';
comment on column public.stores.codigo is 'Business identifier imported from the source system.';
comment on column public.stores.cidade_normalizada is 'Normalized city name used for filters and search.';

create table if not exists public.user_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, store_id)
);

comment on table public.user_stores is 'Relationship between promotores and stores.';

-- ============================================================
-- Indexes
-- ============================================================

-- profiles.email is already indexed by its unique constraint.
create index if not exists profiles_nome_idx on public.profiles using btree (nome);
create index if not exists profiles_role_idx on public.profiles using btree (role);
create index if not exists profiles_uf_idx on public.profiles using btree (uf);
create index if not exists profiles_ativo_idx on public.profiles using btree (ativo);

-- stores.codigo is already indexed by its unique constraint.
create index if not exists stores_nome_idx on public.stores using btree (nome);
create index if not exists stores_cidade_idx on public.stores using btree (cidade);
create index if not exists stores_cidade_normalizada_idx on public.stores using btree (cidade_normalizada);
create index if not exists stores_uf_idx on public.stores using btree (uf);
create index if not exists stores_ativo_idx on public.stores using btree (ativo);

-- user_stores.user_id is already covered by unique (user_id, store_id).
create index if not exists user_stores_store_id_idx on public.user_stores using btree (store_id);

-- ============================================================
-- Grants for Supabase Data API
-- ============================================================

-- New Supabase projects may require explicit grants for SQL-created tables.
grant usage on schema public to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.stores to authenticated;
grant select, insert, update, delete on table public.user_stores to authenticated;

-- ============================================================
-- Updated_at trigger support
-- ============================================================

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.update_updated_at_column() from public;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.update_updated_at_column();

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
before update on public.stores
for each row
execute function public.update_updated_at_column();

-- ============================================================
-- RLS helper functions
-- ============================================================

-- SECURITY DEFINER prevents recursive RLS reads when policies need the
-- current user's active role from public.profiles.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
    and p.ativo is true
  limit 1
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

-- ============================================================
-- Automatic profile creation from Supabase Auth
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    nome,
    email,
    role,
    ativo,
    fotos
  )
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nome', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Usuario'
    ),
    new.email,
    'promotor',
    true,
    true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    updated_at = now()
  where public.profiles.email is distinct from excluded.email;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.user_stores enable row level security;

-- ----------------------------
-- Profiles policies
-- ----------------------------

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and id = (select auth.uid())
);

drop policy if exists "profiles_select_gerencial" on public.profiles;
create policy "profiles_select_gerencial"
on public.profiles
for select
to authenticated
using (
  (select public.current_user_role()) = 'gerencial'
);

drop policy if exists "profiles_insert_gerencial" on public.profiles;
create policy "profiles_insert_gerencial"
on public.profiles
for insert
to authenticated
with check (
  (select public.current_user_role()) = 'gerencial'
);

drop policy if exists "profiles_update_gerencial" on public.profiles;
create policy "profiles_update_gerencial"
on public.profiles
for update
to authenticated
using (
  (select public.current_user_role()) = 'gerencial'
)
with check (true);

-- ----------------------------
-- Stores policies
-- ----------------------------

drop policy if exists "stores_select_gerencial" on public.stores;
create policy "stores_select_gerencial"
on public.stores
for select
to authenticated
using (
  (select public.current_user_role()) = 'gerencial'
);

drop policy if exists "stores_select_promotor_assigned" on public.stores;
create policy "stores_select_promotor_assigned"
on public.stores
for select
to authenticated
using (
  ativo is true
  and (select public.current_user_role()) = 'promotor'
  and exists (
    select 1
    from public.user_stores as us
    where us.store_id = stores.id
      and us.user_id = (select auth.uid())
  )
);

drop policy if exists "stores_insert_gerencial" on public.stores;
create policy "stores_insert_gerencial"
on public.stores
for insert
to authenticated
with check (
  (select public.current_user_role()) = 'gerencial'
);

drop policy if exists "stores_update_gerencial" on public.stores;
create policy "stores_update_gerencial"
on public.stores
for update
to authenticated
using (
  (select public.current_user_role()) = 'gerencial'
)
with check (true);

-- ----------------------------
-- User Stores policies
-- ----------------------------

drop policy if exists "user_stores_select_gerencial" on public.user_stores;
create policy "user_stores_select_gerencial"
on public.user_stores
for select
to authenticated
using (
  (select public.current_user_role()) = 'gerencial'
);

drop policy if exists "user_stores_select_own" on public.user_stores;
create policy "user_stores_select_own"
on public.user_stores
for select
to authenticated
using (
  (select public.current_user_role()) = 'promotor'
  and user_id = (select auth.uid())
);

drop policy if exists "user_stores_insert_gerencial" on public.user_stores;
create policy "user_stores_insert_gerencial"
on public.user_stores
for insert
to authenticated
with check (
  (select public.current_user_role()) = 'gerencial'
  and exists (
    select 1
    from public.profiles as p
    where p.id = user_id
      and p.role = 'promotor'
  )
);

drop policy if exists "user_stores_update_gerencial" on public.user_stores;
create policy "user_stores_update_gerencial"
on public.user_stores
for update
to authenticated
using (
  (select public.current_user_role()) = 'gerencial'
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = user_id
      and p.role = 'promotor'
  )
);

drop policy if exists "user_stores_delete_gerencial" on public.user_stores;
create policy "user_stores_delete_gerencial"
on public.user_stores
for delete
to authenticated
using (
  (select public.current_user_role()) = 'gerencial'
);
