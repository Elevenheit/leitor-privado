import type { ReadingProgress } from "./types";

export type LocalProgress = ReadingProgress & {
  pending: boolean;
  page_offset?: number;
};
const prefix = "nook-progress:v1:";

function key(ownerId: string, bookId: string) {
  return `${prefix}${encodeURIComponent(ownerId)}:${encodeURIComponent(bookId)}`;
}

export function readLocalProgress(
  ownerId: string,
  bookId: string,
): LocalProgress | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(key(ownerId, bookId)) || "null",
    );
    if (
      !value ||
      value.owner_id !== ownerId ||
      value.book_id !== bookId ||
      !Number.isInteger(value.page_number) ||
      value.page_number < 1 ||
      !Number.isFinite(value.scroll_ratio) ||
      value.scroll_ratio < 0 ||
      value.scroll_ratio > 1 ||
      !Number.isFinite(Date.parse(value.updated_at))
    )
      return null;
    return {
      owner_id: ownerId,
      book_id: bookId,
      page_number: value.page_number,
      line_index:
        Number.isInteger(value.line_index) && value.line_index >= 0
          ? value.line_index
          : 0,
      reading_mode: value.reading_mode === "text" ? "text" : "page",
      scroll_ratio: value.scroll_ratio,
      updated_at: value.updated_at,
      completed: value.completed === true,
      pending: value.pending === true,
      page_count:
        Number.isInteger(value.page_count) && value.page_count > 0
          ? value.page_count
          : null,
      page_offset: Number.isFinite(value.page_offset)
        ? Math.min(1, Math.max(0, value.page_offset))
        : undefined,
      text_offset:
        Number.isSafeInteger(value.text_offset) && value.text_offset >= 0
          ? value.text_offset
          : undefined,
    };
  } catch {
    return null;
  }
}

/** Only positions are cached: never private URLs, account tokens or media files. */
export function writeLocalProgress(value: LocalProgress) {
  try {
    localStorage.setItem(
      key(value.owner_id, value.book_id),
      JSON.stringify(value),
    );
    return true;
  } catch {
    return false;
  }
}

export function removeLocalProgress(ownerId: string, bookId: string) {
  try {
    localStorage.removeItem(key(ownerId, bookId));
  } catch {
    /* Optional storage. */
  }
}

export function mergeAccessibleProgress<
  T extends Pick<ReadingProgress, "book_id" | "updated_at">,
>(ownerId: string, rows: T[], accessible: Set<string>): T[] {
  const locals = new Map(
    listLocalProgress(ownerId).map((value) => [value.book_id, value]),
  );
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const row of rows) {
    if (!accessible.has(row.book_id)) continue;
    seen.add(row.book_id);
    const local = locals.get(row.book_id);
    merged.push(
      local && local.updated_at >= row.updated_at ? { ...row, ...local } : row,
    );
  }
  for (const local of locals.values())
    if (accessible.has(local.book_id) && !seen.has(local.book_id))
      merged.push(local as unknown as T);
  return merged;
}

export function listLocalProgress(ownerId: string) {
  const items: LocalProgress[] = [];
  try {
    const scope = `${prefix}${encodeURIComponent(ownerId)}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(scope)) continue;
      const value = readLocalProgress(
        ownerId,
        decodeURIComponent(name.slice(scope.length)),
      );
      if (value) items.push(value);
    }
  } catch {
    /* Storage may be unavailable. Remote persistence still works. */
  }
  return items;
}

export function mergeProgress<
  T extends Pick<ReadingProgress, "book_id" | "updated_at">,
>(ownerId: string, rows: T[]): T[] {
  return rows.map((row) => {
    const local = readLocalProgress(ownerId, row.book_id);
    return local && local.updated_at >= row.updated_at
      ? { ...row, ...local }
      : row;
  });
}
