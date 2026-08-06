alter table public.nfd_desconhecimentos
  add column if not exists reconhecida_em timestamptz,
  add column if not exists reconhecida_por uuid references public.usuarios(id) on delete set null;

comment on column public.nfd_desconhecimentos.reconhecida_em is
  'Momento em que um usuario Gerencial voltou a reconhecer a NFD.';
comment on column public.nfd_desconhecimentos.reconhecida_por is
  'Usuario Gerencial que reverteu a marcacao de NFD desconhecida.';

create index if not exists nfd_desconhecimentos_ativos_chave_idx
  on public.nfd_desconhecimentos (nfd_chave_acesso)
  where reconhecida_em is null;

create index if not exists nfd_desconhecimentos_ativos_referencia_idx
  on public.nfd_desconhecimentos (nfd_referencia)
  where reconhecida_em is null;

create or replace function public.reconhecer_nfd_gerencial(
  p_nfd_referencia text,
  p_nfd_chave_acesso text,
  p_nfd_numero text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_gerencial_id uuid;
  v_updated integer;
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
    raise exception 'Usuario Gerencial ativo nao encontrado.';
  end if;

  if nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is null
    and nullif(btrim(coalesce(p_nfd_referencia, '')), '') is null then
    raise exception 'Informe a chave de acesso ou a referencia da NFD.';
  end if;

  update public.nfd_desconhecimentos as nd
  set reconhecida_em = now(),
      reconhecida_por = v_gerencial_id
  where nd.reconhecida_em is null
    and (
      (
        nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is not null
        and nd.nfd_chave_acesso = btrim(p_nfd_chave_acesso)
      )
      or (
        nullif(btrim(coalesce(p_nfd_referencia, '')), '') is not null
        and nd.nfd_referencia = btrim(p_nfd_referencia)
      )
    )
    and (
      nullif(btrim(coalesce(p_nfd_numero, '')), '') is null
      or nd.nfd_numero = btrim(p_nfd_numero)
    );

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Nenhuma marcacao desconhecida ativa foi encontrada para esta NFD.';
  end if;

  return v_updated;
end;
$function$;

revoke all on function public.reconhecer_nfd_gerencial(text, text, text) from public, anon;
grant execute on function public.reconhecer_nfd_gerencial(text, text, text) to authenticated;

do $migration$
declare
  v_definition text;
  v_old_access text := $old$
    and fp.status = 'concluido'
    and p.status = 'em_andamento'
    and (
      public.is_current_user_gerencial_ativo()
      or (
        p.promotor_id = v_promotor_id
        and exists (
          select 1
          from public.loja_promotores as lp
          where lp.loja_id = p.loja_id
            and lp.promotor_id = v_promotor_id
        )
      )
    )
$old$;
  v_new_access text := $new$
    and fp.status = 'concluido'
    and (
      (
        public.is_current_user_gerencial_ativo()
        and p.status in ('em_andamento', 'concluida')
      )
      or (
        p.status = 'em_andamento'
        and p.promotor_id = v_promotor_id
        and exists (
          select 1
          from public.loja_promotores as lp
          where lp.loja_id = p.loja_id
            and lp.promotor_id = v_promotor_id
        )
      )
    )
$new$;
  v_old_photo_check text := $old$
    where left(uploaded.path, length(v_photo_prefix)) <> v_photo_prefix
      or not exists (
$old$;
  v_new_photo_check text := $new$
    where (
        not public.is_current_user_gerencial_ativo()
        and left(uploaded.path, length(v_photo_prefix)) <> v_photo_prefix
      )
      or not exists (
$new$;
  v_old_return text := $old$

  return v_item;
end;
$old$;
  v_new_return text := $new$

  if exists (
    select 1
    from public.fstd_processos as p
    where p.id = v_processo_id
      and p.status = 'concluida'
  ) then
    update public.fstd_processos
    set updated_at = now()
    where id = v_processo_id;

    update public.fstd_documentos
    set pdf_metadata = coalesce(pdf_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'template_version', 0,
            'invalidated_by', 'gerencial_edit',
            'invalidated_at', now()
          ),
        updated_at = now()
    where processo_id = v_processo_id;
  end if;

  return v_item;
end;
$new$;
begin
  select pg_get_functiondef(
    'public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb)'::regprocedure
  )
  into v_definition;

  if position(v_old_access in v_definition) = 0 then
    raise exception 'Nao foi possivel localizar a validacao de acesso da edicao FSTD.';
  end if;
  v_definition := replace(v_definition, v_old_access, v_new_access);

  if position(v_old_photo_check in v_definition) = 0 then
    raise exception 'Nao foi possivel localizar a validacao de fotos da edicao FSTD.';
  end if;
  v_definition := replace(v_definition, v_old_photo_check, v_new_photo_check);

  if position(v_old_return in v_definition) = 0 then
    raise exception 'Nao foi possivel localizar o retorno da edicao FSTD.';
  end if;
  v_definition := replace(v_definition, v_old_return, v_new_return);

  execute v_definition;
end
$migration$;

notify pgrst, 'reload schema';;
