-- Apply after 012. No row rewrites, policy changes or destructive operations.
begin;

create or replace function public.guard_reading_progress_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- UPSERT already holds the row lock: delayed requests from another tab/device
  -- cannot replace a position with an older timestamp.
  if new.updated_at < old.updated_at then
    raise exception using errcode = '40001',
      message = 'A newer reading position has already been saved.';
  end if;
  new.completed := old.completed or new.completed;
  return new;
end;
$$;

revoke all on function public.guard_reading_progress_order() from public;
drop trigger if exists reading_progress_order_guard on public.reading_progress;
create trigger reading_progress_order_guard
before update on public.reading_progress
for each row execute function public.guard_reading_progress_order();

commit;

-- Rollback (positions are retained):
-- drop trigger if exists reading_progress_order_guard on public.reading_progress;
-- drop function if exists public.guard_reading_progress_order();
