begin;

update public.usuarios
set perfil = 'Promotor'
where perfil = 'Entregador';

alter table public.usuarios
  drop constraint if exists usuarios_perfil_check;

alter table public.usuarios
  add constraint usuarios_perfil_check
  check (perfil in ('Promotor', 'Gerencial', 'Supervisor'));

drop policy if exists "usuarios_insert_gerencial" on public.usuarios;
create policy "usuarios_insert_gerencial"
on public.usuarios
for insert
to authenticated
with check (
  (select app_private.is_current_user_gerencial_ativo())
  and perfil in ('Promotor', 'Gerencial', 'Supervisor')
  and estado in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL')
);

drop policy if exists "usuarios_update_gerencial" on public.usuarios;
create policy "usuarios_update_gerencial"
on public.usuarios
for update
to authenticated
using ((select app_private.is_current_user_gerencial_ativo()))
with check (
  (select app_private.is_current_user_gerencial_ativo())
  and perfil in ('Promotor', 'Gerencial', 'Supervisor')
  and estado in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL')
);

comment on table public.usuarios is
  'Usuarios do FSTD Digital e do painel Gerencial; perfis operacionais ativos: Promotor e Gerencial.';

commit;
