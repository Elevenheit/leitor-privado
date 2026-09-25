import type { Book, ReadingProgress, Volume } from "@/lib/types";
import { calculateReadingProgress } from "@/lib/media-rules";

function compareNumbers(a: number | null | undefined, b: number | null | undefined) {
  return (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER);
}

export function sortVolumes(volumes: Volume[]) {
  return [...volumes].sort((a, b) => compareNumbers(a.sort_order, b.sort_order)
    || compareNumbers(a.volume_number, b.volume_number)
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id));
}

export function sortBooks(books: Book[], volumes: Volume[]) {
  const volumeOrder = new Map(sortVolumes(volumes).map((volume, index) => [volume.id, index]));
  const chapterRank = (book: Book) => {
    if (book.chapter_number !== null) return book.chapter_number;
    const title = `${book.chapter_title || ""} ${book.title}`.toLocaleLowerCase();
    if (/\b(pr[oó]logo|prologue)\b/.test(title)) return -1;
    if (/\b(ep[ií]logo|epilogue)\b/.test(title)) return Number.MAX_SAFE_INTEGER - 1;
    return Number.MAX_SAFE_INTEGER;
  };
  return [...books].sort((a, b) => compareNumbers(a.volume_id ? volumeOrder.get(a.volume_id) : Number.MAX_SAFE_INTEGER, b.volume_id ? volumeOrder.get(b.volume_id) : Number.MAX_SAFE_INTEGER)
    || compareNumbers(a.sort_order, b.sort_order)
    || compareNumbers(chapterRank(a), chapterRank(b))
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id));
}

export function readingStatus(book: Book, progress?: ReadingProgress) {
  if (!progress) return "Não iniciado";
  if (book.media_type !== "pdf" && progress.completed) return "Concluido";
  const measured = calculateReadingProgress({
    mediaType: book.media_type,
    pageNumber: progress.page_number,
    totalPages: book.total_pages,
    scrollRatio: progress.scroll_ratio,
    positionSeconds: progress.position_seconds,
    reachedEnd: progress.completed,
  });
  return measured.completed ? "Concluido" : "Em leitura";
}
