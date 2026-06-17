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

create or replace function public.create_gerencial_user(
  p_nome text,
  p_email text,
  p_password text
)
returns public.usuarios
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_nome text := nullif(btrim(p_nome), '');
  v_email text := lower(nullif(btrim(p_email), ''));
  v_auth_id uuid;
  v_usuario public.usuarios;
begin
  if not public.is_current_user_gerencial_ativo() then
    raise exception 'Apenas Gerenciais ativos podem criar Gerenciais.';
  end if;

  if v_nome is null or char_length(v_nome) < 4 then
    raise exception 'Informe um nome valido.';
  end if;

  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail valido.';
  end if;

  if p_password is null or char_length(p_password) < 8 then
    raise exception 'A senha deve ter pelo menos 8 caracteres.';
  end if;

  select id into v_auth_id
  from auth.users
  where lower(email) = v_email
    and deleted_at is null
  limit 1;

  if v_auth_id is null then
    v_auth_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_auth_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('nome', v_nome),
      now(),
      now()
    );

    insert into auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      v_auth_id::text,
      v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    )
    on conflict (provider_id, provider) do nothing;
  end if;

  if exists (
    select 1
    from public.usuarios
    where lower(email) = v_email
      and (auth_user_id is distinct from v_auth_id)
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
    v_auth_id,
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

  return v_usuario;
end;
$$;

revoke all on function public.create_gerencial_user(text, text, text) from public;
grant execute on function public.create_gerencial_user(text, text, text) to authenticated;

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

do $$
declare
  v_auth_id uuid;
begin
  select id into v_auth_id
  from auth.users
  where lower(email) = 'admin@avine.com.br'
    and deleted_at is null
  limit 1;

  if v_auth_id is null then
    v_auth_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_auth_id,
      'authenticated',
      'authenticated',
      'admin@avine.com.br',
      crypt('Avine@2025', gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('nome', 'Administrador'),
      now(),
      now()
    );
  else
    update auth.users
    set
      encrypted_password = crypt('Avine@2025', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
      updated_at = now()
    where id = v_auth_id;
  end if;

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_auth_id::text,
    v_auth_id,
    jsonb_build_object('sub', v_auth_id::text, 'email', 'admin@avine.com.br', 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
  set
    identity_data = excluded.identity_data,
    updated_at = now();

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
    v_auth_id,
    'Administrador',
    'admin@avine.com.br',
    'Gerencial',
    'CE',
    false,
    true
  )
  on conflict (email) do update
  set
    auth_user_id = excluded.auth_user_id,
    nome = excluded.nome,
    perfil = excluded.perfil,
    estado = excluded.estado,
    fotos_habilitadas = excluded.fotos_habilitadas,
    ativo = excluded.ativo;
end $$;
