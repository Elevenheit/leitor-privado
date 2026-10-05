"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { Comments } from "@/components/comments";
import { SeriesHeader } from "@/components/series/series-header";
import { ChapterList } from "@/components/series/chapter-list";
import { supabase } from "@/lib/supabase";
import type { Series, Book, Volume, ReadingProgress } from "@/lib/types";
import { getPrivateCoverUrl } from "@/lib/cover-url";
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
  const [hasMore, setHasMore] = useState(false);
  const [lastRead, setLastRead] = useState<Pick<Book, "id" | "media_type"> | null>(null);
  useEffect(() => {
    let live = true;
    void supabase().from("reading_progress")
      .select("books!inner(id,media_type,series_id)")
      .eq("owner_id", user.id)
      .eq("books.series_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const embedded = data?.books;
        const book = (Array.isArray(embedded) ? embedded[0] : embedded) as Pick<Book, "id" | "media_type"> | null;
        if (live) setLastRead(book || null);
      });
    return () => { live = false; };
  }, [id, user.id]);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const api = supabase();
        const [s, b, v] = await Promise.all([
          api.from("series").select("id,owner_id,title,description,cover_path,format,beta_visible,rights_note").eq("id", id).single(),
          api
            .from("books")
            .select("id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type")
            .eq("series_id", id)
            .order("sort_order")
            .order("chapter_number")
            .order("id")
            .range(page * 100, page * 100 + 100),
          api
            .from("volumes")
            .select("id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at")
            .eq("series_id", id)
            .order("sort_order")
            .order("volume_number"),
        ]);
        if (s.error || b.error || v.error) throw new Error();
        if (!live) return;
        const bookIds = (b.data || []).map((item) => item.id);
        const p = bookIds.length
          ? await api.from("reading_progress").select("owner_id,book_id,page_number,line_index,scroll_ratio,reading_mode,updated_at,completed").eq("owner_id", user.id).in("book_id", bookIds)
          : { data: [], error: null };
        if (p.error) throw p.error;
        setSeries(s.data as Series);
        setBooks((b.data || []).slice(0, 100));
        setHasMore((b.data || []).length > 100);
        setVolumes(v.data || []);
        setProgress(p.data || []);
        if (s.data.cover_path) {
          const url = await getPrivateCoverUrl(user.id, s.data.cover_path).catch(() => "");
          if (live) setCover(url);
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
  const latest = lastRead || books[0];
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
              <SeriesHeader series={series} cover={cover} continueBook={latest} started={Boolean(lastRead)} />
              <ChapterList books={books} volumes={volumes} progress={progress} page={page} hasMore={hasMore} onPageChange={setPage} />
              <Comments seriesId={id} userId={user.id} />
            </>
          )
        )}
      </main>
    </>
  );
}
