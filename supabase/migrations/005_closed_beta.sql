-- Apply only to a backed-up test clone first. Additive data migration.
begin;
create table public.beta_access (
 user_id uuid primary key references auth.users on delete cascade,
 role text not null default 'reader' check(role in ('reader','admin')),
 expires_at timestamptz not null default now() + interval '7 days',
 revoked boolean not null default false
);
alter table public.beta_access enable row level security;
-- Preserve the existing catalog owner, without trusting user metadata.
insert into public.beta_access(user_id,role,expires_at)
select id,'admin','infinity'::timestamptz from auth.users
where id = '43caebf0-0851-4939-978d-196aa05e80f2'::uuid;
create function public.beta_member() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.beta_access where user_id=auth.uid() and not revoked and expires_at>now()); $$;
create function public.beta_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.beta_access where user_id=auth.uid() and role='admin' and not revoked and expires_at>now()); $$;
revoke all on function public.beta_member(), public.beta_admin() from public;
grant execute on function public.beta_member(), public.beta_admin() to authenticated;
create policy own_access on public.beta_access for select to authenticated using(user_id=auth.uid());
create table public.beta_invites(email text primary key check(email=lower(email)), expires_at timestamptz not null, claimed_by uuid references auth.users);
alter table public.beta_invites enable row level security;
-- Trigger enforces invitations even if the Auth hook is accidentally not configured.
create function public.enroll_beta() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.beta_invites set claimed_by=new.id where email=lower(new.email) and expires_at>now() and claimed_by is null;
 if not found then raise exception 'Cadastro restrito aos convidados do beta.'; end if;
 insert into public.beta_access(user_id,expires_at) select new.id,expires_at from public.beta_invites where email=lower(new.email);
 insert into public.profiles(id,nickname) values(new.id,'leitor_' || replace(new.id::text,'-',''));
 return new;
end; $$;
revoke all on function public.enroll_beta() from public;
create table public.profiles(id uuid primary key references auth.users on delete cascade, nickname text not null unique check(nickname ~ '^[a-z0-9_]{3,40}$'), display_name text not null default '' check(length(display_name)<=80), bio text not null default '' check(length(bio)<=300), avatar text not null default '✦' check(avatar in ('✦','☾','❀','◈')), avatar_path text, banner_path text, preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(preferences)='object' and pg_column_size(preferences)<4096));
insert into public.profiles(id,nickname) select id,'leitor_'||replace(id::text,'-','') from auth.users;
alter table public.profiles enable row level security;
create policy read_profiles on public.profiles for select to authenticated using(public.beta_member() and id=auth.uid());
create policy update_profile on public.profiles for update to authenticated using(public.beta_member() and id=auth.uid()) with check(id=auth.uid());
create view public.profile_identities with (security_barrier=true) as select id,nickname,avatar,avatar_path from public.profiles where public.beta_member();
revoke all on public.profile_identities from anon;
grant select on public.profile_identities to authenticated;
insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit) values('profiles','profiles',false,array['image/jpeg','image/png','image/webp'],2097152);
create policy profile_image_read on storage.objects for select to authenticated using(bucket_id='profiles' and public.beta_member());
create policy profile_image_write on storage.objects for all to authenticated using(bucket_id='profiles' and public.beta_member() and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='profiles' and public.beta_member() and (storage.foldername(name))[1]=auth.uid()::text and lower(storage.extension(name)) in ('jpg','png','webp'));
create function public.beta_signup_ready() returns boolean language sql stable as $$ select true $$;
revoke all on function public.beta_signup_ready() from public;
grant execute on function public.beta_signup_ready() to anon,authenticated;
create trigger enroll_beta after insert on auth.users for each row execute function public.enroll_beta();
alter table public.series add column format text not null default 'novel' check(format in ('novel','manga','manhwa','anime'));
alter table public.series add column tags text[] not null default '{}';
alter table public.series add column rights_note text;
alter table public.series add column beta_visible boolean not null default false;
alter table public.books add column media_type text not null default 'pdf' check(media_type in ('pdf','cbz','video'));
alter table public.books add column skip_intro boolean not null default false;
alter table public.books add column intro_end integer not null default 90 check(intro_end between 90 and 110);
alter table public.reading_progress drop constraint reading_progress_pkey;
alter table public.reading_progress add primary key(owner_id,book_id);
alter table public.reading_progress add column position_seconds double precision not null default 0 check(position_seconds>=0 and position_seconds<'Infinity'::float8);
alter table public.reading_progress add column completed boolean not null default false;
create table public.favorites(owner_id uuid not null references auth.users on delete cascade, series_id uuid not null references public.series on delete cascade, primary key(owner_id,series_id));
insert into public.favorites select owner_id,id from public.series where is_favorite on conflict do nothing;
alter table public.favorites enable row level security;
-- Replace policies only on the explicitly scoped application tables.
do $$ declare p record; t text; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('books','series','volumes','reading_progress','reading_bookmarks') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
 foreach t in array array['books','series','volumes'] loop
 if t='series' then
 execute 'create policy catalog_read on public.series for select to authenticated using(public.beta_member() and beta_visible)';
 elsif t='books' then
 execute 'create policy catalog_read on public.books for select to authenticated using(public.beta_member() and exists(select 1 from public.series s where s.id=series_id and s.beta_visible))';
 else
 execute 'create policy catalog_read on public.volumes for select to authenticated using(public.beta_member() and exists(select 1 from public.series s where s.id=series_id and s.beta_visible))';
 end if;
 execute format('create policy catalog_write on public.%I for all to authenticated using(public.beta_admin()) with check(public.beta_admin())',t);
 end loop;
 foreach t in array array['reading_progress','reading_bookmarks','favorites'] loop
 execute format('create policy personal_data on public.%I for all to authenticated using(public.beta_member() and owner_id=auth.uid()) with check(public.beta_member() and owner_id=auth.uid() and exists(select 1 from public.%I c where c.id=%I))',t,case when t='favorites' then 'series' else 'books' end,case when t='favorites' then 'series_id' else 'book_id' end);
 end loop;
