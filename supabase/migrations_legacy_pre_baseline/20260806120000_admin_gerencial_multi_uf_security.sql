begin;

-- The scalar estado remains populated for backwards compatibility.  ufs is the
-- authoritative scope for Gerencial users and is deliberately empty for Admins.
alter table public.usuarios add column if not exists ufs text[] not null default '{}';

update public.usuarios
set ufs = case
  when perfil = 'Admin' then '{}'::text[]
  else array[upper(estado)]
end;

alter table public.usuarios drop constraint if exists usuarios_ufs_scope_check;
alter table public.usuarios add constraint usuarios_ufs_scope_check check (
  ufs <@ array['CE','MA','BA','PA','PB','PI','PE','AP','SE','RN','AL']::text[]
  and (
    (perfil = 'Admin' and cardinality(ufs) = 0)
    or (perfil = 'Gerencial' and cardinality(ufs) >= 1 and estado = ufs[1])
    or (perfil = 'Promotor' and cardinality(ufs) = 1 and estado = ufs[1])
  )
) not valid;
alter table public.usuarios validate constraint usuarios_ufs_scope_check;

create index if not exists usuarios_ufs_gin_idx on public.usuarios using gin (ufs);

-- Authorization always requires agreement between the persisted operational
-- profile and the current JWT. A stale or forged role can therefore only deny,
-- never elevate, access.
create or replace function app_private.current_user_auth_role()
returns text language sql stable security definer set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function app_private.is_current_user_admin_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.current_user_auth_role() = 'admin' and exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.perfil = 'Admin'
      and u.ativo and u.acesso_habilitado
  );
$$;

create or replace function app_private.is_current_user_scoped_gerencial_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.current_user_auth_role() = 'gerencial' and exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.perfil = 'Gerencial'
      and cardinality(u.ufs) > 0 and u.ativo and u.acesso_habilitado
  );
$$;

create or replace function app_private.is_current_user_gerencial_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.is_current_user_admin_ativo()
      or app_private.is_current_user_scoped_gerencial_ativo();
$$;

create or replace function app_private.current_user_ufs()
returns text[] language sql stable security definer set search_path = '' as $$
  select case when app_private.is_current_user_admin_ativo()
    then array['CE','MA','BA','PA','PB','PI','PE','AP','SE','RN','AL','TO']::text[]
    else coalesce((select u.ufs from public.usuarios u
      where u.auth_user_id = auth.uid() and u.perfil = 'Gerencial'
        and u.ativo and u.acesso_habilitado limit 1), '{}'::text[])
  end;
$$;

