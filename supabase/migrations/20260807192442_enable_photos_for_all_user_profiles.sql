-- Motivo: todos os perfis podem enviar fotos; o seletor de habilitacao foi removido.
-- Impacto: corrige usuarios existentes e impede que novas alteracoes desliguem fotos.
-- Rollback manual: remover o trigger/funcao e restaurar valores usando backup caso a
-- politica de habilitacao por perfil volte a ser necessaria.
update public.usuarios
set fotos_habilitadas = true
where fotos_habilitadas is distinct from true;

create or replace function public.enforce_all_user_photo_access()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.fotos_habilitadas := true;
  return new;
end;
$$;

drop trigger if exists enforce_promotor_photo_access on public.usuarios;
drop trigger if exists enforce_all_user_photo_access on public.usuarios;
create trigger enforce_all_user_photo_access
  before insert or update on public.usuarios
for each row execute function public.enforce_all_user_photo_access();

comment on function public.enforce_all_user_photo_access() is
  'Mantem o envio de fotos habilitado para todos os perfis de usuario.';
