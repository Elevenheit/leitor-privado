-- 1. Crie seu usuário em Authentication > Users no painel Supabase.
-- 2. Substitua o UUID abaixo pelo User UID dessa conta antes de executar.
-- 3. Execute este arquivo inteiro no SQL Editor do seu projeto.

create or replace function public.is_private_owner()
returns boolean
language sql
stable
as $$
  select (select auth.uid()) = '0b42c97b-0c71-48d8-9410-3d0b78fc5bb2'::uuid;
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
  created_at timestamptz not null default now()
);

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

alter table public.books enable row level security;
alter table public.reading_progress enable row level security;

drop policy if exists "Owner reads books" on public.books;
drop policy if exists "Owner inserts books" on public.books;
drop policy if exists "Owner updates books" on public.books;
drop policy if exists "Owner deletes books" on public.books;
create policy "Owner reads books" on public.books for select to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()));
create policy "Owner inserts books" on public.books for insert to authenticated
  with check (public.is_private_owner() and owner_id = (select auth.uid()) and file_path like owner_id::text || '/%.pdf');
create policy "Owner updates books" on public.books for update to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()))
  with check (public.is_private_owner() and owner_id = (select auth.uid()));
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
