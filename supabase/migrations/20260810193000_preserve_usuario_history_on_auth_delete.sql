-- Operational records such as fstd_processos keep the usuarios.id that
-- performed the work. Removing an Auth account must therefore revoke access
-- without cascading into and deleting that historical profile.
alter table public.usuarios
  drop constraint if exists usuarios_auth_user_id_fkey;

alter table public.usuarios
  add constraint usuarios_auth_user_id_fkey
  foreign key (auth_user_id)
  references auth.users(id)
  on delete set null;

comment on constraint usuarios_auth_user_id_fkey on public.usuarios is
  'Preserva o perfil e o historico operacional quando a conta de acesso e excluida.';
