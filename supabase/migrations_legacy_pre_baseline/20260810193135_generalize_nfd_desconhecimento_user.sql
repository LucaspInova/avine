alter table public.nfd_desconhecimentos
  rename column promotor_id to usuario_id;

alter index if exists public.nfd_desconhecimentos_promotor_id_idx
  rename to nfd_desconhecimentos_usuario_id_idx;

comment on column public.nfd_desconhecimentos.usuario_id is
  'Usuario responsavel pelo registro do desconhecimento, independentemente do perfil operacional.';

drop policy if exists "nfd_desconhecimentos_select_gerencial_or_own" on public.nfd_desconhecimentos;
drop policy if exists nfd_desconhecimentos_select_scoped on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_select_scoped
on public.nfd_desconhecimentos
for select
to authenticated
using (
  public.is_current_user_gerencial_ativo()
  or exists (
    select 1
    from public.usuarios as u
    where u.id = nfd_desconhecimentos.usuario_id
      and u.auth_user_id = (select auth.uid())
      and u.ativo is true
  )
);

drop policy if exists "nfd_desconhecimentos_insert_own_assigned_store" on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_insert_current_user_with_store_access
on public.nfd_desconhecimentos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios as u
    where u.id = nfd_desconhecimentos.usuario_id
      and u.auth_user_id = (select auth.uid())
      and u.ativo is true
  )
  and app_private.can_current_user_access_loja(nfd_desconhecimentos.loja_id)
);

create or replace function public.desconhecer_nfd_gerencial(
  p_loja_id uuid,
  p_nfd_referencia text,
  p_nfd_chave_acesso text,
  p_nfd_numero text,
  p_loja_codigo text,
  p_comentario text default 'NFD marcada como desconhecida pelo usuário Gerencial.'
)
returns public.nfd_desconhecimentos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario_id uuid;
  v_result public.nfd_desconhecimentos;
begin
  select u.id
  into v_usuario_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil in ('Admin', 'Gerencial')
    and u.ativo is true
    and u.acesso_habilitado is true
    and public.app_private.can_current_user_access_loja(p_loja_id)
  limit 1;

  if v_usuario_id is null then
    raise exception 'Usuário Gerencial ativo não encontrado.';
  end if;

  if p_loja_id is null
    or nullif(btrim(coalesce(p_nfd_referencia, '')), '') is null
    or nullif(btrim(coalesce(p_nfd_numero, '')), '') is null then
    raise exception 'Loja e identificação da NFD são obrigatórias.';
  end if;

  insert into public.nfd_desconhecimentos (
    loja_id, usuario_id, nfd_referencia, nfd_chave_acesso,
    nfd_numero, loja_codigo, comentario
  )
  values (
    p_loja_id, v_usuario_id, btrim(p_nfd_referencia),
    nullif(btrim(p_nfd_chave_acesso), ''), btrim(p_nfd_numero),
    nullif(btrim(p_loja_codigo), ''),
    coalesce(nullif(btrim(p_comentario), ''), 'NFD marcada como desconhecida pelo usuário Gerencial.')
  )
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.desconhecer_nfd_gerencial(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.desconhecer_nfd_gerencial(uuid, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