end $$;
-- Old Storage owner policies must not bypass expiration/revocation.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'Owner %' loop
 execute format('drop policy %I on storage.objects',p.policyname); end loop;
end $$;
create policy beta_media_read on storage.objects for select to authenticated using(public.beta_member() and ((bucket_id='novels' and exists(select 1 from public.books b where b.file_path=name)) or (bucket_id='covers' and exists(select 1 from public.series s where s.cover_path=name))));
create policy beta_media_admin on storage.objects for all to authenticated using(public.beta_admin() and bucket_id in ('novels','covers')) with check(public.beta_admin() and bucket_id in ('novels','covers'));
update storage.buckets set public=false, allowed_mime_types=array['application/pdf','application/zip','application/vnd.comicbook+zip','video/mp4','video/webm'], file_size_limit=524288000 where id='novels';
create index series_format_created on public.series(format,created_at desc,id);
create table public.comments(id uuid primary key default gen_random_uuid(), series_id uuid not null references public.series on delete cascade, owner_id uuid not null references public.profiles(id), body text not null check(length(trim(body)) between 1 and 2000), spoiler boolean not null default false, parent_id uuid references public.comments on delete set null, created_at timestamptz not null default now());
alter table public.comments enable row level security;
create policy comment_read on public.comments for select to authenticated using(public.beta_member() and exists(select 1 from public.series s where s.id=series_id));
create policy comment_insert on public.comments for insert to authenticated with check(public.beta_member() and owner_id=auth.uid() and exists(select 1 from public.series s where s.id=series_id));
create policy comment_update on public.comments for update to authenticated using(public.beta_member() and owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy comment_delete on public.comments for delete to authenticated using(public.beta_member() and (owner_id=auth.uid() or public.beta_admin()));
create function public.check_comment() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
 if pg_trigger_depth()>1 and old.parent_id is not null and new.parent_id is null then return new; end if;
 if new.owner_id<>old.owner_id or new.series_id<>old.series_id or new.created_at<>old.created_at or new.parent_id is distinct from old.parent_id then raise exception 'Metadados imutáveis'; end if;
 else
 perform pg_advisory_xact_lock(hashtext(new.owner_id::text));
 new.created_at:=now();
 if exists(select 1 from public.comments where owner_id=new.owner_id and created_at>now()-interval '15 seconds') then raise exception 'Espere 15 segundos entre comentários.'; end if;
 end if;
 if new.parent_id is not null and not exists(select 1 from public.comments where id=new.parent_id and series_id=new.series_id and parent_id is null) then raise exception 'Resposta inválida: profundidade máxima 1'; end if;
 return new;
end; $$;
create trigger check_comment before insert or update on public.comments for each row execute function public.check_comment();
create index comments_series_date on public.comments(series_id,created_at desc,id);
create table public.comment_reports(comment_id uuid references public.comments on delete cascade, owner_id uuid references auth.users, reason text not null check(length(reason) between 3 and 500), primary key(comment_id,owner_id));
alter table public.comment_reports enable row level security;
create policy report_insert on public.comment_reports for insert to authenticated with check(public.beta_member() and owner_id=auth.uid());
create policy report_read on public.comment_reports for select to authenticated using(public.beta_admin() or (public.beta_member() and owner_id=auth.uid()));
create function public.validate_catalog_link() returns trigger language plpgsql set search_path='' as $$
declare f text;
begin
 if new.series_id is not null then
 select format into f from public.series where id=new.series_id;
 if not ((new.media_type='pdf' and f='novel') or (new.media_type='cbz' and f in ('manga','manhwa')) or (new.media_type='video' and f='anime')) then raise exception 'Formato da mídia incompatível com a obra'; end if;
 end if;
 if new.volume_id is not null and not exists(select 1 from public.volumes where id=new.volume_id and series_id=new.series_id) then raise exception 'Volume não pertence à obra'; end if;
 return new;
end; $$;
create trigger validate_catalog_link before insert or update of series_id,volume_id,media_type on public.books for each row execute function public.validate_catalog_link();
create function public.validate_series_format() returns trigger language plpgsql set search_path='' as $$
begin
 if new.format<>old.format and exists(select 1 from public.books where series_id=new.id and not ((media_type='pdf' and new.format='novel') or (media_type='cbz' and new.format in ('manga','manhwa')) or (media_type='video' and new.format='anime'))) then raise exception 'Mova as mídias incompatíveis antes de alterar o formato'; end if;
 return new;
end; $$;
create trigger validate_series_format before update of format on public.series for each row execute function public.validate_series_format();
revoke all on public.beta_access,public.beta_invites,public.profiles,public.favorites,public.comments,public.comment_reports from anon,authenticated;
grant select on public.beta_access to authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert,update,delete on public.favorites,public.comments to authenticated;
grant select,insert on public.comment_reports to authenticated;
grant select,insert,update,delete on public.books,public.series,public.volumes,public.reading_progress,public.reading_bookmarks to authenticated;
commit;
