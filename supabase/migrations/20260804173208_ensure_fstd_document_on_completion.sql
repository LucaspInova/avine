-- Keep the document row as a database invariant of a concluded FSTD.
-- The existing fstd_documentos unique constraint makes this operation safe
-- under retries and concurrent completion attempts; the sequence remains the
-- sole source of numero_controle through the column default.
create or replace function app_private.ensure_fstd_document(p_processo_id uuid)
returns public.fstd_documentos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_document public.fstd_documentos;
begin
  if p_processo_id is null then
    raise exception 'Processo FSTD obrigatorio.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.fstd_processos as p
    where p.id = p_processo_id
      and p.status = 'concluida'
  ) then
    raise exception 'Somente processos FSTD concluidos podem possuir documento.'
      using errcode = '22023';
  end if;

  insert into public.fstd_documentos (processo_id)
  values (p_processo_id)
  on conflict (processo_id) do nothing;

  select d.*
  into v_document
  from public.fstd_documentos as d
  where d.processo_id = p_processo_id;

  if v_document.id is null then
    raise exception 'Nao foi possivel garantir o documento FSTD.';
  end if;

  return v_document;
end;
$function$;

revoke all on function app_private.ensure_fstd_document(uuid) from public, anon, authenticated;

create or replace function app_private.fstd_processos_ensure_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'concluida' then
    perform app_private.ensure_fstd_document(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function app_private.fstd_processos_ensure_document() from public, anon, authenticated;

drop trigger if exists fstd_processos_ensure_document on public.fstd_processos;
create constraint trigger fstd_processos_ensure_document
after insert or update of status on public.fstd_processos
deferrable initially immediate
for each row
when (new.status = 'concluida')
execute function app_private.fstd_processos_ensure_document();

-- Keep the existing PDF/document endpoint on the same idempotent primitive.
create or replace function public.get_or_create_fstd_document(p_processo_id uuid)
returns public.fstd_documentos
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = p_processo_id
      and p.status = 'concluida'
      and (
        app_private.can_current_user_access_process(p.id)
        or (u.auth_user_id = (select auth.uid()) and u.ativo is true)
      )
  ) then
    raise exception 'FSTD concluida nao encontrada ou sem permissao.' using errcode = '42501';
  end if;

  return app_private.ensure_fstd_document(p_processo_id);
end;
$function$;

revoke all on function public.get_or_create_fstd_document(uuid) from public, anon;
grant execute on function public.get_or_create_fstd_document(uuid) to authenticated;

-- Manual, idempotent recovery for concluded processes created before this
-- invariant existed. It is never invoked by a trigger or by the frontend.
-- A normal API caller must be an active Gerencial user. A direct privileged
-- SQL execution (auth.uid() is null) is also supported for operations work.
create or replace function public.recuperar_fstd_documentos()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_processo_id uuid;
  v_criados integer := 0;
begin
  if (select auth.uid()) is not null
    and not app_private.is_current_user_gerencial_ativo() then
    raise exception 'Somente um usuario Gerencial ativo pode recuperar documentos FSTD.'
      using errcode = '42501';
  end if;

  for v_processo_id in
    select p.id
    from public.fstd_processos as p
    where p.status = 'concluida'
      and not exists (
        select 1
        from public.fstd_documentos as d
        where d.processo_id = p.id
      )
    order by p.finalizada_em nulls first, p.id
  loop
    perform app_private.ensure_fstd_document(v_processo_id);
    v_criados := v_criados + 1;
  end loop;

  return v_criados;
end;
$function$;

revoke all on function public.recuperar_fstd_documentos() from public, anon;
grant execute on function public.recuperar_fstd_documentos() to authenticated;

comment on function public.recuperar_fstd_documentos() is
  'Recupera manualmente documentos ausentes de processos FSTD concluidos; retorna a quantidade criada.';

notify pgrst, 'reload schema';
