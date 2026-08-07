alter table public.usuarios
  add column if not exists last_access_at timestamptz;

comment on column public.usuarios.last_access_at is
  'Ultima abertura validada da aplicacao pelo usuario; nao representa autenticacao ou renovacao de sessao.';
