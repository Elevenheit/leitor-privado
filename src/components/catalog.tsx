/* eslint-disable @next/next/no-img-element -- Private signed and blob URLs must stay in the browser, avoiding an image proxy. */
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowUpRight, BookOpen, Clapperboard, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formats, mediaHref, type Format } from "@/lib/catalog";
import type { Series, Book } from "@/lib/types";
import { Nav } from "./nav";
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
  const [recent, setRecent] = useState<Book[]>([]);
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
        const api = supabase();
        const f = await api
          .from("favorites")
          .select("series_id")
          .eq("owner_id", user.id);
        if (f.error) throw f.error;
        const ids = (f.data || []).map((x) => x.series_id);
        setFavs(ids);
        let query = api
          .from("series")
          .select("id,title,description,cover_path,format,created_at")
          .order("created_at", { ascending: false })
          .order("id")
          .range(page * 24, page * 24 + 23);
        if (format) query = query.eq("format", format);
        if (list) query = query.in("id", ids);
        if (q.trim())
          query = query.ilike("title", `%${q.trim().replace(/[%_]/g, "")}%`);
        const r = await query;
        if (r.error) throw r.error;
        if (!live) return;
        const rows = r.data as Series[];
        setItems(rows);
        setMore(rows.length === 24);
        const c = await Promise.all(
          rows
            .filter((x) => x.cover_path)
            .map(async (x) => {
              const { data } = await api.storage
                .from("covers")
                .createSignedUrl(x.cover_path!, 3600);
              return [x.id, data?.signedUrl || ""];
            }),
        );
        if (live) setCovers(Object.fromEntries(c));
        if (!format && !list) {
          const p = await api
            .from("reading_progress")
            .select("book_id")
            .eq("owner_id", user.id)
            .eq("completed", false)
            .order("updated_at", { ascending: false })
            .limit(6);
          if (p.error) throw p.error;
          const b = await api
            .from("books")
            .select("id,title,media_type")
            .in(
              "id",
              (p.data || []).map((x) => x.book_id),
            );
          if (b.error) throw b.error;
          if (live) setRecent((b.data || []) as Book[]);
        }
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
    const r = had
      ? await supabase()
          .from("favorites")
          .delete()
          .eq("owner_id", user.id)
          .eq("series_id", id)
      : await supabase()
          .from("favorites")
          .upsert({ owner_id: user.id, series_id: id });
    if (r.error) setError("Não foi possível salvar sua lista.");
    else setFavs((old) => (had ? old.filter((x) => x !== id) : [...old, id]));
  }
  return (
    <>
      <Nav />
      <main className="dashboard beta-dashboard">
        <section className="catalog-heading">
          <h1>
            {format ? formats[format] : list ? "Minha lista" : "Biblioteca"}
          </h1>
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
        </section>
        <nav className="category-tabs" aria-label="Categorias da biblioteca">
          <Link href="/" aria-current={!format && !list ? "page" : undefined}>
            Todos
          </Link>
          {Object.entries(formats).map(([id, label]) => (
            <Link
              href={`/category/${id}`}
              key={id}
              aria-current={format === id ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {!format && !list && recent.length > 0 && (
          <section className="library-section continue-section">
            <h2>Continuar lendo ou assistindo</h2>
            <div className="continue-grid">
              {recent.map((b) => (
                <Link className="continue-card" href={mediaHref(b)} key={b.id}>
                  <span className="continue-icon" aria-hidden="true">
                    {b.media_type === "video" ? (
                      <Clapperboard size={21} />
                    ) : (
                      <BookOpen size={21} />
                    )}
                  </span>
                  <span className="continue-copy">
                    <small>RETOMAR SUA HISTÓRIA</small>
                    <strong>{b.title}</strong>
                  </span>
                  <span className="continue-link">
                    Continuar <ArrowUpRight size={16} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section className="library-section">
          <div className="section-head">
            <h2>
              {format
                ? "Recém adicionados"
                : list
                  ? "Guardados por você"
                  : "Explore o acervo"}
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
            <p className="empty-state" role="status">
              Organizando suas histórias…
            </p>
          ) : !items.length ? (
            <div className="empty-state catalog-empty">
              <h3>Nenhuma obra por aqui ainda.</h3>
              <p>
                {q
                  ? "Tente outro título."
                  : "Novos títulos aparecerão aqui."}
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
