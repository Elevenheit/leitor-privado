begin;
alter table public.reading_progress add column if not exists page_offset double precision
  check (page_offset >= 0 and page_offset <= 1);
alter table public.reading_progress add column if not exists text_offset integer
  check (text_offset >= 0);
alter table public.reading_bookmarks add column if not exists page_offset double precision
  check (page_offset >= 0 and page_offset <= 1);
alter table public.reading_bookmarks add column if not exists text_offset integer
  check (text_offset >= 0);
-- Nullable anchors preserve legacy rows and retain the existing order guard/RLS.
commit;
