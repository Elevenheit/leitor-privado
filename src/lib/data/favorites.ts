import { supabase } from "@/lib/supabase";
import { throwOnError } from "./errors";

export async function listFavoriteIds(ownerId: string): Promise<string[]> {
  const result = await supabase().from("favorites").select("series_id").eq("owner_id", ownerId);
  return (throwOnError(result, "Não foi possível carregar sua lista.") || []).map((row) => row.series_id);
}

export async function setFavorite(ownerId: string, seriesId: string, enabled: boolean) {
  const result = enabled
    ? await supabase().from("favorites").upsert({ owner_id: ownerId, series_id: seriesId })
    : await supabase().from("favorites").delete().eq("owner_id", ownerId).eq("series_id", seriesId);
  throwOnError(result, "Não foi possível atualizar sua lista.");
}
