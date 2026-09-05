-- Storage is managed by Supabase and is intentionally excluded from the
-- public/app_private pg_dump baseline. Recreate only the application-owned
-- buckets and policies that are present in the homologation snapshot.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('fstd-fotos', 'fstd-fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('fstd-pdfs', 'fstd-pdfs', false, 5242880, array['application/pdf']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_photos_authenticated_insert on storage.objects;
drop policy if exists profile_photos_authenticated_select on storage.objects;
drop policy if exists profile_photos_authenticated_update on storage.objects;
drop policy if exists profile_photos_user_insert on storage.objects;
drop policy if exists profile_photos_user_select on storage.objects;
drop policy if exists profile_photos_user_update on storage.objects;
drop policy if exists profile_photos_user_delete on storage.objects;

create policy profile_photos_user_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_photos_user_select
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_photos_user_update
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_photos_user_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists fstd_fotos_select_own on storage.objects;
drop policy if exists fstd_fotos_select_own_or_gerencial on storage.objects;
drop policy if exists fstd_fotos_insert_own on storage.objects;
drop policy if exists fstd_fotos_delete_own on storage.objects;

create policy fstd_fotos_select_own_or_gerencial
on storage.objects for select to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select app_private.is_current_user_gerencial_ativo())
  )
);

create policy fstd_fotos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.usuarios as u
    join public.fstd_processos as p on p.promotor_id = u.id
    where u.auth_user_id = (select auth.uid())
      and u.perfil in ('Promotor', 'Gerencial')
      and u.ativo is true
      and u.acesso_habilitado is true
      and p.id::text = (storage.foldername(storage.objects.name))[2]
      and (
        (u.perfil = 'Promotor' and p.status = 'em_andamento')
        or (u.perfil = 'Gerencial' and p.status in ('em_andamento', 'concluida'))
      )
  )
);

create policy fstd_fotos_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'fstd-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.usuarios as u
    join public.fstd_processos as p on p.promotor_id = u.id
    where u.auth_user_id = (select auth.uid())
      and u.perfil in ('Promotor', 'Gerencial')
      and u.ativo is true
      and u.acesso_habilitado is true
      and p.id::text = (storage.foldername(storage.objects.name))[2]
      and (
        (u.perfil = 'Promotor' and p.status = 'em_andamento')
        or (u.perfil = 'Gerencial' and p.status in ('em_andamento', 'concluida'))
      )
  )
);

drop policy if exists fstd_pdfs_select_authorized on storage.objects;
drop policy if exists fstd_pdfs_insert_authorized on storage.objects;
drop policy if exists fstd_pdfs_update_authorized on storage.objects;

create policy fstd_pdfs_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and exists (
    select 1
    from public.fstd_documentos as d
    join public.fstd_processos as p on p.id = d.processo_id
    join public.usuarios as u on u.id = p.promotor_id
    where d.pdf_path = storage.objects.name
      and (
        (select app_private.is_current_user_gerencial_ativo())
        or (u.auth_user_id = (select auth.uid()) and u.ativo is true)
      )
  )
);

create policy fstd_pdfs_insert_authorized
on storage.objects for insert to authenticated
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

create policy fstd_pdfs_update_authorized
on storage.objects for update to authenticated
using (
  bucket_id = 'fstd-pdfs'
  and (
    (select app_private.is_current_user_gerencial_ativo())
    or exists (
      select 1
      from public.fstd_documentos as d
      join public.fstd_processos as p on p.id = d.processo_id
      join public.usuarios as u on u.id = p.promotor_id
      where d.pdf_path = storage.objects.name
        and u.auth_user_id = (select auth.uid())
        and u.ativo is true
    )
  )
)
with check (
  bucket_id = 'fstd-pdfs'
  and (
    (select app_private.is_current_user_gerencial_ativo())
    or exists (
      select 1
      from public.fstd_documentos as d
      join public.fstd_processos as p on p.id = d.processo_id
      join public.usuarios as u on u.id = p.promotor_id
      where d.pdf_path = storage.objects.name
        and u.auth_user_id = (select auth.uid())
        and u.ativo is true
    )
  )
);
