"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPrivateCoverUrl } from "@/lib/cover-url";
import { listAdminWorks, type AdminSeries } from "@/lib/data/admin";
import { toDataError } from "@/lib/data/errors";
import type { Book } from "@/lib/types";

export function useAdminCatalog(
  ownerId: string,
  page: number,
  query: string,
  favoritesOnly: boolean,
) {
  const [books, setBooks] = useState<Book[]>([]);
  const [series, setSeries] = useState<AdminSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [counts, setCounts] = useState({
    totalCount: 0,
    looseCount: 0,
    fileCount: 0,
    hasMore: false,
  });
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const result = await listAdminWorks(page, query, favoritesOnly, ownerId);
      const covers = await Promise.all(
        result.items
          .filter((item) => item.cover_path)
          .map(
            async (item) =>
              [
                item.id,
                await getPrivateCoverUrl(ownerId, item.cover_path!).catch(
                  () => "",
                ),
              ] as const,
          ),
      );
      if (request !== generation.current) return;
      setBooks(result.looseBooks);
      setSeries(result.items);
      setCounts(result);
      setCoverUrls(Object.fromEntries(covers));
    } catch (cause) {
      if (request === generation.current)
        setError(
          toDataError(cause, "Não foi possível carregar o acervo.").message,
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [ownerId, page, query, favoritesOnly]);
  useEffect(() => {
    const requests = generation;
    const timer = setTimeout(() => {
      setError("");
      void load();
    }, 250);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);
  return {
    books,
    setBooks,
    series,
    setSeries,
    loading,
    coverUrls,
    load,
    error,
    setError,
    ...counts,
  };
}
