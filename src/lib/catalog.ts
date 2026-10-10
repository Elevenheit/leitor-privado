export const formats = {
  novel: "Light Novels",
  manga: "Mangás",
  manhwa: "Manhwas",
} as const;
export type Format = keyof typeof formats;
export function mediaHref(book: { id: string; media_type?: string }) {
  return `${book.media_type === "cbz" ? "/media" : "/read"}/${book.id}`;
}

export function pageWindow(page: number, size = 24) {
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 100
  )
    throw new Error("Paginacao invalida.");
  return { from: page * size, to: page * size + size, size };
}
export function catalogPage<T>(rows: T[], size = 24) {
  return { items: rows.slice(0, size), hasMore: rows.length > size };
}
export function catalogSearch(value: string) {
  return value.replace(/[\%_]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Shared by client-side catalog and admin searches; never truncate indexed titles. */
export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}
