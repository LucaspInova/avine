do $$
declare
  v_email text := 'lucas@masterinova.com';
  v_nome text := 'Lucas';
  v_auth_id uuid;
begin
  if exists (
    select 1
    from public.usuarios
    where lower(btrim(nome)) = lower(btrim(v_nome))
      and lower(email) <> v_email
  ) then
    v_nome := 'Lucas Masterinova';
  end if;

  if exists (
    select 1
    from public.usuarios
    where lower(btrim(nome)) = lower(btrim(v_nome))
      and lower(email) <> v_email
  ) then
    v_nome := 'Lucas ' || split_part(v_email, '@', 1);
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
      crypt('Lucas12345', gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'gerencial'),
      jsonb_build_object('nome', v_nome),
      now(),
      now()
    );
  else
    update auth.users
    set
      encrypted_password = crypt('Lucas12345', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'gerencial'),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('nome', v_nome),
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
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email, 'email_verified', true),
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
    perfil = excluded.perfil,
    estado = excluded.estado,
    fotos_habilitadas = excluded.fotos_habilitadas,
    ativo = excluded.ativo;
end $$;
