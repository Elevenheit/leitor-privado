import { supabase } from "@/lib/supabase";
import type { ReadingBookmark } from "@/lib/types";
import { throwOnError } from "./errors";

export type BookmarkPosition = Pick<
  ReadingBookmark,
  "page_number" | "line_index" | "scroll_ratio" | "page_offset" | "text_offset"
>;

export async function listBookmarks(ownerId: string, bookId: string) {
  const result = await supabase()
    .from("reading_bookmarks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });
  return (throwOnError(result, "Não foi possível carregar os marcadores.") ||
    []) as ReadingBookmark[];
}

export async function createBookmark(
  ownerId: string,
  bookId: string,
  position: BookmarkPosition,
  label: string | null,
) {
  const result = await supabase()
    .from("reading_bookmarks")
    .insert({ owner_id: ownerId, book_id: bookId, ...position, label });
  throwOnError(result, "Não foi possível salvar o marcador.");
}

export async function renameBookmark(
  ownerId: string,
  bookId: string,
  id: string,
  label: string | null,
) {
  const result = await supabase()
    .from("reading_bookmarks")
    .update({ label })
    .eq("owner_id", ownerId)
    .eq("book_id", bookId)
    .eq("id", id);
  throwOnError(result, "Não foi possível renomear o marcador.");
}

export async function deleteBookmark(
  ownerId: string,
  bookId: string,
  id: string,
) {
  const result = await supabase()
    .from("reading_bookmarks")
    .delete()
    .eq("owner_id", ownerId)
    .eq("book_id", bookId)
    .eq("id", id);
  throwOnError(result, "Não foi possível excluir o marcador.");
}
