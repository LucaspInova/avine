create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text not null,
  perfil text not null check (perfil in ('Promotor', 'Entregador')),
  estado text not null check (estado in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL')),
  fotos_habilitadas boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.usuarios is 'Usuarios operacionais compartilhados pelo app gerencial e pelos futuros apps de Promotor e Entregador.';
comment on column public.usuarios.perfil is 'Perfil operacional usado para separar experiencias entre Promotor e Entregador.';
comment on column public.usuarios.fotos_habilitadas is 'Controla se o usuario pode utilizar o modulo de fotos.';

create index if not exists usuarios_nome_idx on public.usuarios using btree (nome);
create index if not exists usuarios_estado_idx on public.usuarios using btree (estado);
create index if not exists usuarios_perfil_idx on public.usuarios using btree (perfil);

alter table public.usuarios enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.usuarios to anon, authenticated;

drop policy if exists "usuarios_select_client" on public.usuarios;
create policy "usuarios_select_client"
on public.usuarios
for select
to anon, authenticated
using (true);

drop policy if exists "usuarios_insert_client" on public.usuarios;
create policy "usuarios_insert_client"
on public.usuarios
for insert
to anon, authenticated
with check (
  perfil in ('Promotor', 'Entregador')
  and estado in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL')
);

drop policy if exists "usuarios_update_client" on public.usuarios;
create policy "usuarios_update_client"
on public.usuarios
for update
to anon, authenticated
using (true)
with check (
  perfil in ('Promotor', 'Entregador')
  and estado in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL')
);

-- Operational profiles are production data. They are provisioned through the
-- administrative Edge Function and are intentionally not seeded by migrations.
