"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { SeriesCover } from "./series/series-cover";
import { supabase } from "@/lib/supabase";
import { formats, mediaHref, type Format } from "@/lib/catalog";
import { continuingWorks, readingActivity } from "@/lib/reading-activity";
import { readRows } from "@/lib/data/read-rows";
import { getPrivateCoverUrl } from "@/lib/cover-url";
import { listLocalProgress, mergeProgress } from "@/lib/local-progress";
import { Button } from "./ui/button";

type RecentEntry = {
  book_id: string;
  page_number: number;
  page_count: number | null;
  scroll_ratio: number;
  line_index?: number;
  completed: boolean;
  updated_at: string;
  books: {
    id: string;
    title: string;
    media_type: string;
    total_pages: number | null;
    chapter_number: number | null;
    chapter_title: string | null;
    content_type: string;
    series: {
      id: string;
      title: string;
      format: Format;
      cover_path: string | null;
    };
    volumes: { volume_number: number | null; title: string | null } | null;
  };
};

function position(entry: RecentEntry) {
  const activity = readingActivity(entry, entry.books);
  const page = Math.max(1, entry.page_number);
  return activity.completed
    ? { label: "Concluído", percent: 100 }
    : {
        label: activity.total
          ? `Página ${Math.min(page, activity.total)} de ${activity.total}`
          : `Página ${page}`,
        percent: activity.percent,
      };
}

function chapter(entry: RecentEntry) {
  const book = entry.books;
  const volume = book.volumes;
  if (book.content_type === "volume") {
    return volume?.volume_number != null
      ? `Volume ${volume.volume_number}`
      : volume?.title || book.title;
  }
  if (book.chapter_number != null) {
    const label = `Capítulo ${book.chapter_number}`;
    return volume?.volume_number != null
      ? `Vol. ${volume.volume_number} · ${label}`
      : label;
  }
  return book.chapter_title || book.title;
}

