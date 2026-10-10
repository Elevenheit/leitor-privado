import { catalogSearch, normalizeSearchText, type Format } from "@/lib/catalog";
import { supabase } from "@/lib/supabase";
import type { Book, Series, Volume, ReadingProgress } from "@/lib/types";
import { throwOnError } from "./errors";
import { readRows } from "./read-rows";
import { sortBooks, sortVolumes } from "@/lib/reader-navigation";

import { mergeAccessibleProgress } from "@/lib/local-progress";
import { readingActivity } from "@/lib/reading-activity";
import { listLocalProgress } from "@/lib/local-progress";

export async function listCatalogSeries(ownerId: string) {
  const result = await supabase()
    .from("series")
    .select(
      "id,owner_id,title,description,cover_path,created_at,updated_at,format,tags,rights_note,beta_visible",
    )
    .eq("owner_id", ownerId)
    .order("title");
  return throwOnError(
    result,
    "Não foi possível carregar o catálogo.",
  ) as Series[];
}

export async function getCatalogSeries(id: string, ownerId: string) {
  const result = await supabase()
    .from("series")
    .select(
      "id,owner_id,title,description,cover_path,created_at,updated_at,format,tags,rights_note,beta_visible",
    )
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  return throwOnError(
    result,
    "Não foi possível carregar a obra.",
  ) as Series | null;
}

export async function listSeriesBooks(id: string, ownerId: string) {
  const result = await supabase()
    .from("books")
    .select(
      "id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type",
    )
    .eq("series_id", id)
    .eq("owner_id", ownerId)
    .order("sort_order")
    .order("chapter_number");
  return throwOnError(
    result,
    "Não foi possível carregar os capítulos.",
  ) as Book[];
}

export async function listSeriesVolumes(id: string, ownerId: string) {
  const result = await supabase()
    .from("volumes")
    .select(
      "id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at",
    )
    .eq("series_id", id)
    .eq("owner_id", ownerId)
    .order("sort_order")
    .order("volume_number");
  return throwOnError(
    result,
    "Não foi possível carregar os volumes.",
  ) as Volume[];
}

export type ReadingState = "all" | "unread" | "reading" | "completed";
export type CatalogOrder = "recent" | "title" | "last-read";
export type CatalogSeries = Series & {
  chapter_count: number;
  completed_count: number;
  reading_state: Exclude<ReadingState, "all">;
  last_read_at: string | null;
};

export async function listCatalogPage(options: {
  ownerId: string;
  page: number;
  format?: Format;
  favoritesOnly?: boolean;
  search?: string;
  readingState?: ReadingState;
  order?: CatalogOrder;
}) {
  const pending = listLocalProgress(options.ownerId)
    .filter((position) => position.pending)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 512)
    .map(
      ({
        book_id,
        page_number,
        scroll_ratio,
        page_count,
        line_index,
        completed,
        updated_at,
      }) => ({
        book_id,
        page_number,
        scroll_ratio,
        page_count,
        line_index,
        completed,
        updated_at,
      }),
    );
  const result = await supabase().rpc("browse_catalog", {
    page_index: Number.isFinite(options.page)
      ? Math.max(0, Math.floor(options.page))
      : 0,
    filter_format: options.format ?? null,
    favorites_only: options.favoritesOnly ?? false,
    search_term: normalizeSearchText(catalogSearch(options.search || "")),
    reading_state: options.readingState ?? "all",
    sort_by: options.order ?? "recent",
    pending_positions: pending,
  });
  const page = throwOnError(
    result,
    "Não foi possível carregar o catálogo. Tente novamente ou avise a administração.",
  ) as {
    items: CatalogSeries[];
    totalCount: number;
    hasMore: boolean;
  } | null;
  if (!page || !Array.isArray(page.items))
    throw new Error("O catálogo não retornou uma página válida.");
  return {
    ...page,
    favoriteIds: page.items
      .filter((item) => item.is_favorite)
      .map((item) => item.id),
  };
}

export type WorkPage = {
  series: Series | null;
  books: Book[];
  volumes: Volume[];
  progress: ReadingProgress[];
  firstBook: Pick<Book, "id" | "media_type"> | null;
  lastRead: Pick<Book, "id" | "media_type"> | null;
  chapterCount: number;
  completedCount: number;
  volumeCount: number;
  hasMore: boolean;
};
export async function getWorkPage(
  id: string | null,
  page: number,
  ownerId: string,
): Promise<WorkPage> {
  const api = supabase();
  const [seriesResult, allBooks, allVolumes, allProgress] = await Promise.all([
    id
      ? api.from("series").select("*").eq("id", id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    readRows<Book>(() => {
      const query = api.from("books").select("*").order("id");
      return id ? query.eq("series_id", id) : query.is("series_id", null);
    }, "Não foi possível carregar os capítulos."),
    id
      ? readRows<Volume>(
          () => api.from("volumes").select("*").eq("series_id", id).order("id"),
          "Não foi possível carregar os volumes.",
        )
      : Promise.resolve([]),
    readRows<ReadingProgress>(
      () =>
        api
          .from("reading_progress")
          .select("*")
          .eq("owner_id", ownerId)
          .order("book_id"),
      "Não foi possível carregar seu progresso.",
    ),
  ]);
  const series = throwOnError(
    seriesResult,
    "Não foi possível abrir esta obra.",
  ) as Series | null;
  const volumes = sortVolumes(allVolumes);
  const ordered = sortBooks(allBooks, volumes);
  const ids = new Set(ordered.map((book) => book.id));
  const progress = mergeAccessibleProgress(ownerId, allProgress, ids);
  const recentProgress = [...progress].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  const booksById = new Map(ordered.map((book) => [book.id, book]));
  const latest =
    recentProgress.find((position) => {
      const book = booksById.get(position.book_id);
      return book && readingActivity(position, book).inProgress;
    }) || recentProgress[0];
  const lastRead = latest
    ? ordered.find((book) => book.id === latest.book_id) || null
    : null;
  const offset = Math.max(0, page) * 100;
  const books = ordered.slice(offset, offset + 100);
  const pageIds = new Set(books.map((book) => book.id));
  return {
    series,
    books,
    volumes,
    progress: progress.filter((item) => pageIds.has(item.book_id)),
    firstBook: ordered[0] || null,
    lastRead,
    chapterCount: ordered.length,
    completedCount: progress.filter((item) => item.completed).length,
    volumeCount: volumes.length,
    hasMore: ordered.length > offset + 100,
  };
}
