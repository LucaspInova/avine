-- Lote 2: acesso ativo, escopo por perfil/UF e integridade das rotas.

create or replace function app_private.is_current_user_active()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo is true
      and u.acesso_habilitado is true
      and app_private.current_user_auth_role() = case u.perfil
        when 'Admin' then 'admin'
        when 'Gerencial' then 'gerencial'
        when 'Promotor' then 'promotor'
        else null
      end
  );
$$;

create or replace function app_private.is_current_user_promotor_ativo()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select app_private.current_user_auth_role() = 'promotor'
    and exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and u.perfil = 'Promotor'
        and cardinality(u.ufs) = 1
        and u.estado = u.ufs[1]
        and u.ativo is true
        and u.acesso_habilitado is true
    );
$$;

create or replace function app_private.can_current_user_read_loja(p_loja_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select app_private.can_current_user_access_loja(p_loja_id)
    or (
      app_private.is_current_user_promotor_ativo()
      and exists (
        select 1
        from public.loja_promotores lp
        join public.usuarios u on u.id = lp.promotor_id
        where lp.loja_id = p_loja_id
          and u.auth_user_id = auth.uid()
          and u.perfil = 'Promotor'
          and u.ativo is true
          and u.acesso_habilitado is true
      )
    );
$$;

create or replace function app_private.can_current_user_read_process(p_processo_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.fstd_processos p
    where p.id = p_processo_id
      and (
        app_private.can_current_user_access_loja(p.loja_id)
        or (
          app_private.is_current_user_promotor_ativo()
          and exists (
            select 1
            from public.usuarios owner
            where owner.id = p.promotor_id
              and owner.auth_user_id = auth.uid()
              and owner.perfil = 'Promotor'
              and owner.ativo is true
              and owner.acesso_habilitado is true
          )
        )
      )
  );
$$;

create or replace function app_private.can_current_user_assign_promotor(
  p_loja_id uuid,
  p_promotor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.lojas l
    join public.usuarios u on u.id = p_promotor_id
    where l.id = p_loja_id
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
      and u.estado = l.uf
      and u.ufs = array[l.uf]
      and app_private.can_current_user_manage_uf(l.uf)
  );
$$;

create or replace function public.validate_loja_promotor_uf()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_loja_uf text;
  v_promotor_uf text;
  v_promotor_ufs text[];
  v_perfil text;
begin
  if new.loja_id is null or new.promotor_id is null then
    raise exception 'Loja e Promotor sao obrigatorios na rota.' using errcode = '23502';
  end if;

  select upper(trim(l.uf))
  into v_loja_uf
  from public.lojas l
  where l.id = new.loja_id;

  select upper(trim(u.estado)), u.ufs, u.perfil
  into v_promotor_uf, v_promotor_ufs, v_perfil
  from public.usuarios u
  where u.id = new.promotor_id;

  if v_perfil is distinct from 'Promotor'
    or v_promotor_uf is distinct from v_loja_uf
    or v_promotor_ufs is distinct from array[v_loja_uf] then
    raise exception 'A rota aceita somente Promotor com a mesma UF da loja.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function app_private.detach_invalid_promotor_routes()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.perfil is distinct from 'Promotor' then
    delete from public.loja_promotores lp where lp.promotor_id = new.id;
  elsif new.estado is distinct from old.estado or new.ufs is distinct from old.ufs then
    delete from public.loja_promotores lp
    using public.lojas l
    where lp.promotor_id = new.id
      and l.id = lp.loja_id
      and upper(trim(l.uf)) is distinct from upper(trim(new.estado));
  end if;

  return new;
end;
$$;

drop trigger if exists detach_invalid_promotor_routes on public.usuarios;
create trigger detach_invalid_promotor_routes
after update of perfil, estado, ufs on public.usuarios
for each row
when (
  old.perfil is distinct from new.perfil
  or old.estado is distinct from new.estado
  or old.ufs is distinct from new.ufs
)
execute function app_private.detach_invalid_promotor_routes();

create or replace function public.record_usuario_access()
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare
  recorded_at timestamptz := clock_timestamp();
begin
  if not app_private.is_current_user_active() then
    raise exception 'Usuario ativo e com acesso habilitado obrigatorio.' using errcode = '42501';
  end if;

  update public.usuarios
  set last_access_at = recorded_at
  where auth_user_id = auth.uid()
    and ativo is true
    and acesso_habilitado is true;

  if not found then
    raise exception 'Usuario cadastrado nao encontrado.' using errcode = '42501';
  end if;

  return recorded_at;
end;
$$;

drop policy if exists fstd_legado_select_authorized on public.fstd_legado;
create policy fstd_legado_select_authorized
on public.fstd_legado
for select
to authenticated
using (
  exists (
    select 1
    from public.lojas l
    where l.codigo = fstd_legado.codigo_loja
      and app_private.can_current_user_read_loja(l.id)
  )
);

drop policy if exists fstd_processos_insert_own_assigned_store on public.fstd_processos;
create policy fstd_processos_insert_own_assigned_store
on public.fstd_processos
for insert
to authenticated
with check (
  app_private.is_current_user_promotor_ativo()
  and exists (
    select 1
    from public.usuarios u
    where u.id = fstd_processos.promotor_id
      and u.auth_user_id = auth.uid()
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
  and exists (
    select 1
    from public.loja_promotores lp
    where lp.loja_id = fstd_processos.loja_id
      and lp.promotor_id = fstd_processos.promotor_id
  )
);

drop policy if exists fstd_processos_select_scoped on public.fstd_processos;
create policy fstd_processos_select_scoped
on public.fstd_processos
for select
to authenticated
using (app_private.can_current_user_read_process(id));

drop policy if exists fstd_processos_update_own on public.fstd_processos;
create policy fstd_processos_update_own
on public.fstd_processos
for update
to authenticated
using (
  app_private.can_current_user_access_process(id)
  or (
    status = 'em_andamento'
    and app_private.is_current_user_promotor_ativo()
    and exists (
      select 1 from public.usuarios u
      where u.id = fstd_processos.promotor_id
        and u.auth_user_id = auth.uid()
        and u.ativo is true
        and u.acesso_habilitado is true
    )
  )
)
with check (
  app_private.can_current_user_access_process(id)
  or (
    status = 'em_andamento'
    and app_private.is_current_user_promotor_ativo()
    and exists (
      select 1 from public.usuarios u
      where u.id = fstd_processos.promotor_id
        and u.auth_user_id = auth.uid()
        and u.ativo is true
        and u.acesso_habilitado is true
    )
  )
);

drop policy if exists fstd_produtos_insert_own on public.fstd_produtos;
create policy fstd_produtos_insert_own
on public.fstd_produtos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fstd_processos p
    join public.usuarios u on u.id = p.promotor_id
    where p.id = fstd_produtos.processo_id
      and p.status = 'em_andamento'
      and u.auth_user_id = auth.uid()
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
      and app_private.is_current_user_promotor_ativo()
  )
);

