"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Book, ReadingProgress } from "@/lib/types";

export function useReaderIndex(book: Pick<Book, "series_id"> | null, userId: string, open: boolean) {
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(async () => {
    if (!book || loading || !hasMore) return;
    setLoading(true);
    try {
      const api = supabase();
      let query = api.from("books").select("id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type");
      query = book.series_id ? query.eq("series_id", book.series_id) : query.is("series_id", null);
      const result = await query.order("sort_order").order("chapter_number").order("id").range(books.length, books.length + 99);
      if (result.error) throw result.error;
      const rows = (result.data || []) as Book[];
      if (rows.length) {
        const saved = await api.from("reading_progress")
          .select("owner_id,book_id,page_number,line_index,scroll_ratio,reading_mode,updated_at,completed")
          .eq("owner_id", userId).in("book_id", rows.map(item => item.id));
        if (saved.error) throw saved.error;
        setBooks(previous => [...previous, ...rows]);
        setProgress(previous => ({ ...previous, ...Object.fromEntries(((saved.data || []) as ReadingProgress[]).map(item => [item.book_id, item])) }));
      }
      setHasMore(rows.length === 100);
    } catch {
      setError("Não foi possível carregar o índice da obra.");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [book, books.length, hasMore, loading, userId]);

  useEffect(() => {
    if (!open || books.length || !hasMore || loading) return;
    const timer = setTimeout(() => void loadPage(), 0);
    return () => clearTimeout(timer);
  }, [open, books.length, hasMore, loading, loadPage]);

  return { books, progress, hasMore, loading, error, loadPage };
}
