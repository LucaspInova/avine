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
  v_gerencial_id uuid;
  v_result public.nfd_desconhecimentos;
begin
  select u.id
  into v_gerencial_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Gerencial'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_gerencial_id is null then
    raise exception 'Usuário Gerencial ativo não encontrado.';
  end if;

  if p_loja_id is null
    or nullif(btrim(coalesce(p_nfd_referencia, '')), '') is null
    or nullif(btrim(coalesce(p_nfd_numero, '')), '') is null then
    raise exception 'Loja e identificação da NFD são obrigatórias.';
  end if;

  insert into public.nfd_desconhecimentos (
    loja_id,
    promotor_id,
    nfd_referencia,
    nfd_chave_acesso,
    nfd_numero,
    loja_codigo,
    comentario
  )
  values (
    p_loja_id,
    v_gerencial_id,
    btrim(p_nfd_referencia),
    nullif(btrim(p_nfd_chave_acesso), ''),
    btrim(p_nfd_numero),
    nullif(btrim(p_loja_codigo), ''),
    coalesce(nullif(btrim(p_comentario), ''), 'NFD marcada como desconhecida pelo usuário Gerencial.')
  )
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.desconhecer_nfd_gerencial(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.desconhecer_nfd_gerencial(uuid, text, text, text, text, text) to authenticated;