create or replace function app_private.can_current_user_manage_uf(p_uf text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.is_current_user_admin_ativo()
    or (app_private.is_current_user_scoped_gerencial_ativo()
      and upper(coalesce(p_uf, '')) = any(app_private.current_user_ufs()));
$$;

create or replace function app_private.can_current_user_access_loja(p_loja_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.lojas l where l.id = p_loja_id
    and app_private.can_current_user_manage_uf(l.uf));
$$;

create or replace function app_private.can_current_user_access_process(p_processo_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.fstd_processos p where p.id = p_processo_id
    and app_private.can_current_user_access_loja(p.loja_id));
$$;

create or replace function app_private.can_current_user_access_product(p_produto_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.fstd_produtos fp where fp.id = p_produto_id
    and app_private.can_current_user_access_process(fp.processo_id));
$$;

create or replace function app_private.can_current_user_assign_promotor(p_loja_id uuid, p_promotor_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lojas l join public.usuarios u on u.id = p_promotor_id
    where l.id = p_loja_id and u.perfil = 'Promotor' and u.ativo
      and u.estado = l.uf and u.ufs = array[l.uf]
      and app_private.can_current_user_manage_uf(l.uf)
  );
$$;

revoke all on all functions in schema app_private from public, anon;
grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;

-- Reconcile existing Auth metadata from the operational source of truth.
update auth.users au set raw_app_meta_data = jsonb_set(
  coalesce(au.raw_app_meta_data, '{}'::jsonb), '{role}',
  to_jsonb(case u.perfil when 'Admin' then 'admin' when 'Gerencial' then 'gerencial' else 'promotor' end), true)
from public.usuarios u where u.auth_user_id = au.id
  and au.raw_app_meta_data ->> 'role' is distinct from
    case u.perfil when 'Admin' then 'admin' when 'Gerencial' then 'gerencial' else 'promotor' end;

-- Remove every previous policy from the three central authorization tables;
-- permissive policies compose with OR and would otherwise bypass the scope.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('usuarios','lojas','loja_promotores')
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;

create policy usuarios_select_scoped on public.usuarios for select to authenticated using (
  (auth_user_id = auth.uid() and ativo and acesso_habilitado)
  or app_private.is_current_user_admin_ativo()
  or (app_private.is_current_user_scoped_gerencial_ativo() and perfil = 'Promotor'
      and estado = any(app_private.current_user_ufs()))
);
-- Browser writes are intentionally limited to scoped Promotores. Administrative
-- profile/Auth mutations use manage-users with the service role.
create policy usuarios_insert_scoped_promotor on public.usuarios for insert to authenticated with check (
  app_private.is_current_user_scoped_gerencial_ativo() and perfil = 'Promotor'
  and estado = any(app_private.current_user_ufs()) and ufs = array[estado]
);
create policy usuarios_update_scoped_promotor on public.usuarios for update to authenticated
using (app_private.is_current_user_scoped_gerencial_ativo() and perfil = 'Promotor'
  and estado = any(app_private.current_user_ufs()))
with check (app_private.is_current_user_scoped_gerencial_ativo() and perfil = 'Promotor'
  and estado = any(app_private.current_user_ufs()) and ufs = array[estado]);
create policy usuarios_update_own_presentation on public.usuarios for update to authenticated
using (auth_user_id = auth.uid() and ativo and acesso_habilitado)
with check (auth_user_id = auth.uid() and ativo and acesso_habilitado);

create or replace function public.protect_usuario_own_privileges() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() = old.auth_user_id and (
    new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email
    or new.perfil is distinct from old.perfil or new.estado is distinct from old.estado
    or new.ufs is distinct from old.ufs or new.ativo is distinct from old.ativo
    or new.acesso_habilitado is distinct from old.acesso_habilitado
    or new.fotos_habilitadas is distinct from old.fotos_habilitadas
  ) then
    raise exception 'O usuario nao pode alterar o proprio privilegio ou escopo.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists protect_usuario_own_privileges on public.usuarios;
create trigger protect_usuario_own_privileges before update on public.usuarios
for each row execute function public.protect_usuario_own_privileges();

create policy lojas_select_authorized on public.lojas for select to authenticated using (
  app_private.can_current_user_manage_uf(uf) or exists (
    select 1 from public.loja_promotores lp join public.usuarios u on u.id = lp.promotor_id
    where lp.loja_id = lojas.id and u.auth_user_id = auth.uid() and u.perfil = 'Promotor'
      and u.ativo and u.acesso_habilitado));
create policy lojas_insert_admin on public.lojas for insert to authenticated
with check (app_private.is_current_user_admin_ativo());
create policy lojas_update_admin on public.lojas for update to authenticated
using (app_private.is_current_user_admin_ativo()) with check (app_private.is_current_user_admin_ativo());
create policy lojas_delete_admin on public.lojas for delete to authenticated
using (app_private.is_current_user_admin_ativo());

create policy loja_promotores_select_authorized on public.loja_promotores for select to authenticated using (
  app_private.can_current_user_access_loja(loja_id) or exists(select 1 from public.usuarios u
    where u.id = promotor_id and u.auth_user_id = auth.uid() and u.perfil = 'Promotor'
      and u.ativo and u.acesso_habilitado));
create policy loja_promotores_insert_authorized on public.loja_promotores for insert to authenticated
with check (promotor_id is not null and app_private.can_current_user_assign_promotor(loja_id, promotor_id));
create policy loja_promotores_update_authorized on public.loja_promotores for update to authenticated
using (app_private.can_current_user_access_loja(loja_id))
with check (promotor_id is not null and app_private.can_current_user_assign_promotor(loja_id, promotor_id));
create policy loja_promotores_delete_authorized on public.loja_promotores for delete to authenticated
using (app_private.can_current_user_access_loja(loja_id));

-- Defence in depth also applies to service-role/import writes.
create or replace function public.validate_loja_promotor_uf() returns trigger
language plpgsql set search_path = '' as $$
declare v_loja_uf text; v_promotor_uf text; v_perfil text;
begin
  if new.promotor_id is null then return new; end if;
  select uf into v_loja_uf from public.lojas where id = new.loja_id;
  select estado, perfil into v_promotor_uf, v_perfil from public.usuarios where id = new.promotor_id;
  if v_perfil is distinct from 'Promotor' or v_promotor_uf is distinct from v_loja_uf then
    raise exception 'Promotor e loja devem pertencer a mesma UF.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists validate_loja_promotor_uf on public.loja_promotores;
create trigger validate_loja_promotor_uf before insert or update on public.loja_promotores
for each row execute function public.validate_loja_promotor_uf();

-- Replace broad managerial read policies on store-bound operational records.
drop policy if exists nfd_itens_select_gerencial_or_assigned_promotor on public.nfd_itens;
create policy nfd_itens_select_scoped on public.nfd_itens for select to authenticated using (
  exists(select 1 from public.lojas l where l.codigo = nfd_itens.codigo_cliente::text
    and app_private.can_current_user_access_loja(l.id))
  or exists(select 1 from public.lojas l join public.loja_promotores lp on lp.loja_id=l.id
    join public.usuarios u on u.id=lp.promotor_id where l.codigo=nfd_itens.codigo_cliente::text
      and u.auth_user_id=auth.uid() and u.perfil='Promotor' and u.ativo and u.acesso_habilitado));

drop policy if exists fstd_processos_select_gerencial_or_own on public.fstd_processos;
create policy fstd_processos_select_scoped on public.fstd_processos for select to authenticated using (
  app_private.can_current_user_access_loja(loja_id) or exists(select 1 from public.usuarios u
    where u.id=promotor_id and u.auth_user_id=auth.uid() and u.perfil='Promotor' and u.ativo and u.acesso_habilitado));

drop policy if exists fstd_produtos_select_gerencial_or_own on public.fstd_produtos;
create policy fstd_produtos_select_scoped on public.fstd_produtos for select to authenticated using (
  app_private.can_current_user_access_process(processo_id) or exists(
    select 1 from public.fstd_processos p join public.usuarios u on u.id=p.promotor_id
    where p.id=fstd_produtos.processo_id and u.auth_user_id=auth.uid()
      and u.perfil='Promotor' and u.ativo and u.acesso_habilitado));

drop policy if exists fstd_produto_motivos_select_gerencial_or_own on public.fstd_produto_motivos;
create policy fstd_produto_motivos_select_scoped on public.fstd_produto_motivos for select to authenticated using (
  exists(select 1 from public.fstd_produtos fp where fp.id=fstd_produto_motivos.produto_id
    and app_private.can_current_user_access_process(fp.processo_id))
  or exists(select 1 from public.fstd_produtos fp join public.fstd_processos p on p.id=fp.processo_id
    join public.usuarios u on u.id=p.promotor_id where fp.id=fstd_produto_motivos.produto_id
      and u.auth_user_id=auth.uid() and u.perfil='Promotor' and u.ativo and u.acesso_habilitado));

drop policy if exists fstd_documentos_select_authorized on public.fstd_documentos;
create policy fstd_documentos_select_scoped on public.fstd_documentos for select to authenticated using (
  app_private.can_current_user_access_process(processo_id)
  or exists(select 1 from public.fstd_processos p join public.usuarios u on u.id=p.promotor_id
    where p.id=fstd_documentos.processo_id and u.auth_user_id=auth.uid()
      and u.perfil='Promotor' and u.ativo and u.acesso_habilitado));

drop policy if exists nfd_desconhecimentos_select_gerencial_or_own on public.nfd_desconhecimentos;
create policy nfd_desconhecimentos_select_scoped on public.nfd_desconhecimentos for select to authenticated using (
  app_private.can_current_user_access_loja(loja_id) or exists(select 1 from public.usuarios u
    where u.id=promotor_id and u.auth_user_id=auth.uid() and u.perfil='Promotor' and u.ativo and u.acesso_habilitado));

comment on column public.usuarios.ufs is 'UFs operacionais: vazia para Admin, uma ou mais para Gerencial e exatamente uma para Promotor.';
notify pgrst, 'reload schema';
commit;
