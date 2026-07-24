-- Browser clients may read the FSTD workflow, but state changes must only run
-- through the validated RPCs below.
revoke insert, update, delete on table public.fstd_processos from authenticated;
revoke insert, update, delete on table public.fstd_produtos from authenticated;
revoke insert, update, delete on table public.fstd_produto_motivos from authenticated;

alter function public.iniciar_fstd_produtos(uuid, text, text, jsonb) security definer;
alter function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) security definer;
alter function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) security definer;
alter function public.finalizar_fstd_produtos(uuid) security definer;

revoke all on function public.iniciar_fstd_produtos(uuid, text, text, jsonb) from public, anon;
revoke all on function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) from public, anon;
revoke all on function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) from public, anon;
revoke all on function public.finalizar_fstd_produtos(uuid) from public, anon;

grant execute on function public.iniciar_fstd_produtos(uuid, text, text, jsonb) to authenticated;
grant execute on function public.concluir_fstd_produto(uuid, jsonb, text, jsonb) to authenticated;
grant execute on function public.editar_fstd_produto(uuid, jsonb, integer, integer, text, jsonb) to authenticated;
grant execute on function public.finalizar_fstd_produtos(uuid) to authenticated;

-- Keep the workflow protections in RLS as defence in depth in case table
-- write privileges are ever granted again.
drop policy if exists fstd_processos_update_own on public.fstd_processos;
create policy fstd_processos_update_own
on public.fstd_processos
for update
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or (
    status = 'em_andamento'
    and exists (
      select 1
      from public.usuarios as u
      where u.id = public.fstd_processos.promotor_id
        and u.auth_user_id = (select auth.uid())
        and u.perfil = 'Promotor'
        and u.ativo is true
    )
    and exists (
      select 1
      from public.loja_promotores as lp
      where lp.loja_id = public.fstd_processos.loja_id
        and lp.promotor_id = public.fstd_processos.promotor_id
    )
  )
)
with check (
  (select public.is_current_user_gerencial_ativo())
  or (
    status = 'em_andamento'
    and exists (
      select 1
      from public.usuarios as u
      where u.id = public.fstd_processos.promotor_id
        and u.auth_user_id = (select auth.uid())
        and u.perfil = 'Promotor'
        and u.ativo is true
    )
    and exists (
      select 1
      from public.loja_promotores as lp
      where lp.loja_id = public.fstd_processos.loja_id
        and lp.promotor_id = public.fstd_processos.promotor_id
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
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = public.fstd_produtos.processo_id
      and p.status = 'em_andamento'
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

drop policy if exists fstd_produtos_update_own on public.fstd_produtos;
create policy fstd_produtos_update_own
on public.fstd_produtos
for update
to authenticated
using (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = public.fstd_produtos.processo_id
      and p.status = 'em_andamento'
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
)
with check (
  (select public.is_current_user_gerencial_ativo())
  or exists (
    select 1
    from public.fstd_processos as p
    join public.usuarios as u on u.id = p.promotor_id
    where p.id = public.fstd_produtos.processo_id
      and p.status = 'em_andamento'
      and u.auth_user_id = (select auth.uid())
      and u.perfil = 'Promotor'
      and u.ativo is true
  )
);

-- Keep FSTD evidence private and reject files that are not supported images.
update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'fstd-fotos';
