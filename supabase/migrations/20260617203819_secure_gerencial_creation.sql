-- Canonical authentication/RLS baseline reconciled with production.
alter table public.usuarios
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists ativo boolean not null default true;

alter table public.usuarios
  drop constraint if exists usuarios_perfil_check;

alter table public.usuarios
  add constraint usuarios_perfil_check
  check (perfil in ('Promotor', 'Entregador', 'Gerencial'));

create unique index if not exists usuarios_auth_user_id_unique_idx
on public.usuarios (auth_user_id)
where auth_user_id is not null;

create index if not exists usuarios_ativo_idx on public.usuarios using btree (ativo);

create or replace function public.is_current_user_gerencial_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios as u
    where u.auth_user_id = (select auth.uid())
      and u.perfil = 'Gerencial'
      and u.ativo is true
  )
$$;

revoke all on function public.is_current_user_gerencial_ativo() from public;
grant execute on function public.is_current_user_gerencial_ativo() to authenticated;


create or replace function public.update_gerencial_user(
  p_usuario_id uuid,
  p_nome text,
  p_email text,
  p_ativo boolean
)
returns public.usuarios
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_nome text := nullif(btrim(p_nome), '');
  v_email text := lower(nullif(btrim(p_email), ''));
  v_target public.usuarios;
  v_usuario public.usuarios;
begin
  if not public.is_current_user_gerencial_ativo() then
    raise exception 'Apenas Gerenciais ativos podem editar Gerenciais.';
  end if;

  select * into v_target
  from public.usuarios
  where id = p_usuario_id
    and perfil = 'Gerencial';

  if v_target.id is null then
    raise exception 'Gerencial nao encontrado.';
  end if;

  if v_nome is null or char_length(v_nome) < 4 then
    raise exception 'Informe um nome valido.';
  end if;

  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail valido.';
  end if;

  if p_ativo is false and v_target.auth_user_id = (select auth.uid()) then
    raise exception 'Voce nao pode desativar o proprio usuario.';
  end if;

  if p_ativo is false and (
    select count(*)
    from public.usuarios
    where perfil = 'Gerencial'
      and ativo is true
      and id <> p_usuario_id
  ) = 0 then
    raise exception 'Nao e permitido desativar o ultimo Gerencial ativo.';
  end if;

  if exists (
    select 1
    from public.usuarios
    where lower(email) = v_email
      and id <> p_usuario_id
  ) then
    raise exception 'Este e-mail ja esta cadastrado.';
  end if;

  update public.usuarios
  set
    nome = v_nome,
    email = v_email,
    ativo = p_ativo
  where id = p_usuario_id
  returning * into v_usuario;

  if v_usuario.auth_user_id is not null then
    update auth.users
    set
      email = v_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', v_nome),
      updated_at = now()
    where id = v_usuario.auth_user_id;

    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email),
      updated_at = now()
    where user_id = v_usuario.auth_user_id
      and provider = 'email';
  end if;

  return v_usuario;
end;
$$;

revoke all on function public.update_gerencial_user(uuid, text, text, boolean) from public;
grant execute on function public.update_gerencial_user(uuid, text, text, boolean) to authenticated;

alter table public.usuarios enable row level security;
alter table public.lojas enable row level security;
alter table public.loja_promotores enable row level security;

revoke all on table public.usuarios from anon;
revoke all on table public.lojas from anon;
revoke all on table public.loja_promotores from anon;

grant select, insert, update, delete on table public.usuarios to authenticated;
grant select, insert, update, delete on table public.lojas to authenticated;
grant select, insert, update, delete on table public.loja_promotores to authenticated;

drop policy if exists "usuarios_select_client" on public.usuarios;
drop policy if exists "usuarios_insert_client" on public.usuarios;
drop policy if exists "usuarios_update_client" on public.usuarios;
drop policy if exists "usuarios_delete_client" on public.usuarios;
drop policy if exists "usuarios_select_self_or_gerencial" on public.usuarios;
drop policy if exists "usuarios_insert_gerencial" on public.usuarios;
drop policy if exists "usuarios_update_gerencial" on public.usuarios;
drop policy if exists "usuarios_delete_gerencial" on public.usuarios;

create policy "usuarios_select_self_or_gerencial"
on public.usuarios
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or public.is_current_user_gerencial_ativo()
);

create policy "usuarios_insert_gerencial"
on public.usuarios
for insert
to authenticated
with check (
  public.is_current_user_gerencial_ativo()
  and perfil in ('Promotor', 'Entregador', 'Gerencial')
  and estado in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL')
);

create policy "usuarios_update_gerencial"
on public.usuarios
for update
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (
  perfil in ('Promotor', 'Entregador', 'Gerencial')
  and estado in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL')
);

create policy "usuarios_delete_gerencial"
on public.usuarios
for delete
to authenticated
using (public.is_current_user_gerencial_ativo());

