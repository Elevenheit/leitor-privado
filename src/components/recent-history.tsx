"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { SeriesCover } from "./series/series-cover";
import { supabase } from "@/lib/supabase";
import { formats, mediaHref, type Format } from "@/lib/catalog";
import { calculateReadingProgress } from "@/lib/media-rules";
import { getPrivateCoverUrl } from "@/lib/cover-url";

type RecentEntry = {
  book_id: string;
  page_number: number;
  page_count: number | null;
  scroll_ratio: number;
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
  if (entry.completed) return { label: "Concluído", percent: 100 };
  const total = entry.books.total_pages || entry.page_count;
  const page = Math.max(1, entry.page_number);
  const measured = calculateReadingProgress({
    mediaType: entry.books.media_type === "cbz" ? "cbz" : "pdf",
    pageNumber: page,
    totalPages: total,
    scrollRatio: entry.scroll_ratio,
  });
  if (measured.completed) return { label: "Concluído", percent: 100 };
  return total && total > 0
    ? {
        label: `Página ${Math.min(page, total)} de ${total}`,
        percent: measured.percent,
      }
    : { label: `Página ${page}`, percent: null };
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
}: {
  userId: string;
  format?: Format;
  featured?: boolean;
}) {
  const [result, setResult] = useState<{
    key: string;
    items: RecentEntry[];
    covers: Record<string, string>;
    error: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${format || "all"}`;
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const api = supabase();
        // Inner joins exclude inaccessible/deleted works before the limit.
        let query = api
          .from("reading_progress")
          .select(
            "book_id,page_number,page_count,scroll_ratio,completed,updated_at,books!inner(id,title,media_type,total_pages,chapter_number,chapter_title,content_type,series!inner(id,title,format,cover_path),volumes(volume_number,title))",
          )
          .eq("owner_id", userId);
        if (format) query = query.eq("books.series.format", format);
        const { data, error } = await query
          .order("updated_at", { ascending: false })
          .order("book_id")
          .limit(6)
          .returns<RecentEntry[]>();
        if (error) throw error;
        if (!live) return;
        const items = data || [];
        const paths = [
          ...new Set(
            items
              .map((entry) => entry.books.series.cover_path)
              .filter((path): path is string => Boolean(path)),
          ),
        ];
        const signed = await Promise.all(
          paths.map(async (path) => {
            return [
              path,
              await getPrivateCoverUrl(userId, path).catch(() => ""),
            ] as const;
          }),
        );
        if (live)
          setResult({
            key,
            items,
            covers: Object.fromEntries(signed),
            error: false,
          });
      } catch {
        if (live) setResult({ key, items: [], covers: {}, error: true });
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [userId, format, key, attempt]);

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
  if (result.error)
    return (
      <p className="history-error" role="status">
        Não foi possível carregar seu histórico.{" "}
        <button onClick={() => setAttempt((n) => n + 1)}>
          Tentar novamente
        </button>
      </p>
    );
  if (!result.items.length) return null;
  const current = featured
    ? result.items.find(
        (entry) => !entry.completed && position(entry).percent !== 100,
      )
    : undefined;
  function renderEntry(entry: RecentEntry, prominent = false) {
    const book = entry.books;
    const progress = position(entry);
    const cover =
      book.series.cover_path && result?.covers[book.series.cover_path];
    return (
      <Link
        className={`history-card${prominent ? " history-featured" : ""}`}
        key={entry.book_id}
        href={mediaHref(book)}
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
            {entry.completed ? "Ler novamente" : "Continuar lendo"}
            <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </div>
      </Link>
    );
  }
  return (
    <section className="recent-section" aria-labelledby="recent-history-title">
      <div className="recent-heading">
        <h2 id="recent-history-title">
          {current ? "Volte à sua história" : "Seu histórico recente"}
        </h2>
      </div>
      {current && renderEntry(current, true)}
      {result.items.some((entry) => entry !== current) && (
        <div
          className={`recent-grid${current ? " recent-secondary" : ""}`}
          tabIndex={0}
          aria-label="Itens do histórico recente"
        >
          {result.items
            .filter((entry) => entry !== current)
            .map((entry) => renderEntry(entry))}
        </div>
      )}
    </section>
  );
}
