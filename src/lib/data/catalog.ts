import { pageWindow, catalogPage, catalogSearch, type Format } from "@/lib/catalog";
import { supabase } from "@/lib/supabase";
import type { Book, Series, Volume } from "@/lib/types";
import { throwOnError } from "./errors";

export async function listCatalogSeries(ownerId: string) {
  const result = await supabase().from("series").select("id,owner_id,title,description,cover_path,created_at,updated_at,format,tags,rights_note,beta_visible").eq("owner_id", ownerId).order("title");
  return throwOnError(result, "Não foi possível carregar o catálogo.") as Series[];
}

export async function getCatalogSeries(id: string, ownerId: string) {
  const result = await supabase().from("series").select("id,owner_id,title,description,cover_path,created_at,updated_at,format,tags,rights_note,beta_visible").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  return throwOnError(result, "Não foi possível carregar a obra.") as Series | null;
}

export async function listSeriesBooks(id: string, ownerId: string) {
  const result = await supabase().from("books").select("id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type").eq("series_id", id).eq("owner_id", ownerId).order("sort_order").order("chapter_number");
  return throwOnError(result, "Não foi possível carregar os capítulos.") as Book[];
}

export async function listSeriesVolumes(id: string, ownerId: string) {
  const result = await supabase().from("volumes").select("id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at").eq("series_id", id).eq("owner_id", ownerId).order("sort_order").order("volume_number");
  return throwOnError(result, "Não foi possível carregar os volumes.") as Volume[];
}

export async function listCatalogPage(options: { ownerId: string; page: number; format?: Format; favoritesOnly?: boolean; search?: string }) {
  const api = supabase();
  const window = pageWindow(options.page);
  const columns = "id,title,description,cover_path,format,created_at";
  let query = api.from("series").select(options.favoritesOnly ? `${columns},favorites!inner(owner_id)` : columns)
    .order("created_at", { ascending: false }).order("id").range(window.from, window.to);
  if (options.format) query = query.eq("format", options.format);
  if (options.favoritesOnly) query = query.eq("favorites.owner_id", options.ownerId);
  const term = catalogSearch(options.search || "");
  if (term) query = query.ilike("title", `%${term}%`);
  const result = await query.returns<Series[]>();
  const page = catalogPage(throwOnError(result, "Nao foi possivel carregar o catalogo.") || []);
  const ids = page.items.map((item) => item.id);
  const favorites = ids.length ? await api.from("favorites").select("series_id").eq("owner_id", options.ownerId).in("series_id", ids) : { data: [], error: null };
  const favoriteIds = (throwOnError(favorites, "Nao foi possivel carregar favoritos.") || []).map((item) => item.series_id);
  return { ...page, favoriteIds };
}
