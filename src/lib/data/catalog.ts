import { supabase } from "@/lib/supabase";
import type { Book, Series, Volume } from "@/lib/types";
import { throwOnError } from "./errors";

export async function listCatalogSeries(ownerId: string) {
  const result = await supabase().from("series").select("*").eq("owner_id", ownerId).order("title");
  return throwOnError(result, "Não foi possível carregar o catálogo.") as Series[];
}

export async function getCatalogSeries(id: string, ownerId: string) {
  const result = await supabase().from("series").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  return throwOnError(result, "Não foi possível carregar a obra.") as Series | null;
}

export async function listSeriesBooks(id: string, ownerId: string) {
  const result = await supabase().from("books").select("*").eq("series_id", id).eq("owner_id", ownerId).order("sort_order").order("chapter_number");
  return throwOnError(result, "Não foi possível carregar os capítulos.") as Book[];
}

export async function listSeriesVolumes(id: string, ownerId: string) {
  const result = await supabase().from("volumes").select("*").eq("series_id", id).eq("owner_id", ownerId).order("sort_order").order("volume_number");
  return throwOnError(result, "Não foi possível carregar os volumes.") as Volume[];
}
