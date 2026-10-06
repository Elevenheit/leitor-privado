"use client";
import {
  listCatalogPage,
  type CatalogSeries,
  type CatalogOrder,
  type ReadingState,
} from "@/lib/data/catalog";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BookOpen, Search, X } from "lucide-react";
import { getPrivateCoverUrl } from "@/lib/cover-url";
import { setFavorite } from "@/lib/data/favorites";
import { toDataError } from "@/lib/data/errors";
import { formats, type Format } from "@/lib/catalog";
import { catalogContextKey, parseCatalogContext } from "@/lib/catalog-context";
import { Nav } from "./nav";
import { RecentHistory } from "./recent-history";
import { SeriesCover } from "./series/series-cover";
export function Catalog({
  user,
  format,
  list = false,
}: {
  user: User;
  format?: Format;
  list?: boolean;
}) {
  return (
    <CatalogView
      key={`${user.id}:${format || "all"}:${list}`}
      user={user}
      format={format}
      list={list}
    />
  );
}
function CatalogView({
  user,
  format,
  list,
}: {
  user: User;
  format?: Format;
  list: boolean;
}) {
  const [items, setItems] = useState<CatalogSeries[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [favs, setFavs] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [readingState, setReadingState] = useState<ReadingState>("all");
  const [order, setOrder] = useState<CatalogOrder>("recent");
  const [total, setTotal] = useState(0);
  const [restored, setRestored] = useState(false);
  const restoreScroll = useRef<number | null>(null);
  const pendingFavorites = useRef(new Set<string>());
  const contextKey = catalogContextKey(
    user.id,
    list ? "/list" : format ? `/category/${format}` : "/",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [favoriteBusy, setFavoriteBusy] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      let context = parseCatalogContext(null);
      try {
        context = parseCatalogContext(sessionStorage.getItem(contextKey));
      } catch {
        /* Optional context. */
      }
      setQ(context.search);
      setPage(context.page);
      setReadingState(context.readingState);
      setOrder(context.order);
      restoreScroll.current = context.scroll;
      setRestored(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [contextKey]);
  useEffect(() => {
    if (!restored) return;
    const persist = () => {
      try {
        sessionStorage.setItem(
          contextKey,
          JSON.stringify({
            search: q,
            page,
            readingState,
            order,
            scroll: restoreScroll.current ?? window.scrollY,
          }),
        );
        sessionStorage.setItem(
          catalogContextKey(user.id, "last-route"),
          list ? "/list" : format ? `/category/${format}` : "/",
        );
      } catch {
        /* Optional context. */
      }
    };
    persist();
    window.addEventListener("scroll", persist, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => {
      persist();
      window.removeEventListener("scroll", persist);
      window.removeEventListener("pagehide", persist);
    };
  }, [
    contextKey,
    restored,
    q,
    page,
    readingState,
    order,
    user.id,
    list,
    format,
  ]);
  useEffect(() => {
    if (loading || error || !restored || restoreScroll.current === null) return;
    const frame = requestAnimationFrame(() => {
      const y = restoreScroll.current;
      restoreScroll.current = null;
      if (y !== null) window.scrollTo({ top: y, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, error, restored]);
  useEffect(() => {
    if (!restored) return;
    let live = true;
    async function load() {
      let adjustingPage = false;
      setLoading(true);
      setError("");
      try {
        const result = await listCatalogPage({
          ownerId: user.id,
          page,
          format,
          favoritesOnly: list,
          search: q,
          readingState,
          order,
        });
        if (!live) return;
        if (page > 0 && page * 24 >= result.totalCount) {
          adjustingPage = true;
          setPage(Math.max(0, Math.ceil(result.totalCount / 24) - 1));
          return;
        }
        const rows = result.items;
        setFavs(result.favoriteIds);
        setItems(rows);
        setMore(result.hasMore);
        setTotal(result.totalCount);
        const c = await Promise.all(
          rows
            .filter((x) => x.cover_path)
            .map(async (x) => {
              return [
                x.id,
                await getPrivateCoverUrl(user.id, x.cover_path!).catch(
                  () => "",
                ),
              ];
            }),
        );
        if (live) setCovers(Object.fromEntries(c));
      } catch {
        if (live)
          setError(
            "Não foi possível carregar a biblioteca. Confira a conexão e tente novamente.",
          );
      } finally {
        if (live && !adjustingPage) setLoading(false);
      }
    }
    const timer = setTimeout(() => void load(), 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [user.id, format, list, q, page, attempt, readingState, order, restored]);
  async function favorite(id: string) {
    if (pendingFavorites.current.has(id)) return;
    pendingFavorites.current.add(id);
    const had = favs.includes(id);
    setFavoriteBusy((old) => [...old, id]);
    try {
      await setFavorite(user.id, id, !had);
      setFavs((old) => (had ? old.filter((x) => x !== id) : [...old, id]));
      if (list && had) {
        setLoading(true);
        setAttempt((n) => n + 1);
      }
    } catch (cause) {
      setError(
        toDataError(cause, "Nao foi possivel salvar sua lista.").message,
      );
    } finally {
      pendingFavorites.current.delete(id);
      setFavoriteBusy((old) => old.filter((x) => x !== id));
    }
  }
  return (
    <>
      <Nav />
      <main
        id="main-content"
        tabIndex={-1}
        className="dashboard beta-dashboard"
      >
        <header className="catalog-heading">
          <span className="eyebrow">Sua biblioteca particular</span>
          <h1>{format ? formats[format] : list ? "Minha lista" : "Início"}</h1>
        </header>
        <div className="catalog-topbar" role="search" aria-label="Buscar obras">
          <label className="search catalog-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label={
                format
                  ? `Buscar em ${formats[format]}`
                  : "Busca global de obras"
              }
              placeholder={
                format ? `Buscar em ${formats[format]}...` : "Buscar no Nook"
              }
              value={q}
              onChange={(e) => {
                setLoading(true);
                setQ(e.target.value);
                setPage(0);
              }}
            />
            {q && (
              <button
                type="button"
                className="icon-button"
                aria-label="Limpar busca"
                onClick={() => {
                  setLoading(true);
                  setQ("");
                  setPage(0);
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>
          <label className="catalog-select">
            Situação
            <select
              aria-label="Situação da leitura"
              value={readingState}
              onChange={(e) => {
                setLoading(true);
                setReadingState(e.target.value as ReadingState);
                setPage(0);
              }}
            >
              <option value="all">Todas as obras</option>
              <option value="unread">Não iniciadas</option>
              <option value="reading">Em leitura</option>
              <option value="completed">Concluídas</option>
            </select>
          </label>
          <label className="catalog-select">
            Ordenar por
            <select
              aria-label="Ordenar obras"
              value={order}
              onChange={(e) => {
                setLoading(true);
                setOrder(e.target.value as CatalogOrder);
                setPage(0);
              }}
            >
              <option value="recent">Adição recente</option>
              <option value="title">Título</option>
              <option value="last-read">Última leitura</option>
            </select>
          </label>
          {(q || readingState !== "all" || order !== "recent") && (
            <button
              className="secondary-button"
              onClick={() => {
                setLoading(true);
                setQ("");
                setReadingState("all");
                setOrder("recent");
                setPage(0);
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        {!list && !q && readingState === "all" && page === 0 && (
          <RecentHistory userId={user.id} format={format} featured={!format} />
        )}
        <section
          className="library-section"
          aria-labelledby="catalog-section-title"
          aria-busy={loading}
        >
          <div className="section-head catalog-section-head">
            <h2 id="catalog-section-title">
              {q
                ? "Resultados da busca"
                : readingState !== "all"
                  ? {
                      unread: "Para começar",
                      reading: "Em leitura",
                      completed: "Histórias concluídas",
                    }[readingState]
                  : order === "title"
                    ? "Todos os títulos"
                    : order === "last-read"
                      ? "Na ordem da sua leitura"
                      : format
                        ? "Todos os títulos"
                        : list
                          ? "Guardados por você"
                          : "Adicionados recentemente"}
            </h2>
            {!loading && !error && (
              <span className="catalog-count">
                {total} {total === 1 ? "obra" : "obras"}
              </span>
            )}
          </div>
          {error && (
            <p className="error catalog-error" role="alert">
              {error}
              <button
                className="secondary-button"
                onClick={() => {
                  setLoading(true);
                  setAttempt((n) => n + 1);
                }}
              >
                Tentar novamente
              </button>
            </p>
          )}
          {loading ? (
            <div className="catalog-loading">
              <p role="status">Organizando suas histórias…</p>
              <div className="series-grid beta-covers" aria-hidden="true">
                {[0, 1, 2, 3].map((id) => (
                  <div className="catalog-skeleton" key={id} />
                ))}
              </div>
            </div>
          ) : !items.length && !error ? (
            <div className="empty-state catalog-empty" role="status">
              <BookOpen size={27} strokeWidth={1.4} aria-hidden="true" />
              <h3>
                {q || readingState !== "all"
                  ? "Nenhuma obra encontrada."
                  : list
                    ? "Sua lista começa aqui."
                    : "Nenhuma obra por aqui ainda."}
              </h3>
              <p>
                {q || readingState !== "all"
                  ? "Tente outro título ou ajuste os filtros de leitura."
                  : list
                    ? "Use a estrela de uma obra para guardá-la aqui."
                    : "Novos títulos aparecerão aqui."}
              </p>
              {q && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setLoading(true);
                    setQ("");
                    setPage(0);
                  }}
                >
                  Limpar busca
                </button>
              )}
            </div>
          ) : (
            <div className="series-grid beta-covers">
              {items.map((s, i) => (
                <article className="series-card" key={s.id}>
                  <Link
                    href={`/series/${s.id}`}
                    className={`series-cover cover-${i % 5}`}
                    aria-label={`Abrir ${s.title}`}
                  >
                    <SeriesCover title={s.title} src={covers[s.id]} />
                  </Link>
                  <div className="series-copy">
                    <small className="eyebrow">
                      {formats[s.format || "novel"]}
                    </small>
                    <Link className="series-title" href={`/series/${s.id}`}>
                      {s.title}
                    </Link>
                    <small className="series-state">
                      {s.reading_state === "completed"
                        ? "Concluída"
                        : s.reading_state === "reading"
                          ? `${s.completed_count}/${s.chapter_count} arquivos · Em leitura`
                          : s.chapter_count
                            ? `${s.chapter_count} arquivos · Não iniciada`
                            : "Capítulos em breve"}
                    </small>
                    <button
                      className="favorite-button"
                      aria-pressed={favs.includes(s.id)}
                      aria-label={`Guardar ${s.title}`}
                      disabled={favoriteBusy.includes(s.id)}
                      onClick={() => void favorite(s.id)}
                    >
                      {favs.includes(s.id) ? "★" : "☆"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <nav className="pagination" aria-label="Páginas do catálogo">
            <button
              className="secondary-button"
              disabled={!page || loading}
              onClick={() => {
                setLoading(true);
                setPage(page - 1);
              }}
            >
              Anterior
            </button>
            <span aria-live="polite">Página {page + 1}</span>
            <button
              className="secondary-button"
              disabled={!more || loading}
              onClick={() => {
                setLoading(true);
                setPage(page + 1);
              }}
            >
              Próxima
            </button>
          </nav>
        </section>
      </main>
    </>
  );
}
