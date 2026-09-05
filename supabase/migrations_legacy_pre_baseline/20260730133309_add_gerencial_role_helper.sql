create or replace function public.is_current_user_gerencial_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.usuarios as u
    where u.auth_user_id = (select auth.uid())
      and u.perfil = 'Gerencial'
      and u.ativo is true
      and u.acesso_habilitado is true
  );
$function$;

revoke all on function public.is_current_user_gerencial_ativo() from public;
grant execute on function public.is_current_user_gerencial_ativo() to authenticated;

;
