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

insert into public.usuarios (email, nome, perfil, estado, fotos_habilitadas)
values
  ('adeilda.avine@gmail.com', 'ADEILDA', 'Promotor', 'CE', true),
  ('adrianavedo91@gmail.com', 'ADRIANA LIMA', 'Promotor', 'BA', true),
  ('adrianosantos9945@gmail.com', 'ADRIANO SANTOS', 'Promotor', 'MA', true),
  ('adriel.ramos@grupomateus.com', 'ADRIEL RAMOS', 'Promotor', 'BA', true),
  ('adrielecj23@gmail.com', 'ADRIELE CARVALHO DE JESUS', 'Promotor', 'BA', true),
  ('afonsobernardo1215@gmail.com', 'AFONSO', 'Promotor', 'PI', false),
  ('alanhendel364@gmail.com', 'ALAN', 'Promotor', 'PI', false),
  ('diasalba100@gmail.com', 'ALBA', 'Promotor', 'PA', true),
  ('alelucas04@hotmail.com', 'ALESSANDRA', 'Promotor', 'PA', true),
  ('damasceno2602@hotmail.com', 'ALEXANDRE DAMASCENO', 'Promotor', 'MA', true),
  ('sobralaline611@gmail.com', 'ALINE', 'Promotor', 'MA', true),
  ('alinelimax05@gmail.com', 'ALINE LIMA', 'Promotor', 'MA', true),
  ('alisson.16@outlook.com', 'ALISSON GONCALVES CRUZ', 'Promotor', 'CE', true),
  ('alysonsousa119@gmail.com', 'ALYSON SOUSA', 'Promotor', 'CE', true),
  ('alyssonmartins94@icloud.com', 'ALYSSON MARTINS', 'Promotor', 'PB', true),
  ('bruno.entregas@avine.test', 'BRUNO ENTREGAS', 'Entregador', 'PE', false),
  ('carla.rotas@avine.test', 'CARLA ROTAS', 'Entregador', 'RN', true)
on conflict (email) do update
set
  nome = excluded.nome,
  perfil = excluded.perfil,
  estado = excluded.estado,
  fotos_habilitadas = excluded.fotos_habilitadas;
