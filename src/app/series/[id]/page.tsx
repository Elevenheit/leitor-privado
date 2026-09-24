/* eslint-disable @next/next/no-img-element -- Private signed and blob URLs must stay in the browser, avoiding an image proxy. */
"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { Comments } from "@/components/comments";
import { supabase } from "@/lib/supabase";
import type { Series, Book, Volume, ReadingProgress } from "@/lib/types";
import { formats, mediaHref } from "@/lib/catalog";
import type { User } from "@supabase/supabase-js";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <AuthGate>{(u) => <Work key={id} id={id} user={u} />}</AuthGate>;
}
function Work({ id, user }: { id: string; user: User }) {
  const [series, setSeries] = useState<Series | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [progress, setProgress] = useState<ReadingProgress[]>([]);
  const [cover, setCover] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const api = supabase();
        const [s, b, v, p] = await Promise.all([
          api.from("series").select("*").eq("id", id).single(),
          api
            .from("books")
            .select("*")
            .eq("series_id", id)
            .order("sort_order")
            .order("chapter_number")
            .order("id")
            .range(page * 100, page * 100 + 99),
          api
            .from("volumes")
            .select("*")
            .eq("series_id", id)
            .order("sort_order")
            .order("volume_number"),
          api.from("reading_progress").select("*").eq("owner_id", user.id),
        ]);
        if (s.error || b.error || v.error || p.error) throw new Error();
        if (!live) return;
        setSeries(s.data);
        setBooks(b.data || []);
        setVolumes(v.data || []);
        setProgress(p.data || []);
        if (s.data.cover_path) {
          const { data } = await api.storage
            .from("covers")
            .createSignedUrl(s.data.cover_path, 3600);
          if (live) setCover(data?.signedUrl || "");
        }
      } catch {
        if (live)
          setError(
            "Não foi possível abrir esta obra. Confira seu acesso e sua conexão.",
          );
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [id, user.id, page]);
  const latest =
    [...progress]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((p) => books.find((b) => b.id === p.book_id))
      .find(Boolean) || books[0];
  return (
    <>
      <Nav back />
      <main className="series-page">
        {loading ? (
          <p>Carregando obra…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          series && (
            <>
              <section className="series-hero">
                <div className="series-hero-cover">
                  {cover ? (
                    <img src={cover} alt={`Capa de ${series.title}`} />
                  ) : (
                    <span>✦</span>
                  )}
                </div>
                <div className="series-hero-copy">
                  <span className="eyebrow">
                    {formats[series.format || "novel"]}
                  </span>
                  <h1>{series.title}</h1>
                  <p>
                    {series.description ||
                      "Esta história ainda não tem sinopse."}
                  </p>
                  {latest && (
                    <Link className="primary-button" href={mediaHref(latest)}>
                      {progress.some((p) => p.book_id === latest.id)
                        ? "Continuar"
                        : "Começar"}{" "}
                      →
                    </Link>
                  )}
                </div>
              </section>
              <section className="volumes-section">
                <h2>
                  {series.format === "anime"
                    ? "Temporadas e episódios"
                    : "Volumes e capítulos"}
                </h2>
                {books.map((b) => {
                  const v = volumes.find((v) => v.id === b.volume_id);
                  const p = progress.find((p) => p.book_id === b.id);
                  return (
                    <Link
                      className="chapter-row"
                      href={mediaHref(b)}
                      key={b.id}
                    >
                      <span className="chapter-number">
                        {b.chapter_number ?? "—"}
                      </span>
                      <div className="chapter-info">
                        <strong>{b.chapter_title || b.title}</strong>
                        <small>
                          {v
                            ? `${series.format === "anime" ? "Temporada" : "Volume"} ${v.volume_number ?? ""} · `
                            : ""}
                          {p
                            ? "completed" in p && p.completed
                              ? "Concluído"
                              : series.format === "anime"
                                ? "Em andamento"
                                : `Página ${p.page_number}`
                            : "Não iniciado"}
                        </small>
                      </div>
                      <span>→</span>
                    </Link>
                  );
                })}
                {!books.length && (
                  <p className="empty-state">
                    Novos capítulos chegam em breve.
                  </p>
                )}
                <div className="pagination">
                  <button disabled={!page} onClick={() => setPage(page - 1)}>
                    Anterior
                  </button>
                  <button
                    disabled={books.length < 100}
                    onClick={() => setPage(page + 1)}
                  >
                    Mais capítulos
                  </button>
                </div>
              </section>
              <Comments seriesId={id} userId={user.id} />
            </>
          )
        )}
      </main>
    </>
  );
}
