-- Add a per-reader report cooldown without changing existing report history.
begin;

alter table public.comment_reports
  add column created_at timestamptz not null default '-infinity';
alter table public.comment_reports
  alter column created_at set default now();

create index comment_reports_owner_created
  on public.comment_reports(owner_id, created_at desc);

create or replace function public.check_comment_report_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.owner_id::text));
  if exists (
    select 1 from public.comment_reports r
    where r.owner_id = new.owner_id
      and r.created_at > now() - interval '5 seconds'
  ) then
    raise exception 'Espere antes de enviar outra denuncia.';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger check_comment_report_rate
before insert on public.comment_reports
for each row execute function public.check_comment_report_rate();

commit;
