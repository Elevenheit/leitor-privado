import { supabase } from "@/lib/supabase";
import { throwOnError } from "./errors";

export async function listAdminCatalog(ownerId: string) {
  const api = supabase();
  const results = await Promise.all([
    api.from("books").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }),
    api.from("series").select("*").eq("owner_id", ownerId).order("title"),
    api.from("volumes").select("*").eq("owner_id", ownerId).order("sort_order").order("volume_number"),
  ]);
  return {
    books: throwOnError(results[0], "Não foi possível carregar os arquivos."),
    series: throwOnError(results[1], "Não foi possível carregar as obras."),
    volumes: throwOnError(results[2], "Não foi possível carregar os volumes."),
  };
}
