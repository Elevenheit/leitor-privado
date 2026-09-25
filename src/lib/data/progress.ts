import { supabase } from "@/lib/supabase";
import type { ReadingProgress } from "@/lib/types";
import { throwOnError } from "./errors";

export type ProgressUpdate = Partial<Pick<ReadingProgress, "page_number" | "line_index" | "scroll_ratio" | "reading_mode" | "position_seconds" | "completed">>;

const saveQueues = new Map<string, Promise<void>>();

export async function listReadingProgress(ownerId: string) {
  const result = await supabase().from("reading_progress").select("*").eq("owner_id", ownerId);
  return throwOnError(result, "Não foi possível carregar seu progresso.") as ReadingProgress[];
}

export async function saveReadingProgress(ownerId: string, bookId: string, update: ProgressUpdate) {
  const key = `${ownerId}:${bookId}`;
  const previous = saveQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const result = await supabase().from("reading_progress").upsert({ owner_id: ownerId, book_id: bookId, ...update, updated_at: new Date().toISOString() });
    throwOnError(result, "Falha ao salvar seu progresso.");
  });
  saveQueues.set(key, current);
  try {
    await current;
  } finally {
    if (saveQueues.get(key) === current) saveQueues.delete(key);
  }
}
