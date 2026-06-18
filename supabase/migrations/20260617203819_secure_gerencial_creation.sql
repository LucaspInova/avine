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
