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