drop policy if exists "lojas_select_client" on public.lojas;
drop policy if exists "lojas_insert_client" on public.lojas;
drop policy if exists "lojas_update_client" on public.lojas;
drop policy if exists "lojas_delete_client" on public.lojas;
drop policy if exists "lojas_select_gerencial" on public.lojas;
drop policy if exists "lojas_insert_gerencial" on public.lojas;
drop policy if exists "lojas_update_gerencial" on public.lojas;
drop policy if exists "lojas_delete_gerencial" on public.lojas;

create policy "lojas_select_gerencial"
on public.lojas
for select
to authenticated
using (public.is_current_user_gerencial_ativo());

create policy "lojas_insert_gerencial"
on public.lojas
for insert
to authenticated
with check (
  public.is_current_user_gerencial_ativo()
  and uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL')
);

create policy "lojas_update_gerencial"
on public.lojas
for update
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL'));

create policy "lojas_delete_gerencial"
on public.lojas
for delete
to authenticated
using (public.is_current_user_gerencial_ativo());

drop policy if exists "loja_promotores_select_client" on public.loja_promotores;
drop policy if exists "loja_promotores_insert_client" on public.loja_promotores;
drop policy if exists "loja_promotores_update_client" on public.loja_promotores;
drop policy if exists "loja_promotores_delete_client" on public.loja_promotores;
drop policy if exists "loja_promotores_select_gerencial" on public.loja_promotores;
drop policy if exists "loja_promotores_insert_gerencial" on public.loja_promotores;
drop policy if exists "loja_promotores_update_gerencial" on public.loja_promotores;
drop policy if exists "loja_promotores_delete_gerencial" on public.loja_promotores;

create policy "loja_promotores_select_gerencial"
on public.loja_promotores
for select
to authenticated
using (public.is_current_user_gerencial_ativo());

create policy "loja_promotores_insert_gerencial"
on public.loja_promotores
for insert
to authenticated
with check (
  public.is_current_user_gerencial_ativo()
  and (
    promotor_id is null
    or exists (
      select 1
      from public.usuarios as u
      where u.id = promotor_id
        and u.perfil = 'Promotor'
    )
  )
);

create policy "loja_promotores_update_gerencial"
on public.loja_promotores
for update
to authenticated
using (public.is_current_user_gerencial_ativo())
with check (
  promotor_id is null
  or exists (
    select 1
    from public.usuarios as u
    where u.id = promotor_id
      and u.perfil = 'Promotor'
  )
);

create policy "loja_promotores_delete_gerencial"
on public.loja_promotores
for delete
to authenticated
using (public.is_current_user_gerencial_ativo());

create or replace function public.create_gerencial_user(
  p_auth_user_id uuid,
  p_nome text,
  p_email text
)
returns public.usuarios
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_nome text := nullif(btrim(p_nome), '');
  v_email text := lower(nullif(btrim(p_email), ''));
  v_usuario public.usuarios;
begin
  if not public.is_current_user_gerencial_ativo() then
    raise exception 'Apenas Gerenciais ativos podem criar Gerenciais.';
  end if;

  if p_auth_user_id is null then
    raise exception 'Usuario de Auth invalido.';
  end if;

  if v_nome is null or char_length(v_nome) < 4 then
    raise exception 'Informe um nome valido.';
  end if;

  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail valido.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_auth_user_id
      and lower(email) = v_email
      and deleted_at is null
  ) then
    raise exception 'Usuario de Auth nao encontrado para este e-mail.';
  end if;

  if exists (
    select 1
    from public.usuarios
    where lower(email) = v_email
      and auth_user_id is distinct from p_auth_user_id
  ) then
    raise exception 'Este e-mail ja esta cadastrado.';
  end if;

  insert into public.usuarios (
    auth_user_id,
    nome,
    email,
    perfil,
    estado,
    fotos_habilitadas,
    ativo
  )
  values (
    p_auth_user_id,
    v_nome,
    v_email,
    'Gerencial',
    'CE',
    false,
    true
  )
  on conflict (email) do update
  set
    auth_user_id = excluded.auth_user_id,
    nome = excluded.nome,
    perfil = 'Gerencial',
    estado = 'CE',
    fotos_habilitadas = false,
    ativo = true
  returning * into v_usuario;

  update auth.users
  set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'gerencial'),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('nome', v_nome),
    updated_at = now()
  where id = p_auth_user_id;

  return v_usuario;
end;
$$;

revoke all on function public.create_gerencial_user(uuid, text, text) from public;
grant execute on function public.create_gerencial_user(uuid, text, text) to authenticated;

revoke all on function public.create_gerencial_user(text, text, text) from public;
drop function if exists public.create_gerencial_user(text, text, text);

update auth.users as au
set
  raw_app_meta_data = coalesce(au.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'gerencial'),
  updated_at = now()
from public.usuarios as u
where u.auth_user_id = au.id
  and u.perfil = 'Gerencial';
