import { supabase } from "@/lib/supabase";
import { throwOnError } from "./errors";

const BOOK_COLUMNS = "id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type";
const SERIES_COLUMNS = "id,owner_id,title,description,cover_path,created_at,updated_at,format,tags,rights_note,beta_visible";
const VOLUME_COLUMNS = "id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at";

export async function listAdminCatalog(ownerId: string, page: number, search: string, pageSize = 50) {
  const api = supabase();
  const [seriesResult, volumesResult] = await Promise.all([
    api.from("series").select(SERIES_COLUMNS).eq("owner_id", ownerId).order("title"),
    api.from("volumes").select(VOLUME_COLUMNS).eq("owner_id", ownerId).order("sort_order").order("volume_number"),
  ]);
  const series = throwOnError(seriesResult, "Nao foi possivel carregar as obras.") || [];
  const volumes = throwOnError(volumesResult, "Nao foi possivel carregar os volumes.") || [];
  const term = search.trim().replace(/[^\p{L}\p{N} _.-]/gu, "");
  let booksQuery = api.from("books").select(BOOK_COLUMNS, { count: "exact" }).eq("owner_id", ownerId);
  if (term) {
    const matchingSeries = series.filter((item) => item.title.toLocaleLowerCase().includes(term.toLocaleLowerCase())).map((item) => item.id);
    const clauses = [`title.ilike.%${term}%`, `original_filename.ilike.%${term}%`];
    if (matchingSeries.length) clauses.push(`series_id.in.(${matchingSeries.join(",")})`);
    booksQuery = booksQuery.or(clauses.join(","));
  }
  const result = await booksQuery
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * pageSize, page * pageSize + pageSize - 1);
  return {
    books: throwOnError(result, "Nao foi possivel carregar os arquivos."),
    totalCount: result.count || 0,
    series,
    volumes,
  };
}