export function RecentHistory({
  userId,
  format,
  featured = false,
  full = false,
}: {
  userId: string;
  format?: Format;
  featured?: boolean;
  full?: boolean;
}) {
  const [result, setResult] = useState<{
    key: string;
    items: RecentEntry[];
    covers: Record<string, string>;
    error: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(full ? 24 : 6);
  const key = `${userId}:${format || "all"}`;
  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener("nook-progress-synced", refresh);
    window.addEventListener("nook-progress-changed", refresh);
    window.addEventListener("pageshow", refresh);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("nook-progress-synced", refresh);
      window.removeEventListener("nook-progress-changed", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => {
    let live = true;
    async function load() {
      setBusy(true);
      try {
        const api = supabase();
        // Paginate before grouping, with a fresh query for each page.
        // Inner joins enforce current catalog access through RLS.
        const data = await readRows<RecentEntry>(() => {
          let query = api
            .from("reading_progress")
            .select(
              "book_id,page_number,page_count,line_index,scroll_ratio,completed,updated_at,books!inner(id,title,media_type,total_pages,chapter_number,chapter_title,content_type,series!inner(id,title,format,cover_path),volumes(volume_number,title))",
            )
            .eq("owner_id", userId);
          if (format) query = query.eq("books.series.format", format);
          return query
            .order("updated_at", { ascending: false })
            .order("book_id")
            .returns<RecentEntry[]>();
        }, "Não foi possível carregar suas leituras.");
        if (!live) return;
        let items = mergeProgress(userId, data || []);
        const missing = listLocalProgress(userId).filter(
          (local) => !items.some((entry) => entry.book_id === local.book_id),
        );
        if (missing.length) {
          // Recheck catalog access through RLS; never resurrect a deleted or revoked work from cache.
          const localById = new Map(
            missing.map((local) => [local.book_id, local]),
          );
          for (let offset = 0; offset < missing.length; offset += 100) {
            const books = await api
              .from("books")
              .select(
                "id,title,media_type,total_pages,chapter_number,chapter_title,content_type,series!inner(id,title,format,cover_path),volumes(volume_number,title)",
              )
              .in(
                "id",
                missing
                  .slice(offset, offset + 100)
                  .map((local) => local.book_id),
              )
              .returns<RecentEntry["books"][]>();
            if (books.error) throw books.error;
            for (const book of books.data || []) {
              if (!book.series || (format && book.series.format !== format))
                continue;
              const local = localById.get(book.id);
              if (local)
                items.push({
                  ...local,
                  page_count: local.page_count || null,
                  books: book,
                });
            }
          }
        }
        items = items.sort(
          (a, b) =>
            b.updated_at.localeCompare(a.updated_at) ||
            a.book_id.localeCompare(b.book_id),
        );
        if (live)
          setResult((previous) => ({
            key,
            items,
            covers: previous?.key === key ? previous.covers : {},
            error: false,
          }));
      } catch {
        if (live)
          setResult((previous) =>
            previous?.key === key
              ? { ...previous, error: true }
              : { key, items: [], covers: {}, error: true },
          );
      } finally {
        if (live) setBusy(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [userId, format, key, attempt]);

  const resultItems = result?.items;
  const resultKey = result?.key;
  const allItems = useMemo(() => {
    if (!resultItems || resultKey !== key) return [];
    return full && showHistory ? resultItems : continuingWorks(resultItems);
  }, [resultItems, resultKey, key, full, showHistory]);
  const visibleItems = useMemo(
    () => allItems.slice(0, limit),
    [allItems, limit],
  );
  // Only sign covers that are actually displayed, including when history is paged.
  const pathsKey = JSON.stringify([
    ...new Set(
      visibleItems
        .map((entry) => entry.books.series.cover_path)
        .filter((path): path is string => Boolean(path)),
    ),
  ]);
  useEffect(() => {
    let live = true;
    const paths: string[] = JSON.parse(pathsKey);
    if (!paths.length) return;
    void Promise.all(
      paths.map(
        async (path) =>
          [
            path,
            await getPrivateCoverUrl(userId, path).catch(() => ""),
          ] as const,
      ),
    ).then((signed) => {
      if (live)
        setResult((previous) =>
          previous?.key === key
            ? { ...previous, covers: Object.fromEntries(signed) }
            : previous,
        );
    });
    return () => {
      live = false;
    };
  }, [pathsKey, userId, key, attempt]);

  if (!result || result.key !== key)
    return (
      <section
        className="recent-section history-loading"
        aria-label="Carregando histórico recente"
        aria-busy="true"
      >
        <span className="history-loading-title" />
        <div className="recent-grid">
          {[0, 1, 2].map((id) => (
            <div className="history-skeleton" key={id} />
          ))}
        </div>
      </section>
    );
  if (result.error && !result.items.length)
    return (
      <p className="history-error" role="status">
        Não foi possível carregar seu histórico.{" "}
        <button onClick={() => setAttempt((n) => n + 1)}>
          Tentar novamente
        </button>
      </p>
    );
  if (!allItems.length && !full)
    return (
      <section
        className="recent-section continuation-empty"
        aria-labelledby="recent-history-title"
      >
        <h2 id="recent-history-title">Continue de onde parou</h2>
        <p>Nenhuma leitura em andamento. Escolha uma história para começar.</p>
        <Link className="history-all" href="/library">
          Explorar biblioteca <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </section>
    );
  const empty = !allItems.length ? (
    <div className="empty-state">
      <h2>Nenhuma leitura em andamento</h2>
      <p>Escolha uma história para começar.</p>
      <Link className="primary-button" href="/library">
        Explorar biblioteca
      </Link>
    </div>
  ) : null;
  const current = featured ? visibleItems[0] : undefined;
  function renderEntry(entry: RecentEntry, prominent = false) {
    const book = entry.books;
    const progress = position(entry);
    const cover =
      book.series.cover_path && result?.covers[book.series.cover_path];
    return (
      <Link
        className={`history-card${prominent ? " history-featured" : ""}`}
        key={entry.book_id}
        href={`${mediaHref(book)}${readingActivity(entry, book).completed ? "?restart=1" : ""}`}
      >
        <div className="history-cover">
          <SeriesCover
            title={book.series.title}
            src={cover || undefined}
            compact
          />
        </div>
        <div className="history-copy">
          <span className="history-format">
            {prominent ? "Sua leitura atual · " : ""}
            {formats[book.series.format]}
          </span>
          <h3>{book.series.title}</h3>
          <p className="history-chapter">{chapter(entry)}</p>
          <div className="history-position">
            <span>{progress.label}</span>
            {progress.percent !== null && <span>{progress.percent}%</span>}
          </div>
          {progress.percent !== null && (
            <div
              className="history-progress"
              role="progressbar"
              aria-label={`Progresso de ${book.series.title}`}
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress.percent}%` }} />
            </div>
          )}
          <span className="history-action">
            {readingActivity(entry, book).completed
              ? "Ler novamente"
              : "Continuar lendo"}
            <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </div>
      </Link>
    );
  }
  return (
    <section
      id="continue-reading"
      className="recent-section"
      aria-labelledby="recent-history-title"
    >
      {result.error && (
        <p className="history-error" role="status">
          Não foi possível atualizar o histórico.{" "}
          <Button
            variant="ghost"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tentar novamente
          </Button>
        </p>
      )}
      <div className="recent-heading">
        <h2 id="recent-history-title">
          {full && showHistory
            ? "Histórico de leitura"
            : "Continue de onde parou"}
        </h2>
        {!full && (
          <Link className="history-all" href="/continue">
            Ver todas <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      {full && (
        <div
          className="catalog-segments"
          role="group"
          aria-label="Exibição das leituras"
        >
          <button
            aria-pressed={!showHistory}
            onClick={() => {
              setShowHistory(false);
              setLimit(24);
            }}
          >
            Em andamento
          </button>
          <button
            aria-pressed={showHistory}
            onClick={() => {
              setShowHistory(true);
              setLimit(24);
            }}
          >
            Histórico completo
          </button>
        </div>
      )}
      {empty}
      {current && renderEntry(current, true)}
      {visibleItems.some((entry) => entry !== current) && (
        <div
          className={`recent-grid${current ? " recent-secondary" : ""}`}
          tabIndex={0}
          aria-label="Leituras para continuar"
        >
          {visibleItems
            .filter((entry) => entry !== current)
            .map((entry) => renderEntry(entry))}
        </div>
      )}
      {full && allItems.length > limit && (
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => setLimit((value) => value + 24)}
        >
          Mostrar mais leituras
        </Button>
      )}
    </section>
  );
}