drop policy if exists fstd_produtos_select_scoped on public.fstd_produtos;
create policy fstd_produtos_select_scoped
on public.fstd_produtos
for select
to authenticated
using (app_private.can_current_user_read_process(processo_id));

drop policy if exists fstd_produtos_update_own on public.fstd_produtos;
create policy fstd_produtos_update_own
on public.fstd_produtos
for update
to authenticated
using (
  app_private.can_current_user_access_process(processo_id)
  or exists (
    select 1
    from public.fstd_processos p
    join public.usuarios u on u.id = p.promotor_id
    where p.id = fstd_produtos.processo_id
      and p.status = 'em_andamento'
      and u.auth_user_id = auth.uid()
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
      and app_private.is_current_user_promotor_ativo()
  )
)
with check (
  app_private.can_current_user_access_process(processo_id)
  or exists (
    select 1
    from public.fstd_processos p
    join public.usuarios u on u.id = p.promotor_id
    where p.id = fstd_produtos.processo_id
      and p.status = 'em_andamento'
      and u.auth_user_id = auth.uid()
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
      and app_private.is_current_user_promotor_ativo()
  )
);

drop policy if exists fstd_produto_motivos_insert_own on public.fstd_produto_motivos;
create policy fstd_produto_motivos_insert_own
on public.fstd_produto_motivos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fstd_produtos fp
    join public.fstd_processos p on p.id = fp.processo_id
    join public.usuarios u on u.id = p.promotor_id
    where fp.id = fstd_produto_motivos.produto_id
      and p.status = 'em_andamento'
      and u.auth_user_id = auth.uid()
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
      and app_private.is_current_user_promotor_ativo()
  )
);

