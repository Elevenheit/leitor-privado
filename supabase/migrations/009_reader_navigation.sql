begin;

create or replace function public.reader_navigation_neighbors(target_book_id uuid)
returns table(previous_id uuid, next_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select b.id, b.series_id
    from public.books b
    where b.id = target_book_id
  ), volume_order as (
    select v.id,
      row_number() over (
        order by v.sort_order, v.volume_number nulls last, v.created_at, v.id
      ) as position
    from public.volumes v
  ), ordered_books as (
    select b.id,
      row_number() over (
        order by coalesce(vo.position, 9223372036854775807::bigint),
          b.sort_order,
          case
            when b.chapter_number is not null then b.chapter_number
            when lower(concat_ws(' ', b.chapter_title, b.title)) ~ '(prologue|prologo|prólogo)' then -1
            when lower(concat_ws(' ', b.chapter_title, b.title)) ~ '(epilogue|epilogo|epílogo)' then 9007199254740990
            else 9007199254740991
          end,
          b.created_at, b.id
      ) as position
    from public.books b
    left join volume_order vo on vo.id = b.volume_id
    where (select series_id from target) is null and b.series_id is null
       or b.series_id = (select series_id from target)
  ), current_position as (
    select position from ordered_books where id = target_book_id
  )
  select
    (select id from ordered_books where position = (select position - 1 from current_position)),
    (select id from ordered_books where position = (select position + 1 from current_position));
$$;

revoke all on function public.reader_navigation_neighbors(uuid) from public;
grant execute on function public.reader_navigation_neighbors(uuid) to authenticated;

commit;
