-- Motivo: Promotores passam a ter acesso permanente ao fluxo de fotos do FSTD.
-- Impacto: corrige registros existentes e impede novos estados falsos para Promotor.
-- Rollback manual: remover o trigger/funcao e ajustar fotos_habilitadas conforme a
-- politica anterior, usando backup caso seja necessario restaurar valores antigos.
update public.usuarios
set fotos_habilitadas = true
where perfil = 'Promotor'
  and fotos_habilitadas is distinct from true;

create or replace function public.enforce_promotor_photo_access()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.perfil = 'Promotor' then
    new.fotos_habilitadas := true;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_promotor_photo_access on public.usuarios;
create trigger enforce_promotor_photo_access
before insert or update of perfil, fotos_habilitadas on public.usuarios
for each row execute function public.enforce_promotor_photo_access();

comment on function public.enforce_promotor_photo_access() is
  'Mantem o acesso a fotos sempre habilitado para Promotores.';
