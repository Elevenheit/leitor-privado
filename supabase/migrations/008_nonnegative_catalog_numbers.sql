-- Chapter and volume zero are valid; negative catalog numbers are not.
begin;

alter table public.books
  add constraint books_chapter_number_nonnegative
  check (chapter_number is null or chapter_number >= 0);

alter table public.volumes
  add constraint volumes_volume_number_nonnegative
  check (volume_number is null or volume_number >= 0);

commit;
