-- O fluxo Gerencial usa o mesmo bucket privado de fotos do Promotor.
-- O caminho continua vinculado ao auth.uid() e ao processo pertencente ao
-- usuario autenticado; Gerenciais podem atuar em processos em andamento e,
-- exclusivamente para edicao, em processos concluidos.
drop policy if exists fstd_fotos_insert_own on storage.objects;
create policy fstd_fotos_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.usuarios as u
    join public.fstd_processos as p
      on p.promotor_id = u.id
    where u.auth_user_id = (select auth.uid())
      and u.perfil in ('Promotor', 'Gerencial')
      and u.ativo is true
      and u.acesso_habilitado is true
      and p.id::text = (storage.foldername(storage.objects.name))[2]
      and (
        (u.perfil = 'Promotor' and p.status = 'em_andamento')
        or (
          u.perfil = 'Gerencial'
          and p.status in ('em_andamento', 'concluida')
        )
      )
  )
);

drop policy if exists fstd_fotos_delete_own on storage.objects;
create policy fstd_fotos_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.usuarios as u
    join public.fstd_processos as p
      on p.promotor_id = u.id
    where u.auth_user_id = (select auth.uid())
      and u.perfil in ('Promotor', 'Gerencial')
      and u.ativo is true
      and u.acesso_habilitado is true
      and p.id::text = (storage.foldername(storage.objects.name))[2]
      and (
        (u.perfil = 'Promotor' and p.status = 'em_andamento')
        or (
          u.perfil = 'Gerencial'
          and p.status in ('em_andamento', 'concluida')
        )
      )
  )
);
