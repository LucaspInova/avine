-- FSTDs imported from the previous system do not have product-level records.
-- Keep source rows immutable and persist manager corrections separately, so the
-- scheduled legacy sync remains idempotent and the original import is auditable.
create table public.fstd_legado_ajustes_totais (
  legado_id bigint primary key references public.fstd_legado(legado_id) on delete restrict,
  qtd_retorno_galinha bigint not null check (qtd_retorno_galinha >= 0),
  qtd_retorno_codorna bigint not null check (qtd_retorno_codorna >= 0),
  atualizado_por uuid not null references public.usuarios(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fstd_legado_ajustes_totais is
  'Ajustes operacionais auditaveis dos retornos por especie para FSTDs legadas sem itens detalhados.';

alter table public.fstd_legado_ajustes_totais enable row level security;
revoke all on table public.fstd_legado_ajustes_totais from public, anon, authenticated;

-- Preserve the existing read authorization contract of fstd_legado: active
-- operational users may read the effective legacy document, but only the RPC
-- below can change the adjustment.
grant select on table public.fstd_legado_ajustes_totais to authenticated;
create policy fstd_legado_ajustes_totais_select_active_user
on public.fstd_legado_ajustes_totais
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

create or replace function public.fstd_legado_ajustes_totais_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function public.fstd_legado_ajustes_totais_set_updated_at() from public, anon, authenticated;

create trigger fstd_legado_ajustes_totais_set_updated_at
before update on public.fstd_legado_ajustes_totais
for each row execute function public.fstd_legado_ajustes_totais_set_updated_at();

-- All existing consumers (including the legacy PDF) receive the effective
-- return quantities, while source totals and lineage remain untouched.
create or replace function public.obter_fstd_legado(p_codigo_loja text, p_numero_nfd text)
returns setof public.fstd_legado
language sql
stable
security invoker
set search_path = public
as $function$
  select
    fl.legado_id,
    fl.codigo_loja,
    fl.numero_nfd,
    fl.id,
    fl.numero_controle,
    fl.data_preenchimento,
    fl.responsavel_fstd,
    fl.motivo,
    fl.qtd_total_galinha,
    coalesce(ajuste.qtd_retorno_galinha, fl.qtd_retorno_galinha),
    fl.qtd_total_codorna,
    coalesce(ajuste.qtd_retorno_codorna, fl.qtd_retorno_codorna),
    fl.origem,
    fl.source_hash,
    fl.created_at
  from public.fstd_legado_canonico fl
  left join public.fstd_legado_ajustes_totais ajuste on ajuste.legado_id = fl.legado_id
  where fl.codigo_loja = trim(p_codigo_loja)
    and fl.numero_nfd = trim(p_numero_nfd);
$function$;

revoke all on function public.obter_fstd_legado(text, text) from public, anon;
grant execute on function public.obter_fstd_legado(text, text) to authenticated;

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

  select fl.*, l.id
    into v_legado, v_loja_id
  from public.fstd_legado_canonico fl
  join public.lojas l on l.codigo::text = fl.codigo_loja
  where fl.legado_id = p_legado_id
  limit 1;

  if v_legado.legado_id is null or v_loja_id is null then
    raise exception 'FSTD legada nao encontrada para o ajuste.';
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

revoke all on function public.ajustar_fstd_legado_totais(bigint, bigint, bigint) from public, anon;
grant execute on function public.ajustar_fstd_legado_totais(bigint, bigint, bigint) to authenticated;

comment on function public.ajustar_fstd_legado_totais(bigint, bigint, bigint) is
  'Ajusta somente os retornos totais de Galinha e Codorna quando a FSTD legada nao possui itens detalhados.';

notify pgrst, 'reload schema';
