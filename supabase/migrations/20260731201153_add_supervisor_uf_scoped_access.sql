-- Supervisors use the Gerencial workspace, but every operation is scoped to
-- the UF stored in their profile. Authorization is based on public.usuarios,
-- never on user-editable JWT metadata.

alter table public.usuarios
  drop constraint if exists usuarios_perfil_check;

alter table public.usuarios
  add constraint usuarios_perfil_check
  check (perfil in ('Promotor', 'Entregador', 'Gerencial', 'Supervisor'));

create index if not exists usuarios_perfil_estado_idx
  on public.usuarios (perfil, estado);

create or replace function app_private.is_current_user_manager_ativo()
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
      and u.perfil in ('Gerencial', 'Supervisor')
      and u.ativo is true
      and u.acesso_habilitado is true
  );
$function$;

create or replace function app_private.current_user_uf()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select u.estado
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil = 'Supervisor'
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;
$function$;

create or replace function app_private.can_current_user_access_loja(p_loja_id uuid)
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
      and u.ativo is true
      and u.acesso_habilitado is true
      and (
        u.perfil = 'Gerencial'
        or (
          u.perfil = 'Supervisor'
          and exists (
            select 1
            from public.lojas as l
            where l.id = p_loja_id
              and upper(l.uf) = upper(u.estado)
          )
        )
      )
  );
$function$;

create or replace function app_private.can_current_user_access_process(p_processo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.fstd_processos as p
    where p.id = p_processo_id
      and app_private.can_current_user_access_loja(p.loja_id)
  );
$function$;

create or replace function app_private.can_current_user_access_product(p_produto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.fstd_produtos as fp
    join public.fstd_processos as p on p.id = fp.processo_id
    where fp.id = p_produto_id
      and app_private.can_current_user_access_loja(p.loja_id)
  );
$function$;

revoke all on function app_private.is_current_user_manager_ativo() from public, anon;
revoke all on function app_private.current_user_uf() from public, anon;
revoke all on function app_private.can_current_user_access_loja(uuid) from public, anon;
revoke all on function app_private.can_current_user_access_process(uuid) from public, anon;
revoke all on function app_private.can_current_user_access_product(uuid) from public, anon;
grant execute on function app_private.is_current_user_manager_ativo() to authenticated;
grant execute on function app_private.current_user_uf() to authenticated;
grant execute on function app_private.can_current_user_access_loja(uuid) to authenticated;
grant execute on function app_private.can_current_user_access_process(uuid) to authenticated;
grant execute on function app_private.can_current_user_access_product(uuid) to authenticated;

drop policy if exists usuarios_select_self_or_gerencial on public.usuarios;
drop policy if exists usuarios_insert_gerencial on public.usuarios;
drop policy if exists usuarios_update_gerencial on public.usuarios;
drop policy if exists usuarios_delete_gerencial on public.usuarios;
drop policy if exists usuarios_select_supervisor_scope on public.usuarios;
drop policy if exists usuarios_insert_manager_scope on public.usuarios;
drop policy if exists usuarios_update_manager_scope on public.usuarios;
drop policy if exists usuarios_delete_manager_scope on public.usuarios;

create policy usuarios_select_supervisor_scope
on public.usuarios
for select
to authenticated
using (
  (
    auth_user_id = (select auth.uid())
    and ativo is true
    and acesso_habilitado is true
  )
  or (
    (select app_private.is_current_user_manager_ativo())
    and (
      exists (
        select 1
        from public.usuarios as caller
        where caller.auth_user_id = (select auth.uid())
          and caller.perfil = 'Gerencial'
      )
      or (
        perfil in ('Promotor', 'Entregador')
        and estado = (select app_private.current_user_uf())
      )
    )
  )
);

create policy usuarios_insert_manager_scope
on public.usuarios
for insert
to authenticated
with check (
  (select app_private.is_current_user_manager_ativo())
  and (
    exists (
      select 1
      from public.usuarios as caller
      where caller.auth_user_id = (select auth.uid())
        and caller.perfil = 'Gerencial'
    )
    or (
      perfil in ('Promotor', 'Entregador')
      and estado = (select app_private.current_user_uf())
    )
  )
);