drop policy if exists fstd_produto_motivos_delete_own on public.fstd_produto_motivos;
create policy fstd_produto_motivos_delete_own
on public.fstd_produto_motivos
for delete
to authenticated
using (
  exists (
    select 1
    from public.fstd_produtos fp
    join public.fstd_processos p on p.id = fp.processo_id
    join public.usuarios u on u.id = p.promotor_id
    where fp.id = fstd_produto_motivos.produto_id
      and p.status = 'em_andamento'
      and u.auth_user_id = auth.uid()
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
      and app_private.is_current_user_promotor_ativo()
  )
);

drop policy if exists fstd_produto_motivos_select_scoped on public.fstd_produto_motivos;
create policy fstd_produto_motivos_select_scoped
on public.fstd_produto_motivos
for select
to authenticated
using (
  exists (
    select 1
    from public.fstd_produtos fp
    where fp.id = fstd_produto_motivos.produto_id
      and app_private.can_current_user_read_process(fp.processo_id)
  )
);

drop policy if exists nfd_desconhecimentos_insert_current_user_with_store_access on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_insert_current_user_with_store_access
on public.nfd_desconhecimentos
for insert
to authenticated
with check (
  app_private.is_current_user_promotor_ativo()
  and app_private.can_current_user_read_loja(loja_id)
  and exists (
    select 1
    from public.usuarios u
    where u.id = nfd_desconhecimentos.usuario_id
      and u.auth_user_id = auth.uid()
      and u.perfil = 'Promotor'
      and u.ativo is true
      and u.acesso_habilitado is true
  )
);

drop policy if exists nfd_desconhecimentos_select_scoped on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_select_scoped
on public.nfd_desconhecimentos
for select
to authenticated
using (
  app_private.can_current_user_access_loja(loja_id)
  or (
    app_private.is_current_user_promotor_ativo()
    and exists (
      select 1
      from public.usuarios u
      where u.id = nfd_desconhecimentos.usuario_id
        and u.auth_user_id = auth.uid()
        and u.perfil = 'Promotor'
        and u.ativo is true
        and u.acesso_habilitado is true
    )
  )
);

drop policy if exists nfd_itens_select_scoped on public.nfd_itens;
create policy nfd_itens_select_scoped
on public.nfd_itens
for select
to authenticated
using (
  exists (
    select 1
    from public.lojas l
    where l.codigo = nfd_itens.codigo_cliente::text
      and app_private.can_current_user_read_loja(l.id)
  )
);

drop policy if exists lojas_select_authorized on public.lojas;
create policy lojas_select_authorized
on public.lojas
for select
to authenticated
using (app_private.can_current_user_read_loja(id));

drop policy if exists loja_promotores_select_authorized on public.loja_promotores;
create policy loja_promotores_select_authorized
on public.loja_promotores
for select
to authenticated
using (
  app_private.can_current_user_access_loja(loja_id)
  or (
    app_private.is_current_user_promotor_ativo()
    and exists (
      select 1
      from public.usuarios u
      where u.id = loja_promotores.promotor_id
        and u.auth_user_id = auth.uid()
        and u.perfil = 'Promotor'
        and u.ativo is true
        and u.acesso_habilitado is true
    )
  )
);

drop policy if exists usuarios_select_scoped on public.usuarios;
create policy usuarios_select_scoped
on public.usuarios
for select
to authenticated
using (
  (
    auth_user_id = auth.uid()
    and ativo is true
    and acesso_habilitado is true
    and app_private.is_current_user_active()
  )
  or app_private.is_current_user_admin_ativo()
  or (
    app_private.is_current_user_scoped_gerencial_ativo()
    and perfil = 'Promotor'
    and estado = any(app_private.current_user_ufs())
  )
);

comment on column public.usuarios.ativo is
  'Estado operacional do cadastro; false bloqueia imediatamente novas operacoes e preserva o historico.';
comment on column public.usuarios.acesso_habilitado is
  'Gate de acesso da conta; false bloqueia RLS, RPCs e Edge Functions mesmo se ainda existir JWT local.';
comment on function app_private.is_current_user_active() is
  'Valida flags operacionais e coerencia entre perfil publico e role do Auth.';
comment on function app_private.can_current_user_read_loja(uuid) is
  'Admin global, Gerencial por UF e Promotor ativo somente por rota.';
