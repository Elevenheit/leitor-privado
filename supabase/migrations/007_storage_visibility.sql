-- Private media follows the publication state of its catalog entry.
begin;

drop policy if exists beta_media_read on storage.objects;
create policy beta_media_read on storage.objects for select to authenticated
  using (public.beta_member() and (
    (bucket_id = 'novels' and exists (
      select 1 from public.books b
      join public.series s on s.id = b.series_id
      where b.file_path = name and s.beta_visible
    ))
    or (bucket_id = 'covers' and exists (
      select 1 from public.series s
      where s.cover_path = name and s.beta_visible
    ))
  ));

commit;
