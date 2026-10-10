import { supabase } from "@/lib/supabase";
import type { ReadingProgress } from "@/lib/types";
import { throwOnError, toDataError } from "./errors";
import { invalidateCatalogSnapshot } from "./catalog-cache";
import {
  readLocalProgress,
  writeLocalProgress,
  listLocalProgress,
  mergeProgress,
  removeLocalProgress,
  type LocalProgress,
} from "@/lib/local-progress";

export type ProgressUpdate = Partial<
  Pick<
    ReadingProgress,
    | "page_number"
    | "line_index"
    | "scroll_ratio"
    | "reading_mode"
    | "completed"
    | "page_count"
    | "page_offset"
    | "text_offset"
  >
>;

const saveQueues = new Map<string, Promise<{ synced: boolean }>>();
const syncQueues = new Map<string, Promise<number>>();

export class ProgressConflictError extends Error {
  constructor() {
    super(
      "A posição salva mudou desde a abertura deste capítulo. Recarregue para continuar da posição mais recente.",
    );
    this.name = "ProgressConflictError";
  }
}

export async function listReadingProgress(ownerId: string) {
  const result = await supabase()
    .from("reading_progress")
    .select(
      "book_id,owner_id,page_number,line_index,scroll_ratio,reading_mode,updated_at,completed",
    )
    .eq("owner_id", ownerId);
  return mergeProgress(
    ownerId,
    throwOnError(
      result,
      "Não foi possível carregar seu progresso.",
    ) as ReadingProgress[],
  );
}

export async function loadReadingProgress(ownerId: string, bookId: string) {
  try {
    const result = await supabase()
      .from("reading_progress")
      .select(
        "owner_id,book_id,page_number,line_index,scroll_ratio,reading_mode,page_count,page_offset,text_offset,updated_at,completed",
      )
      .eq("owner_id", ownerId)
      .eq("book_id", bookId)
      .maybeSingle();
    const remote = throwOnError(
      result,
      "Não foi possível carregar seu progresso.",
    ) as ReadingProgress | null;
    if (remote) {
      remote.page_offset = remote.page_offset ?? undefined;
      remote.text_offset = remote.text_offset ?? undefined;
    }
    // Reading may continue while this GET is in flight (also in another tab).
    const local = readLocalProgress(ownerId, bookId);
    if (local && (!remote || local.updated_at >= remote.updated_at))
      return local;
    if (remote) writeLocalProgress({ ...remote, pending: false });
    return remote;
  } catch (cause) {
    const local = readLocalProgress(ownerId, bookId);
    if (local) return local;
    throw cause;
  }
}

export function syncPendingProgress(ownerId: string) {
  const existing = syncQueues.get(ownerId);
  if (existing) return existing;
  const current = replayPendingProgress(ownerId).finally(() => {
    if (syncQueues.get(ownerId) === current) syncQueues.delete(ownerId);
  });
  syncQueues.set(ownerId, current);
  return current;
}

async function replayPendingProgress(ownerId: string) {
  let synced = 0;
  for (const local of listLocalProgress(ownerId).filter(
    (value) => value.pending,
  )) {
    // A newer position from another device wins over an old offline write.
    const latest = await loadReadingProgress(ownerId, local.book_id);
    if (!latest || latest.updated_at > local.updated_at) continue;
    if (
      readLocalProgress(ownerId, local.book_id)?.updated_at !== local.updated_at
    )
      continue;
    // Reconnecting is not new reading activity. Keep the offline timestamp so
    // a concurrent device write after the GET can still win at the database.
    const result = await persistProgressSnapshot(local);
    if (!result.synced) break;
    synced++;
  }
  return synced;
}

export async function saveReadingProgress(
  ownerId: string,
  bookId: string,
  update: ProgressUpdate,
) {
  const cached = readLocalProgress(ownerId, bookId);
  const snapshot = {
    page_number: cached?.page_number || 1,
    line_index: cached?.line_index || 0,
    scroll_ratio: cached?.scroll_ratio || 0,
    reading_mode: cached?.reading_mode || "page",
    ...update,
    completed: Boolean(cached?.completed || update.completed),
    owner_id: ownerId,
    book_id: bookId,
    updated_at: new Date(
      Math.max(Date.now(), Date.parse(cached?.updated_at || "") + 1 || 0),
    ).toISOString(),
    pending: true,
  } satisfies LocalProgress;
  return persistProgressSnapshot(snapshot);
}

async function persistProgressSnapshot(snapshot: LocalProgress) {
  const { owner_id: ownerId, book_id: bookId } = snapshot;
  const key = `${ownerId}:${bookId}`;
  // Synchronous write survives pagehide even if the network request is cancelled.
  const localSaved = writeLocalProgress(snapshot);
  invalidateCatalogSnapshot();
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("nook-progress-changed"));
  const previous = saveQueues.get(key) || Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      const { pending: _pending, ...remote } = snapshot;
      void _pending;
      let result;
      try {
        result = await supabase()
          .from("reading_progress")
          .upsert({
            ...remote,
          });
      } catch (cause) {
        if (
          localSaved &&
          toDataError(cause, "Falha ao salvar.").kind === "network"
        )
          return { synced: false };
        throw cause;
      }
      if (result.error?.code === "40001") {
        if (
          readLocalProgress(ownerId, bookId)?.updated_at === snapshot.updated_at
        )
          removeLocalProgress(ownerId, bookId);
        throw new ProgressConflictError();
      }
      if (
        result.error &&
        localSaved &&
        (toDataError(result.error, "Falha ao salvar.").kind === "network" ||
          result.error.code === "FETCH")
      )
        return { synced: false };
      throwOnError(result, "Falha ao salvar seu progresso.");
      invalidateCatalogSnapshot();
      if (
        readLocalProgress(ownerId, bookId)?.updated_at === snapshot.updated_at
      )
        writeLocalProgress({ ...snapshot, pending: false });
      return { synced: true };
    });
  saveQueues.set(key, current);
  try {
    return await current;
  } finally {
    if (saveQueues.get(key) === current) saveQueues.delete(key);
  }
}
