import type { CatalogOrder, ReadingState } from "./data/catalog";
import type { Format } from "./catalog";

export type CatalogContext = {
  search: string;
  page: number;
  readingState: ReadingState;
  order: CatalogOrder;
  scroll: number;
  category?: Format;
};
export const emptyCatalogContext: CatalogContext = {
  search: "",
  page: 0,
  readingState: "all",
  order: "recent",
  scroll: 0,
};
const prefix = "nook-catalog:";
export function catalogContextKey(ownerId: string, route: string) {
  return `${prefix}${ownerId}:${route}`;
}
export function parseCatalogContext(value: string | null): CatalogContext {
  try {
    const p = JSON.parse(value || "null");
    if (!p || typeof p !== "object") return { ...emptyCatalogContext };
    return {
      search: typeof p.search === "string" ? p.search.slice(0, 200) : "",
      page:
        Number.isInteger(p.page) && p.page >= 0 ? Math.min(p.page, 100000) : 0,
      readingState: ["unread", "reading", "completed"].includes(p.readingState)
        ? p.readingState
        : "all",
      order: ["title", "last-read"].includes(p.order) ? p.order : "recent",
      scroll: Number.isFinite(p.scroll) ? Math.max(0, p.scroll) : 0,
      category: ["novel", "manga", "manhwa"].includes(p.category)
        ? p.category
        : undefined,
    };
  } catch {
    return { ...emptyCatalogContext };
  }
}
export function clearCatalogContexts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* Context is optional when storage is unavailable. */
  }
}
