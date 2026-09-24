-- 1. Crie seu usuário em Authentication > Users no painel Supabase.
-- 2. Substitua o UUID abaixo pelo User UID dessa conta antes de executar.
-- 3. Execute este arquivo inteiro no SQL Editor do seu projeto.

create or replace function public.is_private_owner()
returns boolean
language sql
stable
as $$
  select (select auth.uid()) = '43caebf0-0851-4939-978d-196aa05e80f2'::uuid;
$$;

revoke all on function public.is_private_owner() from public;
grant execute on function public.is_private_owner() to authenticated;

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 300),
  original_filename text not null,
  file_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0),
  total_pages integer check (total_pages > 0),
  created_at timestamptz not null default now(),
  series_id uuid,
  volume_id uuid,
  chapter_number numeric,
  chapter_title text,
  sort_order integer not null default 0
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.volumes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  volume_number numeric,
  title text,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.books add column if not exists series_id uuid references public.series(id) on delete set null;
alter table public.books add column if not exists volume_id uuid references public.volumes(id) on delete set null;
alter table public.books add column if not exists chapter_number numeric;
alter table public.books add column if not exists chapter_title text;
alter table public.books add column if not exists sort_order integer not null default 0;
alter table public.books add column if not exists content_type text not null default 'chapter' check (content_type in ('chapter','volume'));
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'books_series_id_fkey' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_series_id_fkey foreign key (series_id) references public.series(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'books_volume_id_fkey' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_volume_id_fkey foreign key (volume_id) references public.volumes(id) on delete set null;
  end if;
end $$;

create table if not exists public.reading_progress (
  book_id uuid primary key references public.books(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_number integer not null default 1 check (page_number > 0),
  line_index integer not null default 0 check (line_index >= 0),
  scroll_ratio double precision not null default 0 check (scroll_ratio between 0 and 1),
  reading_mode text not null default 'text' check (reading_mode in ('text', 'page')),
  updated_at timestamptz not null default now()
);

create index if not exists books_owner_created_idx on public.books(owner_id, created_at desc);
create index if not exists progress_owner_idx on public.reading_progress(owner_id);
create index if not exists series_owner_idx on public.series(owner_id);
create index if not exists volumes_owner_series_order_idx on public.volumes(owner_id, series_id, sort_order, volume_number);
create index if not exists books_owner_series_order_idx on public.books(owner_id, series_id, sort_order, chapter_number);
create index if not exists books_owner_volume_order_idx on public.books(owner_id, volume_id, sort_order, chapter_number);

alter table public.books enable row level security;
alter table public.reading_progress enable row level security;
alter table public.series enable row level security;
alter table public.volumes enable row level security;

drop policy if exists "Owner manages series" on public.series;
create policy "Owner manages series" on public.series for all to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()))
  with check (public.is_private_owner() and owner_id = (select auth.uid()));
drop policy if exists "Owner manages volumes" on public.volumes;
create policy "Owner manages volumes" on public.volumes for all to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid())
    and exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid())))
  with check (public.is_private_owner() and owner_id = (select auth.uid())
    and exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid())));

drop policy if exists "Owner reads books" on public.books;
drop policy if exists "Owner inserts books" on public.books;
drop policy if exists "Owner updates books" on public.books;
drop policy if exists "Owner deletes books" on public.books;
create policy "Owner reads books" on public.books for select to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()));
create policy "Owner inserts books" on public.books for insert to authenticated
  with check (public.is_private_owner() and owner_id = (select auth.uid()) and file_path like owner_id::text || '/%.pdf'
    and (series_id is null or exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid())))
    and (volume_id is null or exists (select 1 from public.volumes v where v.id = volume_id and v.owner_id = (select auth.uid()) and v.series_id is not distinct from series_id)));
create policy "Owner updates books" on public.books for update to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()))
  with check (public.is_private_owner() and owner_id = (select auth.uid())
    and (series_id is null or exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid())))
    and (volume_id is null or exists (select 1 from public.volumes v where v.id = volume_id and v.owner_id = (select auth.uid()) and v.series_id is not distinct from series_id)));
create policy "Owner deletes books" on public.books for delete to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()));

drop policy if exists "Owner reads progress" on public.reading_progress;
drop policy if exists "Owner inserts progress" on public.reading_progress;
drop policy if exists "Owner updates progress" on public.reading_progress;
create policy "Owner reads progress" on public.reading_progress for select to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()));
create policy "Owner inserts progress" on public.reading_progress for insert to authenticated
  with check (public.is_private_owner() and owner_id = (select auth.uid())
    and exists (select 1 from public.books where id = book_id and owner_id = (select auth.uid())));
create policy "Owner updates progress" on public.reading_progress for update to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()))
  with check (public.is_private_owner() and owner_id = (select auth.uid())
    and exists (select 1 from public.books where id = book_id and owner_id = (select auth.uid())));

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('novels', 'novels', false, array['application/pdf'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('covers', 'covers', false, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner reads PDFs" on storage.objects;
drop policy if exists "Owner uploads PDFs" on storage.objects;
drop policy if exists "Owner deletes PDFs" on storage.objects;
create policy "Owner reads PDFs" on storage.objects for select to authenticated
  using (bucket_id = 'novels' and public.is_private_owner()
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owner uploads PDFs" on storage.objects for insert to authenticated
  with check (bucket_id = 'novels' and public.is_private_owner()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) = 'pdf');
create policy "Owner deletes PDFs" on storage.objects for delete to authenticated
  using (bucket_id = 'novels' and public.is_private_owner()
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner reads covers" on storage.objects;
create policy "Owner reads covers" on storage.objects for select to authenticated
  using (bucket_id = 'covers' and public.is_private_owner() and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owner uploads covers" on storage.objects;
create policy "Owner uploads covers" on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and public.is_private_owner() and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg','jpeg','png','webp'));
drop policy if exists "Owner updates covers" on storage.objects;
create policy "Owner updates covers" on storage.objects for update to authenticated
  using (bucket_id = 'covers' and public.is_private_owner() and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'covers' and public.is_private_owner() and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg','jpeg','png','webp'));
drop policy if exists "Owner deletes covers" on storage.objects;
create policy "Owner deletes covers" on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and public.is_private_owner() and (storage.foldername(name))[1] = (select auth.uid())::text);
