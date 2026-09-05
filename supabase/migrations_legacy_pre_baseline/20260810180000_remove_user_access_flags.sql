-- A conta existente no Auth passa a ser a unica fonte de liberacao de acesso.
-- As colunas legadas permanecem apenas para compatibilidade com policies e
-- funcoes publicadas anteriormente; elas nao representam mais engajamento.
update public.usuarios
set ativo = true,
    acesso_habilitado = true
where auth_user_id is not null;

-- Remove bloqueios criados pelo fluxo antigo de "Bloquear acesso".
update auth.users as au
set banned_until = null
where exists (
  select 1
  from public.usuarios as u
  where u.auth_user_id = au.id
);

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
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'Usuario cadastrado nao encontrado.' using errcode = '42501';
  end if;

  return recorded_at;
end;
$$;

comment on column public.usuarios.ativo is
  'Coluna legada mantida por compatibilidade; status visual usa last_access_at nos ultimos 30 dias.';
comment on column public.usuarios.acesso_habilitado is
  'Coluna legada mantida por compatibilidade; acesso existe enquanto auth_user_id estiver associado.';
