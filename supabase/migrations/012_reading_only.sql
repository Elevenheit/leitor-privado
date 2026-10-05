-- Apply after 011. Keep historical migrations unchanged for existing installations.
begin;

-- Impede a migration de continuar caso ainda existam conteúdos antigos
-- relacionados a anime ou vídeo.
do $$ begin
  if exists (
    select 1
    from public.books
    where media_type = 'video'
  )
  or exists (
    select 1
    from public.series
    where format = 'anime'
  )
  or exists (
    select 1
    from storage.objects
    where bucket_id = 'novels'
      and lower(storage.extension(name)) in ('mp4', 'webm')
  ) then
    raise exception 'Reading-only migration requires a backup and explicit removal of existing anime/video catalog records.';
  end if;
end $$;

-- A partir daqui, obras só podem ser:
-- novel, manga ou manhwa.
alter table public.series
  drop constraint if exists series_format_check;

alter table public.series
  add constraint series_format_check
  check (format in ('novel', 'manga', 'manhwa'));

-- Arquivos de leitura passam a aceitar apenas PDF ou CBZ.
alter table public.books
  drop constraint if exists books_media_type_check;

alter table public.books
  add constraint books_media_type_check
  check (media_type in ('pdf', 'cbz'));

-- Remove campos antigos usados pelo player de vídeo.
alter table public.books
  drop column if exists skip_intro;

alter table public.books
  drop column if exists intro_end;

alter table public.reading_progress
  drop column if exists position_seconds;

-- Guarda quantidade de páginas/imagens da mídia.
alter table public.reading_progress
  add column if not exists page_count integer
  check (page_count > 0);

-- Valida se o arquivo realmente corresponde ao tipo da obra.
create or replace function public.validate_catalog_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f text;
begin

  -- PDF precisa terminar em .pdf e CBZ precisa terminar em .cbz.
  if not (
    (new.media_type = 'pdf' and lower(new.file_path) ~ '\.pdf$')
    or
    (new.media_type = 'cbz' and lower(new.file_path) ~ '\.cbz$')
  ) then
    raise exception 'O arquivo não corresponde ao formato de leitura';
  end if;

  -- O arquivo precisa estar dentro da pasta do próprio usuário.
  if new.file_path not like new.owner_id::text || '/%' then
    raise exception 'O caminho do arquivo não pertence ao proprietário';
  end if;

  -- Garante compatibilidade entre arquivo e tipo da obra.
  if new.series_id is not null then

    select format
    into f
    from public.series
    where id = new.series_id
      and owner_id = new.owner_id;

    if not (
      (new.media_type = 'pdf' and f = 'novel')
      or
      (new.media_type = 'cbz' and f in ('manga', 'manhwa'))
    ) then
      raise exception 'Formato da mídia incompatível com a obra';
    end if;

  end if;

  -- Impede associar capítulo a volume de outra obra ou outro usuário.
  if new.volume_id is not null and not exists (
    select 1
    from public.volumes
    where id = new.volume_id
      and series_id = new.series_id
      and owner_id = new.owner_id
  ) then
    raise exception 'Volume não pertence à obra';
  end if;

  return new;
end;
$$;

-- Impede mudar o formato de uma obra se ela ainda tiver
-- arquivos incompatíveis associados.
create or replace function public.validate_series_format()
returns trigger
language plpgsql
set search_path = ''
as $$
begin

  if new.format <> old.format
     and exists (
       select 1
       from public.books
       where series_id = new.id
         and not (
           (media_type = 'pdf' and new.format = 'novel')
           or
           (media_type = 'cbz' and new.format in ('manga', 'manhwa'))
         )
     )
  then
    raise exception 'Mova as mídias incompatíveis antes de alterar o formato';
  end if;

  return new;
end;
$$;

-- Bucket privado somente para PDF e CBZ.
update storage.buckets
set
  public = false,
  allowed_mime_types = array[
    'application/pdf',
    'application/zip',
    'application/vnd.comicbook+zip'
  ],
  file_size_limit = 524288000
where id = 'novels';

-- Policies do catálogo.
drop policy if exists catalog_write on public.books;
drop policy if exists catalog_write on public.series;
drop policy if exists catalog_write on public.volumes;

create policy catalog_write
on public.series
for all
to authenticated
using (
  public.beta_admin()
  and owner_id = auth.uid()
)
with check (
  public.beta_admin()
  and owner_id = auth.uid()
);

create policy catalog_write
on public.volumes
for all
to authenticated
using (
  public.beta_admin()
  and owner_id = auth.uid()
)
with check (
  public.beta_admin()
  and owner_id = auth.uid()
  and exists (
    select 1
    from public.series s
    where s.id = series_id
      and s.owner_id = auth.uid()
  )
);

create policy catalog_write
on public.books
for all
to authenticated
using (
  public.beta_admin()
  and owner_id = auth.uid()
)
with check (
  public.beta_admin()
  and owner_id = auth.uid()
);

-- Remove policy antiga.
drop policy if exists beta_media_admin on storage.objects;

-- Remove versões anteriores destas policies caso existam.
drop policy if exists beta_media_admin_read on storage.objects;
drop policy if exists beta_media_admin_insert on storage.objects;
drop policy if exists beta_media_admin_update on storage.objects;
drop policy if exists beta_media_admin_delete on storage.objects;

-- Leitura administrativa de arquivos.
create policy beta_media_admin_read
on storage.objects
for select
to authenticated
using (
  public.beta_admin()
  and bucket_id in ('novels', 'covers')
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Upload administrativo.
create policy beta_media_admin_insert
on storage.objects
for insert
to authenticated
with check (
  public.beta_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
  and (
    (
      bucket_id = 'novels'
      and lower(storage.extension(name)) in ('pdf', 'cbz')
    )
    or
    (
      bucket_id = 'covers'
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    )
  )
);

-- Atualização administrativa.
create policy beta_media_admin_update
on storage.objects
for update
to authenticated
using (
  public.beta_admin()
  and bucket_id in ('novels', 'covers')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  public.beta_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
  and (
    (
      bucket_id = 'novels'
      and lower(storage.extension(name)) in ('pdf', 'cbz')
    )
    or
    (
      bucket_id = 'covers'
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    )
  )
);

-- Exclusão administrativa.
create policy beta_media_admin_delete
on storage.objects
for delete
to authenticated
using (
  public.beta_admin()
  and bucket_id in ('novels', 'covers')
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;