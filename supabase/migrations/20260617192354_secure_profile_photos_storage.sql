update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id='profile-photos';

drop policy if exists profile_photos_authenticated_insert on storage.objects;
drop policy if exists profile_photos_authenticated_select on storage.objects;
drop policy if exists profile_photos_authenticated_update on storage.objects;

create policy profile_photos_user_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy profile_photos_user_select
on storage.objects
for select
to authenticated
using (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy profile_photos_user_update
on storage.objects
for update
to authenticated
using (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy profile_photos_user_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);;
