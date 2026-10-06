"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWorkPage } from "@/lib/data/catalog";
import type { Book, ReadingProgress, Volume } from "@/lib/types";

export function useReaderIndex(
  book: Pick<Book, "series_id"> | null,
  userId: string,
  open: boolean,
) {
  const [books, setBooks] = useState<Book[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const page = useRef(0);
  const pending = useRef(false);
  const generation = useRef(0);
  const seriesId = book?.series_id;
  const loadPage = useCallback(async () => {
    if (seriesId === undefined || pending.current || !hasMore) return;
    pending.current = true;
    const request = generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await getWorkPage(seriesId, page.current, userId);
      if (request !== generation.current) return;
      setBooks((previous) => [...previous, ...result.books]);
      setVolumes((previous) => [
        ...new Map(
          [...previous, ...result.volumes].map((volume) => [volume.id, volume]),
        ).values(),
      ]);
      setProgress((previous) => ({
        ...previous,
        ...Object.fromEntries(
          result.progress.map((item) => [item.book_id, item]),
        ),
      }));
      setHasMore(result.hasMore);
      page.current++;
    } catch {
      if (request === generation.current)
        setError(
          "Não foi possível carregar o índice da obra. Tente novamente.",
        );
    } finally {
      if (request === generation.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, [seriesId, hasMore, userId]);
  useEffect(() => {
    const requests = generation;
    return () => {
      requests.current++;
    };
  }, [userId]);
  useEffect(() => {
    if (!open || books.length || error || loading) return;
    const timer = setTimeout(() => void loadPage(), 0);
    return () => clearTimeout(timer);
  }, [open, books.length, error, loading, loadPage]);
  return { books, volumes, progress, hasMore, loading, error, loadPage };
}