create policy usuarios_update_manager_scope
on public.usuarios
for update
to authenticated
using (
  (select app_private.is_current_user_manager_ativo())
  and (
    exists (
      select 1
      from public.usuarios as caller
      where caller.auth_user_id = (select auth.uid())
        and caller.perfil = 'Gerencial'
    )
    or (
      perfil in ('Promotor', 'Entregador')
      and estado = (select app_private.current_user_uf())
    )
  )
)
with check (
  (select app_private.is_current_user_manager_ativo())
  and (
    exists (
      select 1
      from public.usuarios as caller
      where caller.auth_user_id = (select auth.uid())
        and caller.perfil = 'Gerencial'
    )
    or (
      perfil in ('Promotor', 'Entregador')
      and estado = (select app_private.current_user_uf())
    )
  )
);

create policy usuarios_delete_manager_scope
on public.usuarios
for delete
to authenticated
using (
  exists (
    select 1
    from public.usuarios as caller
    where caller.auth_user_id = (select auth.uid())
      and caller.perfil = 'Gerencial'
      and caller.ativo is true
      and caller.acesso_habilitado is true
  )
);

drop policy if exists lojas_select_gerencial_or_promotor_assigned on public.lojas;
drop policy if exists lojas_insert_gerencial on public.lojas;
drop policy if exists lojas_update_gerencial on public.lojas;
drop policy if exists lojas_delete_gerencial on public.lojas;
drop policy if exists lojas_select_manager_scope on public.lojas;
drop policy if exists lojas_insert_manager_scope on public.lojas;
drop policy if exists lojas_update_manager_scope on public.lojas;
drop policy if exists lojas_delete_manager_scope on public.lojas;

