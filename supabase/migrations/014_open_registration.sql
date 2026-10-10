-- Upgrade after 013. Historical names remain for existing RLS and clients.
begin;

alter table public.beta_access alter column expires_at set default 'infinity';
insert into public.profiles(id, nickname)
select id, 'leitor_' || replace(id::text, '-', '') from auth.users
on conflict (id) do nothing;
insert into public.beta_access(user_id, role, expires_at)
select id, 'reader', 'infinity' from auth.users
on conflict (user_id) do nothing;
update public.beta_access set expires_at = 'infinity' where not revoked;

create or replace function public.beta_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.beta_access
    where user_id = auth.uid() and not revoked);
$$;
create or replace function public.beta_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.beta_access
    where user_id = auth.uid() and role = 'admin' and not revoked);
$$;
revoke all on function public.beta_member(), public.beta_admin() from public;
grant execute on function public.beta_member(), public.beta_admin() to authenticated;

create or replace function public.enroll_beta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- No role or profile field is read from client-controlled user metadata.
  insert into public.profiles(id, nickname)
  values(new.id, 'leitor_' || replace(new.id::text, '-', ''))
  on conflict (id) do nothing;
  insert into public.beta_access(user_id, role, expires_at)
  values(new.id, 'reader', 'infinity') on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.enroll_beta() from public;

-- The existing enroll_beta trigger uses this replacement function.
-- Invites, publication flags, explicit revocations, data and Storage are retained.
commit;
