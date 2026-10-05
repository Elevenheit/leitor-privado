/* eslint-disable @next/next/no-img-element -- Private signed and blob URLs must stay in the browser, avoiding an image proxy. */
"use client";
import { listCatalogPage } from "@/lib/data/catalog";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Search } from "lucide-react";
import { getPrivateCoverUrl } from "@/lib/cover-url";
import { setFavorite } from "@/lib/data/favorites";
import { toDataError } from "@/lib/data/errors";
import { formats, type Format } from "@/lib/catalog";
import type { Series } from "@/lib/types";
import { Nav } from "./nav";
import { RecentHistory } from "./recent-history";
export function Catalog({
  user,
  format,
  list = false,
}: {
  user: User;
  format?: Format;
  list?: boolean;
}) {
  const [items, setItems] = useState<Series[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [favs, setFavs] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await listCatalogPage({ ownerId: user.id, page, format, favoritesOnly: list, search: q });
        if (!live) return;
        const rows = result.items;
        setFavs(result.favoriteIds);
        setItems(rows);
        setMore(result.hasMore);
        const c = await Promise.all(
          rows
            .filter((x) => x.cover_path)
            .map(async (x) => {
              return [x.id, await getPrivateCoverUrl(user.id, x.cover_path!).catch(() => "")];
            }),
        );
        if (live) setCovers(Object.fromEntries(c));
      } catch {
        if (live)
          setError(
            "Não foi possível carregar a biblioteca. Confira a conexão e tente novamente.",
          );
      } finally {
        if (live) setLoading(false);
      }
    }
    const timer = setTimeout(() => void load(), 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [user.id, format, list, q, page]);
  async function favorite(id: string) {
    const had = favs.includes(id);
    try {
      await setFavorite(user.id, id, !had);
      setFavs((old) => had ? old.filter((x) => x !== id) : [...old, id]);
    } catch (cause) {
      setError(toDataError(cause, "Nao foi possivel salvar sua lista.").message);
    }
  }
  return (
    <>
      <Nav />
      <main className="dashboard beta-dashboard">
        {format || list ? (
          <header className="catalog-heading">
            <h1>{format ? formats[format] : "Minha lista"}</h1>
          </header>
        ) : (
          <h1 className="sr-only">Início</h1>
        )}
        <div className="catalog-topbar">
          <label className="search catalog-search">
            <Search size={17} aria-hidden="true" />
            <input
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
                setQ(e.target.value);
                setPage(0);
              }}
            />
            </label>
        </div>
        {!list && <RecentHistory userId={user.id} format={format} />}
        <section className="library-section">
          <div className="section-head catalog-section-head">
            <h2>
              {format
                ? "Todos os títulos"
                : list
                  ? "Guardados por você"
                  : "Adicionados recentemente"}
            </h2>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
              <button onClick={() => location.reload()}>
                Tentar novamente
              </button>
            </p>
          )}
          {loading ? (
            <p className="catalog-loading" role="status">
              Organizando suas histórias…
            </p>
          ) : !items.length ? (
            <div className="empty-state catalog-empty">
              <h3>Nenhuma obra por aqui ainda.</h3>
              <p>
                {q ? "Tente outro título." : "Novos títulos aparecerão aqui."}
              </p>
            </div>
          ) : (
            <div className="series-grid beta-covers">
              {items.map((s, i) => (
                <article className="series-card" key={s.id}>
                  <Link
                    href={`/series/${s.id}`}
                    className={`series-cover cover-${i % 5}`}
                  >
                    {covers[s.id] ? (
                      <img
                        src={covers[s.id]}
                        loading="lazy"
                        alt={`Capa de ${s.title}`}
                      />
                    ) : (
                      <>
                        <span className="cover-glyph" aria-hidden="true">
                          ✦
                        </span>
                        <strong>{s.title}</strong>
                      </>
                    )}
                  </Link>
                  <div className="series-copy">
                    <small className="eyebrow">
                      {formats[s.format || "novel"]}
                    </small>
                    <Link className="series-title" href={`/series/${s.id}`}>
                      {s.title}
                    </Link>
                    <button
                      className="favorite-button"
                      aria-pressed={favs.includes(s.id)}
                      aria-label={`Guardar ${s.title}`}
                      onClick={() => void favorite(s.id)}
                    >
                      {favs.includes(s.id) ? "★" : "☆"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="pagination">
            <button
              className="secondary-button"
              disabled={!page || loading}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              className="secondary-button"
              disabled={!more || loading}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
