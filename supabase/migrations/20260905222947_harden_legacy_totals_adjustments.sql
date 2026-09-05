-- Lote 4 / ponto 17: the UI already validates legacy totals, but the database
-- must enforce the same invariant for direct API calls and scope direct reads.

drop policy if exists fstd_legado_ajustes_totais_select_active_user
on public.fstd_legado_ajustes_totais;

create policy fstd_legado_ajustes_totais_select_authorized_store
on public.fstd_legado_ajustes_totais
for select
to authenticated
using (
  exists (
    select 1
    from public.fstd_legado fl
    join public.lojas l on l.codigo::text = fl.codigo_loja
    where fl.legado_id = fstd_legado_ajustes_totais.legado_id
      and app_private.can_current_user_read_loja(l.id)
  )
);

create or replace function public.ajustar_fstd_legado_totais(
  p_legado_id bigint,
  p_qtd_retorno_galinha bigint,
  p_qtd_retorno_codorna bigint
)
returns public.fstd_legado
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario public.usuarios;
  v_legado public.fstd_legado;
  v_loja_id uuid;
  v_resultado public.fstd_legado;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessao autenticada obrigatoria.';
  end if;

  if p_qtd_retorno_galinha is null or p_qtd_retorno_galinha < 0
    or p_qtd_retorno_codorna is null or p_qtd_retorno_codorna < 0 then
    raise exception 'As quantidades de retorno devem ser inteiros nao negativos.';
  end if;

  select u.*
    into v_usuario
  from public.usuarios u
  where u.auth_user_id = (select auth.uid())
    and u.perfil in ('Gerencial', 'Admin')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_usuario.id is null then
    raise exception 'Somente usuarios Gerencial ou Admin ativos podem editar uma FSTD finalizada.';
  end if;

  select fl.*
    into v_legado
  from public.fstd_legado_canonico fl
  where fl.legado_id = p_legado_id
  limit 1;

  if v_legado.legado_id is null then
    raise exception 'FSTD legada nao encontrada para o ajuste.';
  end if;

  if p_qtd_retorno_galinha > coalesce(v_legado.qtd_total_galinha, 0)
    or p_qtd_retorno_codorna > coalesce(v_legado.qtd_total_codorna, 0) then
    raise exception 'A quantidade de retorno nao pode ser maior que a quantidade faturada.';
  end if;

  select l.id
    into v_loja_id
  from public.lojas l
  where l.codigo::text = v_legado.codigo_loja
  limit 1;

  if v_loja_id is null then
    raise exception 'Loja da FSTD legada nao encontrada para o ajuste.';
  end if;

  if not app_private.can_current_user_access_loja(v_loja_id) then
    raise exception 'Usuario sem acesso a loja desta FSTD.';
  end if;

  insert into public.fstd_legado_ajustes_totais (
    legado_id,
    qtd_retorno_galinha,
    qtd_retorno_codorna,
    atualizado_por
  )
  values (
    v_legado.legado_id,
    p_qtd_retorno_galinha,
    p_qtd_retorno_codorna,
    v_usuario.id
  )
  on conflict (legado_id) do update
    set qtd_retorno_galinha = excluded.qtd_retorno_galinha,
        qtd_retorno_codorna = excluded.qtd_retorno_codorna,
        atualizado_por = excluded.atualizado_por;

  select resultado.*
    into v_resultado
  from public.obter_fstd_legado(v_legado.codigo_loja, v_legado.numero_nfd) resultado
  where resultado.legado_id = v_legado.legado_id;

  return v_resultado;
end;
$function$;

revoke all on function public.ajustar_fstd_legado_totais(bigint, bigint, bigint)
from public, anon;
grant execute on function public.ajustar_fstd_legado_totais(bigint, bigint, bigint)
to authenticated;

notify pgrst, 'reload schema';
