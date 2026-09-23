-- Estrutura da biblioteca Nook. Executar uma vez no SQL Editor do Supabase.
-- Compatível com o schema anterior: preserva books, reading_progress e Storage.
begin;

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

create index if not exists series_owner_idx on public.series(owner_id);
create index if not exists volumes_owner_series_order_idx on public.volumes(owner_id, series_id, sort_order, volume_number);
create index if not exists books_owner_series_order_idx on public.books(owner_id, series_id, sort_order, chapter_number);
create index if not exists books_owner_volume_order_idx on public.books(owner_id, volume_id, sort_order, chapter_number);

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

-- Mantém as restrições anteriores de propriedade e caminho, validando também
-- que as relações opcionais apontem para registros do mesmo usuário.
drop policy if exists "Owner inserts books" on public.books;
create policy "Owner inserts books" on public.books for insert to authenticated
  with check (public.is_private_owner() and owner_id = (select auth.uid())
    and file_path like owner_id::text || '/%.pdf'
    and (series_id is null or exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid())))
    and (volume_id is null or exists (select 1 from public.volumes v where v.id = volume_id and v.owner_id = (select auth.uid()) and v.series_id is not distinct from series_id)));
drop policy if exists "Owner updates books" on public.books;
create policy "Owner updates books" on public.books for update to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()))
  with check (public.is_private_owner() and owner_id = (select auth.uid())
    and (series_id is null or exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid())))
    and (volume_id is null or exists (select 1 from public.volumes v where v.id = volume_id and v.owner_id = (select auth.uid()) and v.series_id is not distinct from series_id)));

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('covers', 'covers', false, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;
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

commit;
