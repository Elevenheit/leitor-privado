-- Comments are part of the shared catalog and follow the series visibility.
begin;

drop policy if exists comment_read on public.comments;
create policy comment_read on public.comments for select to authenticated
  using (public.beta_member() and exists (
    select 1 from public.series s
    where s.id = series_id and s.beta_visible
  ));

drop policy if exists comment_insert on public.comments;
create policy comment_insert on public.comments for insert to authenticated
  with check (public.beta_member() and owner_id = auth.uid() and exists (
    select 1 from public.series s
    where s.id = series_id and s.beta_visible
  ));

drop policy if exists comment_update on public.comments;
create policy comment_update on public.comments for update to authenticated
  using (public.beta_member() and owner_id = auth.uid() and exists (
    select 1 from public.series s
    where s.id = series_id and s.beta_visible
  ))
  with check (public.beta_member() and owner_id = auth.uid() and exists (
    select 1 from public.series s
    where s.id = series_id and s.beta_visible
  ));

drop policy if exists comment_delete on public.comments;
create policy comment_delete on public.comments for delete to authenticated
  using (public.beta_member() and (
    public.beta_admin() or (owner_id = auth.uid() and exists (
      select 1 from public.series s
      where s.id = series_id and s.beta_visible
    ))
  ));

drop policy if exists report_insert on public.comment_reports;
create policy report_insert on public.comment_reports for insert to authenticated
  with check (public.beta_member() and owner_id = auth.uid() and exists (
    select 1 from public.comments c
    join public.series s on s.id = c.series_id
    where c.id = comment_id and s.beta_visible
  ));

commit;
