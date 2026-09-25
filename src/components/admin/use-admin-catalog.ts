"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Book, ReadingProgress, Series, Volume } from "@/lib/types";

export function useAdminCatalog(ownerId: string) {
  const [books, setBooks] = useState<Book[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const api = supabase();
    const [bookResult, seriesResult, volumeResult, favoriteResult] = await Promise.all([
      api.from("books").select("id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type,skip_intro,intro_end").eq("owner_id", ownerId).order("created_at", { ascending: false }),
      api.from("series").select("id,owner_id,title,description,cover_path,created_at,updated_at,format,tags,rights_note,beta_visible").eq("owner_id", ownerId).order("title"),
      api.from("volumes").select("id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at").eq("owner_id", ownerId).order("sort_order").order("volume_number"),
      api.from("favorites").select("series_id").eq("owner_id", ownerId),
    ]);
    const bookIds = (bookResult.data || []).map((book) => book.id);
    const progressResult = bookIds.length
      ? await api.from("reading_progress").select("owner_id,book_id,page_number,line_index,scroll_ratio,reading_mode,updated_at,completed,position_seconds").eq("owner_id", ownerId).in("book_id", bookIds)
      : { data: [], error: null };
    const failure = bookResult.error || seriesResult.error || volumeResult.error || progressResult.error || favoriteResult.error;
    if (failure) {
      setError(failure.message);
      setLoading(false);
      return;
    }

    const nextBooks = (bookResult.data || []) as Book[];
    const nextSeries = (seriesResult.data || []).map((item) => ({
      ...item,
      is_favorite: (favoriteResult.data || []).some((favorite) => favorite.series_id === item.id),
    })) as Series[];
    setBooks(nextBooks);
    setSeries(nextSeries);
    setVolumes((volumeResult.data || []) as Volume[]);
    setProgress(Object.fromEntries(((progressResult.data || []) as ReadingProgress[]).map((item) => [item.book_id, item])));
    setError("");
    const signedCovers = await Promise.all(nextSeries.filter((item) => item.cover_path).map(async (item) => {
      const { data } = await api.storage.from("covers").createSignedUrl(item.cover_path!, 3600);
      return [item.id, data?.signedUrl || ""] as const;
    }));
    setCoverUrls(Object.fromEntries(signedCovers.filter(([, url]) => url)));
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return { books, setBooks, series, setSeries, volumes, setVolumes, progress, loading, coverUrls, load, error, setError };
}
