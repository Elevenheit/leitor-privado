"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { Comments } from "@/components/comments";
import { SeriesHeader } from "@/components/series/series-header";
import { ChapterList } from "@/components/series/chapter-list";
import { getWorkPage, type WorkPage } from "@/lib/data/catalog";
import { toDataError } from "@/lib/data/errors";
import { getPrivateCoverUrl } from "@/lib/cover-url";
import type { User } from "@supabase/supabase-js";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <AuthGate>
      {(u) => <Work key={`${u.id}:${id}`} id={id} user={u} />}
    </AuthGate>
  );
}
function Work({ id, user }: { id: string; user: User }) {
  const [data, setData] = useState<WorkPage | null>(null);
  const [cover, setCover] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const result = await getWorkPage(id, page, user.id);
        if (!live) return;
        if (!result.series) throw new Error("Obra indisponível");
        setData(result);
        const url = result.series.cover_path
          ? await getPrivateCoverUrl(user.id, result.series.cover_path).catch(
              () => "",
            )
          : "";
        if (live) {
          setCover(url);
          setError("");
        }
      } catch (cause) {
        if (live)
          setError(
            toDataError(
              cause,
              "Não foi possível abrir esta obra. Confira seu acesso e sua conexão.",
            ).message,
          );
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [id, user.id, page, attempt]);
  return (
    <>
      <Nav back />
      <main
        id="main-content"
        tabIndex={-1}
        className="series-page"
        aria-busy={loading}
      >
        {error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                setError("");
                setAttempt((n) => n + 1);
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : data?.series ? (
          <>
            <SeriesHeader
              series={data.series}
              cover={cover}
              continueBook={data.lastRead || data.firstBook}
              started={Boolean(data.lastRead)}
              chapterCount={data.chapterCount}
              completedCount={data.completedCount}
            />
            {loading ? (
              <p role="status">Carregando capítulos…</p>
            ) : (
              <ChapterList
                books={data.books}
                volumes={data.volumes}
                progress={data.progress}
                currentBookId={data.lastRead?.id}
                page={page}
                hasMore={data.hasMore}
                onPageChange={(next) => {
                  setLoading(true);
                  setPage(next);
                }}
              />
            )}
            <Comments seriesId={id} userId={user.id} />
          </>
        ) : (
          <p role="status">Carregando obra…</p>
        )}
      </main>
    </>
  );
}
