-- Avoid backslash escaping differences between SQL string literals and the
-- Postgres regex engine. The previous policy rejected valid .pdf paths.
drop policy if exists fstd_pdfs_insert_authorized on storage.objects;
create policy fstd_pdfs_insert_authorized
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fstd-pdfs'
  and (
    (select app_private.is_current_user_gerencial_ativo())
    or (
      name ~ ('^' || (select auth.uid())::text || '/[0-9a-fA-F-]{36}/[0-9]{6,7}[.]pdf$')
      and exists (
        select 1
        from public.fstd_processos as p
        join public.usuarios as u on u.id = p.promotor_id
        where p.id = split_part(storage.objects.name, '/', 2)::uuid
          and p.status = 'concluida'
          and u.auth_user_id = (select auth.uid())
          and u.ativo is true
      )
    )
  )
);
