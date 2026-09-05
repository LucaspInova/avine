-- The RPC was added to an already published migration. Environments that had
-- applied that migration never received the function, because migrations are
-- immutable once recorded. Redeploy it in a new migration for those databases.
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
