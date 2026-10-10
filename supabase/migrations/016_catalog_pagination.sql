begin;

create or replace function public.catalog_search_text(value text) returns text
language sql immutable strict set search_path = '' as $$
  select translate(lower(regexp_replace(trim(value), '\s+', ' ', 'g')),
    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
$$;
revoke all on function public.catalog_search_text(text) from public;
grant execute on function public.catalog_search_text(text) to authenticated;

create or replace function public.browse_catalog(
  page_index integer default 0, filter_format text default null,
  favorites_only boolean default false, search_term text default '',
  reading_state text default 'all', sort_by text default 'recent',
  pending_positions jsonb default '[]'::jsonb
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with local_positions as (
    select distinct on (book_id) * from jsonb_to_recordset(
      case when jsonb_typeof(pending_positions) = 'array'
        and jsonb_array_length(pending_positions) <= 512
        then pending_positions else '[]'::jsonb end
    ) as p(book_id uuid, page_number integer, scroll_ratio double precision,
      page_count integer, line_index integer, completed boolean, updated_at timestamptz)
    order by book_id, updated_at desc nulls last
  ), book_positions as (
    select b.*, v.title as volume_title, v.volume_number,
      case when l.updated_at >= coalesce(p.updated_at, '-infinity') then l.page_number else p.page_number end as read_page,
      case when l.updated_at >= coalesce(p.updated_at, '-infinity') then l.scroll_ratio else p.scroll_ratio end as read_ratio,
      case when l.updated_at >= coalesce(p.updated_at, '-infinity') then l.line_index else p.line_index end as read_line,
      coalesce(nullif(b.total_pages, 0), nullif(l.page_count, 0), nullif(p.page_count, 0)) as read_total,
      coalesce(p.completed, false) or coalesce(l.completed, false) as was_completed,
      greatest(p.updated_at, l.updated_at) as read_at
    from public.books b
    left join public.volumes v on v.id = b.volume_id
    left join public.reading_progress p on p.book_id = b.id and p.owner_id = auth.uid()
    left join local_positions l on l.book_id = b.id
  ), activity as (
    select b.*, was_completed or
      case when media_type = 'pdf' then coalesce(read_ratio, 0) >= case when read_total > 0 then 0.95 else 1 end
        else coalesce((read_page - 1 + read_ratio) / nullif(read_total, 0), 0) >= 0.95 end as finished
    from book_positions b
  ), stats as (
    select series_id, count(*) as chapter_count,
      count(*) filter (where finished) as completed_count,
      count(*) filter (where not finished and (read_page > 1 or read_ratio > 0 or read_line > 0)) as pending_count,
      max(read_at) as last_read_at,
      string_agg(concat_ws(' ', title, chapter_title, 'capítulo ' || chapter_number,
        'volume ' || volume_number, 'vol. ' || volume_number, volume_title), ' ') as search_content
    from activity group by series_id
  ), summaries as (
    select s.id, s.owner_id, s.title, s.description, s.cover_path, s.created_at, s.updated_at,
      s.format, s.tags, s.rights_note, s.beta_visible, coalesce(t.chapter_count, 0) as chapter_count,
      coalesce(t.completed_count, 0) as completed_count, t.last_read_at,
      exists(select 1 from public.favorites f where f.owner_id = auth.uid() and f.series_id = s.id) as is_favorite,
      case when t.chapter_count > 0 and t.completed_count = t.chapter_count then 'completed'
        when t.pending_count > 0 then 'reading' else 'unread' end as reading_state,
      public.catalog_search_text(concat_ws(' ', s.title,
        case s.format when 'novel' then 'Light Novels' when 'manga' then 'Mangás' else 'Manhwas' end,
        t.search_content)) as search_content
    from public.series s left join stats t on t.series_id = s.id
  ), filtered as (
    select * from summaries s
    where public.beta_member()
      and (filter_format is null or s.format = filter_format)
      and (not coalesce(favorites_only, false) or s.is_favorite)
      and (coalesce(browse_catalog.reading_state, 'all') = 'all' or s.reading_state = browse_catalog.reading_state)
      and (coalesce(search_term, '') = '' or strpos(s.search_content, public.catalog_search_text(search_term)) > 0)
  ), paged as (
    select * from filtered
    order by case when sort_by = 'title' then lower(title) end,
      case when sort_by = 'last-read' then last_read_at end desc nulls last,
      created_at desc, id
    offset least(1000000, greatest(0, coalesce(page_index, 0)))::bigint * 24 limit 24
  ) select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p) - 'search_content') from paged p), '[]'::jsonb),
    'totalCount', (select count(*) from filtered),
    'hasMore', (select count(*) from filtered) > (greatest(0, coalesce(page_index, 0))::bigint + 1) * 24
  );
$$;
revoke all on function public.browse_catalog(integer,text,boolean,text,text,text,jsonb) from public;
grant execute on function public.browse_catalog(integer,text,boolean,text,text,text,jsonb) to authenticated;
create index if not exists books_series_catalog_idx on public.books(series_id);
create index if not exists progress_owner_catalog_idx on public.reading_progress(owner_id,book_id);
commit;
