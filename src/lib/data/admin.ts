import { supabase } from "@/lib/supabase";
import { catalogSearch, normalizeSearchText } from "@/lib/catalog";
import type { Book, Series, Volume } from "@/lib/types";
import { DataError, throwOnError } from "./errors";
import { readRows } from "./read-rows";
import { sortBooks } from "@/lib/reader-navigation";

async function ownedLibrary(ownerId: string) {
  const api = supabase();
  const [books, series, volumes, favorites] = await Promise.all([
    readRows<Book>(
      () => api.from("books").select("*").eq("owner_id", ownerId).order("id"),
      "Não foi possível carregar os arquivos.",
    ),
    readRows<Series>(
      () => api.from("series").select("*").eq("owner_id", ownerId).order("id"),
      "Não foi possível carregar as obras.",
    ),
    readRows<Volume>(
      () => api.from("volumes").select("*").eq("owner_id", ownerId).order("id"),
      "Não foi possível carregar os volumes.",
    ),
    readRows<{ series_id: string }>(
      () =>
        api
          .from("favorites")
          .select("series_id")
          .eq("owner_id", ownerId)
          .order("series_id"),
      "Não foi possível carregar favoritos.",
    ),
  ]);
  return {
    books,
    series,
    volumes,
    favorites: new Set(favorites.map((item) => item.series_id)),
  };
}

export async function updateOwnedBooks(
  ownerId: string,
  ids: string[],
  update: Partial<
    Pick<Book, "series_id" | "volume_id" | "content_type" | "sort_order">
  >,
) {
  const expected = new Set(ids);
  const result = await supabase()
    .from("books")
    .update(update)
    .eq("owner_id", ownerId)
    .in("id", [...expected])
    .select("id");
  const rows = throwOnError(result, "Não foi possível atualizar os arquivos.");
  if (
    rows?.length !== expected.size ||
    rows.some((row) => !expected.has(row.id))
  ) {
    throw new DataError(
      "Alguns arquivos não puderam ser atualizados. Confira a sessão e recarregue o acervo antes de tentar novamente.",
      "partial",
    );
  }
}

export async function listAdminCatalog(
  ownerId: string,
  page: number,
  search: string,
) {
  const library = await ownedLibrary(ownerId);
  const term = normalizeSearchText(catalogSearch(search));
  const titles = new Map(library.series.map((item) => [item.id, item.title]));
  const filtered = sortBooks(
    library.books.filter(
      (book) =>
        !term ||
        [
          book.title,
          book.original_filename,
          titles.get(book.series_id || "") || "",
        ].some((value) => normalizeSearchText(value).includes(term)),
    ),
    library.volumes,
  );
  const offset = Math.max(0, page) * 50;
  return {
    books: filtered.slice(offset, offset + 50),
    series: library.series,
    volumes: library.volumes,
    totalCount: filtered.length,
  };
}
export type AdminSeries = Series & {
  chapter_count: number;
  volume_count: number;
};
export async function listAdminWorks(
  page: number,
  search: string,
  favoritesOnly: boolean,
  ownerId: string,
) {
  const library = await ownedLibrary(ownerId);
  const term = normalizeSearchText(catalogSearch(search));
  const matches = (value: string) =>
    !term || normalizeSearchText(value).includes(term);
  const chapters = new Map<string, number>();
  const volumes = new Map<string, number>();
  const matchingBooks = new Set<string>();
  for (const book of library.books)
    if (book.series_id) {
      chapters.set(book.series_id, (chapters.get(book.series_id) || 0) + 1);
      if (matches(book.title) || matches(book.original_filename))
        matchingBooks.add(book.series_id);
    }
  for (const volume of library.volumes)
    volumes.set(volume.series_id, (volumes.get(volume.series_id) || 0) + 1);
  const filtered: AdminSeries[] = library.series
    .filter(
      (item) =>
        (matches(item.title) || matchingBooks.has(item.id)) &&
        (!favoritesOnly || library.favorites.has(item.id)),
    )
    .map((item) => ({
      ...item,
      is_favorite: library.favorites.has(item.id),
      chapter_count: chapters.get(item.id) || 0,
      volume_count: volumes.get(item.id) || 0,
    }))
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
    );
  const loose = favoritesOnly
    ? []
    : library.books.filter(
        (book) =>
          !book.series_id &&
          (matches(book.title) || matches(book.original_filename)),
      );
  const offset = Math.max(0, page) * 24;
  return {
    items: filtered.slice(offset, offset + 24),
    looseBooks: loose.slice(0, 50),
    totalCount: filtered.length,
    looseCount: loose.length,
    fileCount: library.books.length,
    hasMore: filtered.length > offset + 24,
  };
}
export async function nextVolumeOrder(ownerId: string, seriesId: string) {
  const result = await supabase()
    .from("volumes")
    .select("sort_order")
    .eq("owner_id", ownerId)
    .eq("series_id", seriesId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const rows = throwOnError(
    result,
    "Não foi possível verificar a ordem dos volumes.",
  );
  return Math.min(2147483647, (rows?.[0]?.sort_order || 0) + 1000);
}
