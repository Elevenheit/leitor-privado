export const formats = {
  novel: "Light Novels",
  manga: "Mangás",
  manhwa: "Manhwas",
  anime: "Animes",
} as const;
export type Format = keyof typeof formats;
export function mediaHref(book: { id: string; media_type?: string }) {
  return `${book.media_type && book.media_type !== "pdf" ? "/media" : "/read"}/${book.id}`;
}

export function pageWindow(page: number, size = 24) {
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new Error("Paginacao invalida.");
  return { from: page * size, to: page * size + size, size };
}
export function catalogPage<T>(rows: T[], size = 24) {
  return { items: rows.slice(0, size), hasMore: rows.length > size };
}
export function catalogSearch(value: string) {
  return value.trim().replace(/[\%_]/g, "").slice(0, 200);
}
