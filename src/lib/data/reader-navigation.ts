import { supabase } from "@/lib/supabase";
import type { Book } from "@/lib/types";

export async function getReaderNavigationNeighbors(
  book: Pick<Book, "id">,
) {
  const { data, error } = await supabase().rpc("reader_navigation_neighbors", { target_book_id: book.id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    previousId: row?.previous_id || null,
    nextId: row?.next_id || null,
  };
}
