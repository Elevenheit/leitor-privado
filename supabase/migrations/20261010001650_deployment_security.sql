-- Apply after 016. Preserve public identity fields and all stored data.
begin;

-- This legacy policy bypassed catalog publication and account suspension.
drop policy if exists usuarios_logados_podem_ver_biblioteca on public.books;

alter function public.is_private_owner() set search_path = '';
alter function public.beta_signup_ready() set search_path = '';
revoke all on function public.is_private_owner() from public, anon;
grant execute on function public.is_private_owner() to authenticated;
revoke all on function public.beta_member(), public.beta_admin() from public, anon;
grant execute on function public.beta_member(), public.beta_admin() to authenticated;
revoke all on function public.enroll_beta() from public, anon, authenticated;

-- Keep the narrow community projection without granting access to private profiles.
create schema if not exists nook_private;
revoke all on schema nook_private from public, anon;
grant usage on schema nook_private to authenticated;
create or replace function nook_private.profile_identity_rows()
returns table(id uuid, nickname text, avatar text, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nickname, p.avatar, p.avatar_path
  from public.profiles p
  where auth.uid() is not null and public.beta_member();
$$;
revoke all on function nook_private.profile_identity_rows() from public, anon;
grant execute on function nook_private.profile_identity_rows() to authenticated;
create or replace view public.profile_identities
with (security_barrier = true, security_invoker = true) as
select * from nook_private.profile_identity_rows();
revoke all on public.profile_identities from public, anon;
grant select on public.profile_identities to authenticated;

commit;
