alter table public.usuarios
  add column if not exists last_access_at timestamptz;

comment on column public.usuarios.last_access_at is
  'Ultima abertura validada da aplicacao pelo usuario; nao representa autenticacao ou renovacao de sessao.';

-- A escrita direta dependia das politicas e triggers de atualizacao de usuarios.
-- Esta funcao limita a operacao ao perfil autenticado e devolve o valor persistido,
-- permitindo que o cliente confirme imediatamente o registro do acesso.
create or replace function public.record_usuario_access()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;

  update public.usuarios
  set last_access_at = recorded_at
  where auth_user_id = auth.uid()
    and ativo is true
    and acesso_habilitado is true;

  if not found then
    raise exception 'Usuario ativo nao encontrado.' using errcode = '42501';
  end if;

  return recorded_at;
end;
$$;

revoke all on function public.record_usuario_access() from public, anon;
grant execute on function public.record_usuario_access() to authenticated;
