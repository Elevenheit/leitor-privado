import { catalogSearch, type Format } from "@/lib/catalog";
import { supabase } from "@/lib/supabase";
import type { Book, Series, Volume, ReadingProgress } from "@/lib/types";
import { throwOnError } from "./errors";
import { readRows } from "./read-rows";
import { sortBooks, sortVolumes } from "@/lib/reader-navigation";

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
  const api = supabase();
  const [series, books, progress, favorites] = await Promise.all([
    readRows<Series>(
      () => api.from("series").select("*").order("id"),
      "Não foi possível carregar o catálogo.",
    ),
    readRows<Pick<Book, "id" | "series_id">>(
      () => api.from("books").select("id,series_id").order("id"),
      "Não foi possível carregar os capítulos.",
    ),
    readRows<Pick<ReadingProgress, "book_id" | "completed" | "updated_at">>(
      () =>
        api
          .from("reading_progress")
          .select("book_id,completed,updated_at")
          .eq("owner_id", options.ownerId)
          .order("book_id"),
      "Não foi possível carregar seu progresso.",
    ),
    readRows<{ series_id: string }>(
      () =>
        api
          .from("favorites")
          .select("series_id")
          .eq("owner_id", options.ownerId)
          .order("series_id"),
      "Não foi possível carregar favoritos.",
    ),
  ]);
  const favoriteIds = new Set(favorites.map((item) => item.series_id));
  const positions = new Map(progress.map((item) => [item.book_id, item]));
  const summaries = new Map<
    string,
    {
      chapters: number;
      completed: number;
      started: number;
      last: string | null;
    }
  >();
  for (const book of books) {
    if (!book.series_id) continue;
    const stats = summaries.get(book.series_id) || {
      chapters: 0,
      completed: 0,
      started: 0,
      last: null,
    };
    const position = positions.get(book.id);
    stats.chapters++;
    if (position) {
      stats.started++;
      if (position.completed) stats.completed++;
      if (!stats.last || position.updated_at > stats.last)
        stats.last = position.updated_at;
    }
    summaries.set(book.series_id, stats);
  }
  const term = catalogSearch(options.search || "").toLocaleLowerCase();
  const filtered: CatalogSeries[] = series
    .map((item) => {
      const stats = summaries.get(item.id);
      const state =
        stats?.chapters && stats.completed === stats.chapters
          ? "completed"
          : stats?.started
            ? "reading"
            : "unread";
      return {
        ...item,
        chapter_count: stats?.chapters || 0,
        completed_count: stats?.completed || 0,
        reading_state: state as CatalogSeries["reading_state"],
        last_read_at: stats?.last || null,
        is_favorite: favoriteIds.has(item.id),
      };
    })
    .filter(
      (item) =>
        (!options.format || item.format === options.format) &&
        (!term || item.title.toLocaleLowerCase().includes(term)) &&
        (!options.favoritesOnly || item.is_favorite) &&
        (!options.readingState ||
          options.readingState === "all" ||
          item.reading_state === options.readingState),
    );
  filtered.sort(
    (a, b) =>
      (options.order === "title"
        ? a.title.toLocaleLowerCase().localeCompare(b.title.toLocaleLowerCase())
        : 0) ||
      (options.order === "last-read"
        ? (b.last_read_at || "").localeCompare(a.last_read_at || "")
        : 0) ||
      b.created_at.localeCompare(a.created_at) ||
      a.id.localeCompare(b.id),
  );
  const offset = Math.max(0, options.page) * 24;
  const page = {
    items: filtered.slice(offset, offset + 24),
    hasMore: filtered.length > offset + 24,
    totalCount: filtered.length,
  };
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
  const progress = allProgress.filter((item) => ids.has(item.book_id));
  const latest = [...progress].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )[0];
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