create policy lojas_select_manager_scope
on public.lojas
for select
to authenticated
using (
  (select app_private.can_current_user_access_loja(id))
  or exists (
    select 1
    from public.loja_promotores as lp
    join public.usuarios as u on u.id = lp.promotor_id
    where lp.loja_id = public.lojas.id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

create policy lojas_insert_manager_scope
on public.lojas
for insert
to authenticated
with check (
  uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL', 'TO')
  and (
    exists (
      select 1
      from public.usuarios as caller
      where caller.auth_user_id = (select auth.uid())
        and caller.perfil = 'Gerencial'
        and caller.ativo is true
        and caller.acesso_habilitado is true
    )
    or uf = (select app_private.current_user_uf())
  )
);

create policy lojas_update_manager_scope
on public.lojas
for update
to authenticated
using ((select app_private.can_current_user_access_loja(id)))
with check (
  (select app_private.can_current_user_access_loja(id))
  and uf in ('CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL', 'TO')
);

create policy lojas_delete_manager_scope
on public.lojas
for delete
to authenticated
using ((select app_private.can_current_user_access_loja(id)));

drop policy if exists loja_promotores_select_gerencial_or_own on public.loja_promotores;
drop policy if exists loja_promotores_insert_gerencial on public.loja_promotores;
drop policy if exists loja_promotores_update_gerencial on public.loja_promotores;
drop policy if exists loja_promotores_delete_gerencial on public.loja_promotores;
drop policy if exists loja_promotores_select_manager_scope on public.loja_promotores;
drop policy if exists loja_promotores_insert_manager_scope on public.loja_promotores;
drop policy if exists loja_promotores_update_manager_scope on public.loja_promotores;
drop policy if exists loja_promotores_delete_manager_scope on public.loja_promotores;

create policy loja_promotores_select_manager_scope
on public.loja_promotores
for select
to authenticated
using (
  (select app_private.can_current_user_access_loja(loja_id))
  or exists (
    select 1
    from public.usuarios as u
    where u.id = public.loja_promotores.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

create policy loja_promotores_insert_manager_scope
on public.loja_promotores
for insert
to authenticated
with check (
  (select app_private.can_current_user_access_loja(loja_id))
  and (
    promotor_id is null
    or exists (
      select 1
      from public.usuarios as u
      join public.lojas as l on l.id = loja_promotores.loja_id
      where u.id = loja_promotores.promotor_id
        and u.perfil = 'Promotor'
        and (
          exists (
            select 1
            from public.usuarios as caller
            where caller.auth_user_id = (select auth.uid())
              and caller.perfil = 'Gerencial'
          )
          or u.estado = l.uf
        )
    )
  )
);

create policy loja_promotores_update_manager_scope
on public.loja_promotores
for update
to authenticated
using ((select app_private.can_current_user_access_loja(loja_id)))
with check (
  (select app_private.can_current_user_access_loja(loja_id))
  and (
    promotor_id is null
    or exists (
      select 1
      from public.usuarios as u
      join public.lojas as l on l.id = loja_promotores.loja_id
      where u.id = loja_promotores.promotor_id
        and u.perfil = 'Promotor'
        and (
          exists (
            select 1
            from public.usuarios as caller
            where caller.auth_user_id = (select auth.uid())
              and caller.perfil = 'Gerencial'
          )
          or u.estado = l.uf
        )
    )
  )
);

create policy loja_promotores_delete_manager_scope
on public.loja_promotores
for delete
to authenticated
using ((select app_private.can_current_user_access_loja(loja_id)));

drop policy if exists nfd_itens_select_gerencial_or_assigned_promotor on public.nfd_itens;
create policy nfd_itens_select_manager_or_assigned_promotor
on public.nfd_itens
for select
to authenticated
using (
  (select app_private.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.usuarios as supervisor
    left join public.lojas as l
      on l.codigo = public.nfd_itens.codigo_cliente::text
    where supervisor.auth_user_id = (select auth.uid())
      and supervisor.perfil = 'Supervisor'
      and supervisor.ativo is true
      and supervisor.acesso_habilitado is true
      and upper(coalesce(nullif(btrim(public.nfd_itens.uf), ''), l.uf)) = upper(supervisor.estado)
  )
  or exists (
    select 1
    from public.lojas as l
    join public.loja_promotores as lp on lp.loja_id = l.id
    join public.usuarios as u on u.id = lp.promotor_id
    where l.codigo = public.nfd_itens.codigo_cliente::text
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists produtos_select_authenticated on public.produtos;
create policy produtos_select_authenticated
on public.produtos
for select
to authenticated
using (
  (
    status is true
    and exists (
      select 1
      from public.usuarios as u
      where u.auth_user_id = (select auth.uid())
        and u.ativo is true
        and u.acesso_habilitado is true
    )
  )
  or (select app_private.is_current_user_manager_ativo())
);

drop policy if exists fstd_processos_select_gerencial_or_own on public.fstd_processos;
create policy fstd_processos_select_manager_or_own
on public.fstd_processos
for select
to authenticated
using (
  (select app_private.can_current_user_access_loja(loja_id))
  or exists (
    select 1
    from public.usuarios as u
    where u.id = public.fstd_processos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists fstd_produtos_select_gerencial_or_own on public.fstd_produtos;
create policy fstd_produtos_select_manager_or_own
on public.fstd_produtos
for select
to authenticated
using (
  (select app_private.can_current_user_access_product(id))
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = public.fstd_produtos.processo_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists fstd_produto_motivos_select_gerencial_or_own on public.fstd_produto_motivos;
create policy fstd_produto_motivos_select_manager_or_own
on public.fstd_produto_motivos
for select
to authenticated
using (
  (select app_private.can_current_user_access_product(produto_id))
  or exists (
    select 1
    from public.fstd_produtos as fp
    join public.fstd_processos as p on p.id = fp.processo_id
    join public.usuarios as u on u.id = p.promotor_id
    where fp.id = public.fstd_produto_motivos.produto_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists nfd_desconhecimentos_select_gerencial_or_own on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_select_manager_or_own
on public.nfd_desconhecimentos
for select
to authenticated
using (
  (select app_private.can_current_user_access_loja(loja_id))
  or exists (
    select 1
    from public.usuarios as u
    where u.id = public.nfd_desconhecimentos.promotor_id
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists motivos_select_authenticated on public.motivos_devolucao;
create policy motivos_select_authenticated
on public.motivos_devolucao
for select
to authenticated
using (
  ativo is true
  or (select app_private.is_current_user_manager_ativo())
);

drop policy if exists fstd_documentos_select_authorized on public.fstd_documentos;
create policy fstd_documentos_select_authorized
on public.fstd_documentos
for select
to authenticated
using (
  (select app_private.can_current_user_access_process(processo_id))
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = public.fstd_documentos.processo_id
      and u.auth_user_id = (select auth.uid())
      and u.ativo is true
  )
);

-- Manager RPCs were originally Gerencial-only. Extend them to Supervisors,
-- while keeping every manager branch tied to the requested store/process.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.iniciar_fstd_produtos_v2(uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    E'public.is_current_user_gerencial_ativo()\n        and v_processo.loja_id',
    E'app_private.can_current_user_access_loja(v_processo.loja_id)\n        and v_processo.loja_id'
  );
  v_definition := replace(v_definition, 'public.is_current_user_gerencial_ativo()', 'app_private.can_current_user_access_loja(l.id)');
  v_definition := replace(v_definition, 'u.perfil in (''Promotor'', ''Gerencial'')', 'u.perfil in (''Promotor'', ''Gerencial'', ''Supervisor'')');
  execute v_definition;

  select pg_get_functiondef('public.concluir_fstd_produto(uuid,jsonb,text,jsonb)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, 'public.is_current_user_gerencial_ativo()', 'app_private.can_current_user_access_product(p_produto_id)');
  v_definition := replace(v_definition, 'u.perfil in (''Promotor'', ''Gerencial'')', 'u.perfil in (''Promotor'', ''Gerencial'', ''Supervisor'')');
  execute v_definition;

  select pg_get_functiondef('public.editar_fstd_produto(uuid,jsonb,integer,integer,text,jsonb)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, 'public.is_current_user_gerencial_ativo()', 'app_private.can_current_user_access_product(p_produto_id)');
  v_definition := replace(v_definition, 'u.perfil in (''Promotor'', ''Gerencial'')', 'u.perfil in (''Promotor'', ''Gerencial'', ''Supervisor'')');
  execute v_definition;

  select pg_get_functiondef('public.finalizar_fstd_produtos(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, 'public.is_current_user_gerencial_ativo()', 'app_private.can_current_user_access_process(p_processo_id)');
  v_definition := replace(v_definition, 'u.perfil in (''Promotor'', ''Gerencial'')', 'u.perfil in (''Promotor'', ''Gerencial'', ''Supervisor'')');
  execute v_definition;

  select pg_get_functiondef('public.iniciar_fstd_avulsa(uuid,text,numeric,date,jsonb)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, 'u.perfil = ''Promotor''', 'u.perfil in (''Promotor'', ''Supervisor'')');
  v_definition := replace(v_definition, E'if not exists (\n    select 1\n    from public.loja_promotores as lp\n    where lp.loja_id = p_loja_id\n      and lp.promotor_id = v_promotor_id\n  ) then', E'if not app_private.can_current_user_access_loja(p_loja_id) and not exists (\n    select 1\n    from public.loja_promotores as lp\n    where lp.loja_id = p_loja_id\n      and lp.promotor_id = v_promotor_id\n  ) then');
  execute v_definition;

  select pg_get_functiondef('public.concluir_fstd_produto_avulso(uuid,jsonb,integer,integer,text,jsonb)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, 'u.perfil = ''Promotor''', 'u.perfil in (''Promotor'', ''Supervisor'')');
  v_definition := replace(v_definition, E'and exists (\n      select 1\n      from public.loja_promotores as lp\n      where lp.loja_id = p.loja_id\n        and lp.promotor_id = v_promotor_id\n    )', E'and (app_private.can_current_user_access_loja(p.loja_id) or exists (\n      select 1\n      from public.loja_promotores as lp\n      where lp.loja_id = p.loja_id\n        and lp.promotor_id = v_promotor_id\n    ))');
  execute v_definition;
end;
$migration$;

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
  v_manager_id uuid;
  v_result public.nfd_desconhecimentos;
begin
  select u.id into v_manager_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil in ('Gerencial', 'Supervisor')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_manager_id is null or not app_private.can_current_user_access_loja(p_loja_id) then
    raise exception 'Usuário Gerencial ou Supervisor ativo sem acesso a esta UF.';
  end if;

  if p_loja_id is null
    or nullif(btrim(coalesce(p_nfd_referencia, '')), '') is null
    or nullif(btrim(coalesce(p_nfd_numero, '')), '') is null then
    raise exception 'Loja e identificação da NFD são obrigatórias.';
  end if;

  insert into public.nfd_desconhecimentos (
    loja_id, promotor_id, nfd_referencia, nfd_chave_acesso,
    nfd_numero, loja_codigo, comentario
  )
  values (
    p_loja_id, v_manager_id, btrim(p_nfd_referencia),
    nullif(btrim(p_nfd_chave_acesso), ''), btrim(p_nfd_numero),
    nullif(btrim(p_loja_codigo), ''),
    coalesce(nullif(btrim(p_comentario), ''), 'NFD marcada como desconhecida pelo usuário Gerencial.')
  )
  returning * into v_result;

  return v_result;
end;
$function$;

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
  v_manager_id uuid;
  v_updated integer;
begin
  select u.id into v_manager_id
  from public.usuarios as u
  where u.auth_user_id = (select auth.uid())
    and u.perfil in ('Gerencial', 'Supervisor')
    and u.ativo is true
    and u.acesso_habilitado is true
  limit 1;

  if v_manager_id is null then
    raise exception 'Usuário Gerencial ou Supervisor ativo não encontrado.';
  end if;

  if nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is null
    and nullif(btrim(coalesce(p_nfd_referencia, '')), '') is null then
    raise exception 'Informe a chave de acesso ou a referência da NFD.';
  end if;

  update public.nfd_desconhecimentos as nd
  set reconhecida_em = now(), reconhecida_por = v_manager_id
  where nd.reconhecida_em is null
    and app_private.can_current_user_access_loja(nd.loja_id)
    and (
      (nullif(btrim(coalesce(p_nfd_chave_acesso, '')), '') is not null
        and nd.nfd_chave_acesso = btrim(p_nfd_chave_acesso))
      or (nullif(btrim(coalesce(p_nfd_referencia, '')), '') is not null
        and nd.nfd_referencia = btrim(p_nfd_referencia))
    )
    and (nullif(btrim(coalesce(p_nfd_numero, '')), '') is null
      or nd.nfd_numero = btrim(p_nfd_numero));

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Nenhuma marcação desconhecida ativa foi encontrada para esta NFD.';
  end if;

  return v_updated;
end;
$function$;

drop policy if exists fstd_fotos_select_own_or_gerencial on storage.objects;
create policy fstd_fotos_select_own_or_manager on storage.objects
for select to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.fstd_processos as p
      where p.id::text = (storage.foldername(name))[2]
        and app_private.can_current_user_access_loja(p.loja_id)
    )
  )
);

drop policy if exists fstd_fotos_insert_own on storage.objects;
create policy fstd_fotos_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.fstd_processos as p
    where p.id::text = (storage.foldername(name))[2]
      and app_private.can_current_user_access_loja(p.loja_id)
      and p.status in ('em_andamento', 'concluida')
  )
);

drop policy if exists fstd_fotos_delete_own on storage.objects;
create policy fstd_fotos_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.fstd_processos as p
    where p.id::text = (storage.foldername(name))[2]
      and app_private.can_current_user_access_loja(p.loja_id)
      and p.status in ('em_andamento', 'concluida')
  )
);

-- Apply the same UF scope to the private FSTD PDF bucket.
drop policy if exists fstd_pdfs_select_authorized on storage.objects;
create policy fstd_pdfs_select_authorized on storage.objects
for select to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and exists (
    select 1
    from public.fstd_documentos as d
    join public.fstd_processos as p on p.id = d.processo_id
    where d.pdf_path = storage.objects.name
      and app_private.can_current_user_access_loja(p.loja_id)
  )
);

drop policy if exists fstd_pdfs_insert_authorized on storage.objects;
create policy fstd_pdfs_insert_authorized on storage.objects
for insert to authenticated
with check (
  bucket_id = 'fstd-pdfs'
  and exists (
    select 1
    from public.fstd_processos as p
    where p.id = split_part(storage.objects.name, '/', 2)::uuid
      and p.status = 'concluida'
      and app_private.can_current_user_access_loja(p.loja_id)
  )
);

drop policy if exists fstd_pdfs_update_authorized on storage.objects;
create policy fstd_pdfs_update_authorized on storage.objects
for update to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and exists (
    select 1
    from public.fstd_documentos as d
    join public.fstd_processos as p on p.id = d.processo_id
    where d.pdf_path = storage.objects.name
      and app_private.can_current_user_access_loja(p.loja_id)
  )
)
with check (
  bucket_id = 'fstd-pdfs'
  and exists (
    select 1
    from public.fstd_documentos as d
    join public.fstd_processos as p on p.id = d.processo_id
    where d.pdf_path = storage.objects.name
      and app_private.can_current_user_access_loja(p.loja_id)
  )
);

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_or_create_fstd_document(uuid)'::regprocedure) into v_definition;
  v_definition := replace(v_definition, 'app_private.is_current_user_gerencial_ativo()', 'app_private.can_current_user_access_process(p_processo_id)');
  execute v_definition;

  select pg_get_functiondef('public.set_fstd_document_pdf(uuid,text,jsonb)'::regprocedure) into v_definition;
  v_definition := replace(v_definition, 'app_private.is_current_user_gerencial_ativo()', 'app_private.can_current_user_access_process(d.processo_id)');
  execute v_definition;
end;
$migration$;

notify pgrst, 'reload schema';
