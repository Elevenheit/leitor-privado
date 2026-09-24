-- Run before AND after; save both results outside Git.
select 'books' as entity,count(*) from public.books
union all select 'series',count(*) from public.series
union all select 'volumes',count(*) from public.volumes
union all select 'progress',count(*) from public.reading_progress
union all select 'bookmarks',count(*) from public.reading_bookmarks;
select bucket_id,count(*) from storage.objects where bucket_id in ('novels','covers') group by bucket_id;
-- No missing media paths (zero rows expected for a healthy preexisting library).
select b.id,b.file_path from public.books b left join storage.objects o on o.bucket_id='novels' and o.name=b.file_path where o.id is null;
-- No inconsistent volume references.
select b.id from public.books b join public.volumes v on v.id=b.volume_id where b.series_id is distinct from v.series_id;
