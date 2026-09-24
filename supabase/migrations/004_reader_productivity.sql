-- Aplicar manualmente após backup. Nenhum registro ou arquivo existente é removido.
begin;

alter table public.series add column if not exists is_favorite boolean not null default false;

create table if not exists public.reading_bookmarks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  line_index integer not null default 0 check (line_index >= 0),
  scroll_ratio double precision not null default 0 check (scroll_ratio between 0 and 1),
  label text check (label is null or length(label) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists reading_bookmarks_owner_book_idx on public.reading_bookmarks(owner_id, book_id, created_at desc);
alter table public.reading_bookmarks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reading_bookmarks' and policyname = 'Owner reads bookmarks') then
    create policy "Owner reads bookmarks" on public.reading_bookmarks for select to authenticated
      using (public.is_private_owner() and owner_id = (select auth.uid())
        and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reading_bookmarks' and policyname = 'Owner inserts bookmarks') then
    create policy "Owner inserts bookmarks" on public.reading_bookmarks for insert to authenticated
      with check (public.is_private_owner() and owner_id = (select auth.uid())
        and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reading_bookmarks' and policyname = 'Owner updates bookmarks') then
    create policy "Owner updates bookmarks" on public.reading_bookmarks for update to authenticated
      using (public.is_private_owner() and owner_id = (select auth.uid())
        and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid())))
      with check (public.is_private_owner() and owner_id = (select auth.uid())
        and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reading_bookmarks' and policyname = 'Owner deletes bookmarks') then
    create policy "Owner deletes bookmarks" on public.reading_bookmarks for delete to authenticated
      using (public.is_private_owner() and owner_id = (select auth.uid())
        and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid())));
  end if;
end $$;

commit;
