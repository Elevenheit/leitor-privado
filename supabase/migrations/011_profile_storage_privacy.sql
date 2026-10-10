begin;
drop policy if exists profile_image_read on storage.objects;
create policy profile_image_read on storage.objects for select to authenticated
using (bucket_id = 'profiles' and public.beta_member() and exists (
  select 1 from public.profile_identities p where p.avatar_path = name
));
-- The owner's existing policy preserves access to their own banner and uploads.
update storage.buckets set file_size_limit = 10485760 where id = 'covers';
commit;
