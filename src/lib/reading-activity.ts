import { calculateReadingProgress } from "./media-rules";

export type ActivityPosition = {
  page_number: number;
  scroll_ratio: number;
  line_index?: number;
  page_count?: number | null;
  completed: boolean;
};

/** PDF stores a document ratio; CBZ stores the offset within its current image. */
export function readingActivity(
  position: ActivityPosition,
  book: { media_type: string; total_pages?: number | null },
) {
  const total = book.total_pages || position.page_count || null;
  const measured = calculateReadingProgress({
    mediaType: book.media_type === "cbz" ? "cbz" : "pdf",
    pageNumber: position.page_number,
    totalPages: total,
    scrollRatio: position.scroll_ratio,
  });
  const completed =
    position.completed ||
    measured.completed ||
    (book.media_type === "pdf" && position.scroll_ratio >= 1) ||
    (total !== null && measured.percent === 100);
  const started =
    position.page_number > 1 ||
    position.scroll_ratio > 0 ||
    (position.line_index || 0) > 0;
  return {
    completed,
    inProgress: started && !completed,
    percent: total ? measured.percent : null,
    total,
  };
}

/** Apply the display limit after removing completed chapters and grouping by real series ID. */
export function continuingWorks<
  T extends ActivityPosition & {
    book_id: string;
    updated_at: string;
    books: {
      media_type: string;
      total_pages?: number | null;
      series: { id: string };
    };
  },
>(entries: T[]) {
  const works = new Map<string, T>();
  const sorted = [...entries].sort(
    (a, b) =>
      b.updated_at.localeCompare(a.updated_at) ||
      a.book_id.localeCompare(b.book_id),
  );
  for (const entry of sorted) {
    if (
      readingActivity(entry, entry.books).inProgress &&
      !works.has(entry.books.series.id)
    )
      works.set(entry.books.series.id, entry);
  }
  return [...works.values()];
}
