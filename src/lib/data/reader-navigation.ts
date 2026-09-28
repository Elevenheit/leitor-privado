import { supabase } from "@/lib/supabase";
import { sortBooks } from "@/lib/reader-navigation";
import type { Book, Volume } from "@/lib/types";

export async function getReaderNavigationNeighbors(
  book: Pick<Book, "id" | "series_id">,
) {
  const api = supabase();
  let booksQuery = api
    .from("books")
    .select(
      "id,title,chapter_title,chapter_number,sort_order,created_at,series_id,volume_id",
    );
  booksQuery = book.series_id
    ? booksQuery.eq("series_id", book.series_id)
    : booksQuery.is("series_id", null);

  const [booksResult, volumesResult] = await Promise.all([
    booksQuery,
    book.series_id
      ? api
          .from("volumes")
          .select("id,series_id,volume_number,sort_order,created_at")
          .eq("series_id", book.series_id)
      : Promise.resolve({ data: [] as Volume[], error: null }),
  ]);
  if (booksResult.error) throw booksResult.error;
  if (volumesResult.error) throw volumesResult.error;

  const ordered = sortBooks(
    (booksResult.data || []) as Book[],
    (volumesResult.data || []) as Volume[],
  );
  const index = ordered.findIndex((item) => item.id === book.id);
  return {
    previousId: index > 0 ? ordered[index - 1].id : null,
    nextId: index >= 0 ? ordered[index + 1]?.id || null : null,
  };
}