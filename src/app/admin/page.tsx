"use client";

import Link from "next/link";
import { MediaPublisher } from "@/components/media-publisher";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  FilePlus2,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Upload } from "tus-js-client";
import type { User } from "@supabase/supabase-js";
import { BetaAccess } from "@/components/beta-access";
import { AuthGate } from "@/components/auth-gate";
import { BatchUploadModal } from "@/components/library/batch-upload-modal";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Nav } from "@/components/nav";
import { BUCKET, supabase } from "@/lib/supabase";
import {
  formatSize,
  type Book,
  type ReadingProgress,
  type Series,
  type Volume,
} from "@/lib/types";
import type { Format } from "@/lib/catalog";

export default function Home() {
  return (
    <AuthGate>
      {(user) => (
        <BetaAccess admin>
          <Dashboard user={user} />
        </BetaAccess>
      )}
    </AuthGate>
  );
}

function Dashboard({ user }: { user: User }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFormat, setNewFormat] = useState<Format>("novel");
  const [selectedSeries, setSelectedSeries] = useState("");
  const [selectedVolume, setSelectedVolume] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [contentType, setContentType] = useState<"chapter" | "volume">(
    "chapter",
  );
  const [skipIntro, setSkipIntro] = useState(false);
  const [introEnd, setIntroEnd] = useState(90);
  const [inlineSeriesTitle, setInlineSeriesTitle] = useState("");
  const [inlineSeriesFormat, setInlineSeriesFormat] = useState<Format>("novel");
  const [inlineVolumeNumber, setInlineVolumeNumber] = useState("");
  const [inlineVolumeTitle, setInlineVolumeTitle] = useState("");
  const [createSeriesInline, setCreateSeriesInline] = useState(false);
  const [createVolumeInline, setCreateVolumeInline] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editChapterTitle, setEditChapterTitle] = useState("");
  const [editChapterNumber, setEditChapterNumber] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<
    { type: "series"; item: Series } | { type: "book"; item: Book } | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDetailsElement>(null);

  const load = useCallback(async () => {
    const api = supabase();
    const [b, s, v, p, f] = await Promise.all([
      api
        .from("books")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      api.from("series").select("*").eq("owner_id", user.id).order("title"),
      api
        .from("volumes")
        .select("*")
        .eq("owner_id", user.id)
        .order("sort_order")
        .order("volume_number"),
      api.from("reading_progress").select("*").eq("owner_id", user.id),
      api.from("favorites").select("series_id").eq("owner_id",user.id),
    ]);
    const failure = b.error || s.error || v.error || p.error || f.error;
    if (failure) setError(failure.message);
    else {
      setBooks((b.data || []) as Book[]);
      setSeries((s.data || []).map(item => ({...item,is_favorite:(f.data||[]).some(x=>x.series_id===item.id)})) as Series[]);
      setVolumes((v.data || []) as Volume[]);
      setProgress(
        Object.fromEntries(
          ((p.data || []) as ReadingProgress[]).map((item) => [
            item.book_id,
            item,
          ]),
        ),
      );
      setError("");
      const signedCovers = await Promise.all(
        ((s.data || []) as Series[])
          .filter((item) => item.cover_path)
          .map(async (item) => {
            const { data } = await api.storage
              .from("covers")
              .createSignedUrl(item.cover_path!, 3600);
            return [item.id, data?.signedUrl || ""] as const;
          }),
      );
      setCoverUrls(Object.fromEntries(signedCovers.filter(([, url]) => url)));
    }
    setLoading(false);
  }, [user.id]);

  // Load authenticated library data once the user is available.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function createSeries() {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    setError("");
    const { data: created, error: saveError } = await supabase()
  .from("series")
  .insert({
    owner_id: user.id,
    title,
    description: newDescription.trim() || null,
    format: newFormat,
    beta_visible: true,
  })
  .select()
  .single();
    if (saveError) setError(saveError.message);
    else {
      if (coverFile && created) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(coverFile.type)
        ) {
          setError("A capa deve estar no formato JPEG, PNG ou WebP.");
          setBusy(false);
          return;
        }
        const ext =
          coverFile.type === "image/jpeg"
            ? "jpg"
            : coverFile.type.split("/")[1];
        const path = `${user.id}/${created.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase()
          .storage.from("covers")
          .upload(path, coverFile, {
            contentType: coverFile.type,
            upsert: false,
          });
        if (uploadError)
          setError(
            `Obra criada, mas a capa não foi enviada: ${uploadError.message}`,
          );
        else {
          const { error: coverError } = await supabase()
            .from("series")
            .update({ cover_path: path })
            .eq("id", created.id);
          if (coverError) setError(coverError.message);
        }
      }
      setNewTitle("");
      setNewDescription("");
      setNewFormat("novel");
      setCoverFile(null);
      setShowCreate(false);
      await load();
    }
    setBusy(false);
  }

  async function createSeriesFromUpload() {
    const title = inlineSeriesTitle.trim();
    if (!title) return;
    const { data, error: saveError } = await supabase()
  .from("series")
  .insert({
    owner_id: user.id,
    title,
    format: inlineSeriesFormat,
    beta_visible: true,
  })
  .select()
  .single();
    if (saveError) setError(saveError.message);
    else {
      setSeries((previous) => [...previous, data as Series]);
      setSelectedSeries(data.id);
      setCreateSeriesInline(false);
      setInlineSeriesTitle("");
      setInlineSeriesFormat("novel");
    }
  }

  async function createVolumeFromUpload() {
    if (!selectedSeries || (!inlineVolumeNumber && !inlineVolumeTitle.trim()))
      return;
    const number = inlineVolumeNumber ? Number(inlineVolumeNumber) : null;
    const { data, error: saveError } = await supabase()
      .from("volumes")
      .insert({
        owner_id: user.id,
        series_id: selectedSeries,
        volume_number: number,
        title: inlineVolumeTitle.trim() || null,
        sort_order: number ? Math.round(number * 1000) : volumes.length * 1000,
      })
      .select()
      .single();
    if (saveError) setError(saveError.message);
    else {
      setVolumes((previous) => [...previous, data as Volume]);
      setSelectedVolume(data.id);
      setCreateVolumeInline(false);
      setInlineVolumeNumber("");
      setInlineVolumeTitle("");
    }
  }

  function editSeries(item: Series) {
    setEditingSeries(item);
    setEditTitle(item.title);
    setEditDescription(item.description || "");
  }

  async function saveSeriesEdit() {
    if (!editingSeries || !editTitle.trim()) return;
    setBusy(true);
    const { error: updateError } = await supabase()
      .from("series")
      .update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingSeries.id)
      .eq("owner_id", user.id);
    if (updateError) setError(updateError.message);
    else setEditingSeries(null);
    await load();
    setBusy(false);
  }

  async function toggleFavorite(item: Series) {
    if (favoriteBusy) return;
    setError("");
    setFavoriteBusy(item.id);
    const next = !item.is_favorite;
    const { error: updateError } = next
      ? await supabase().from("favorites").upsert({owner_id:user.id,series_id:item.id})
      : await supabase().from("favorites").delete().eq("owner_id",user.id).eq("series_id",item.id);
    if (updateError)
      setError(
        `Não foi possível alterar o favorito. Verifique sua conexão. ${updateError.message}`,
      );
    else
      setSeries((previous) =>
        previous.map((seriesItem) =>
          seriesItem.id === item.id
            ? { ...seriesItem, is_favorite: next }
            : seriesItem,
        ),
      );
    setFavoriteBusy(null);
  }

  function deleteSeries(item: Series) {
    setDeleteTarget({ type: "series", item });
  }

  async function removeSeries(item: Series) {
    setBusy(true);
    const { error: deleteError } = await supabase()
      .from("series")
      .delete()
      .eq("id", item.id)
      .eq("owner_id", user.id);
    if (deleteError) setError(deleteError.message);
    else setDeleteTarget(null);
    await load();
    setBusy(false);
  }

  async function uploadFile() {
    if (!file || uploading || !selectedSeries || !selectedFormat) return;
    setError("");
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const mediaType = selectedFormat === "novel" ? "pdf" : selectedFormat === "anime" ? "video" : "cbz";
    if (mediaType === "pdf" && extension !== "pdf") {
      setError("Escolha um arquivo PDF.");
      return;
    }
    if (mediaType === "pdf") {
    const signature = new TextDecoder().decode(
      await file.slice(0, 5).arrayBuffer(),
    );
    if (signature !== "%PDF-") {
      setError("Este arquivo não parece ser um PDF válido.");
      return;
    }
    } else {
      const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (mediaType === "cbz" && (extension !== "cbz" || file.size > 40 * 1024 * 1024 || bytes[0] !== 80 || bytes[1] !== 75)) { setError("Use um arquivo CBZ ZIP válido de até 40 MB."); return; }
      if (mediaType === "video" && (!(["mp4", "webm"].includes(extension)) || file.size > 500 * 1024 * 1024)) { setError("Use MP4 ou WebM de até 500 MB."); return; }
      if (mediaType === "video" && extension === "mp4" && new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp") { setError("MP4 inválido."); return; }
      if (mediaType === "video" && extension === "webm" && !(bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163)) { setError("WebM inválido."); return; }
    }
    const api = supabase();
    const {
      data: { session },
    } = await api.auth.getSession();
    if (!session) {
      setError("Sua sessão expirou. Entre novamente.");
      return;
    }
    const path = `${user.id}/${selectedSeries}/${selectedVolume || "unassigned"}/${crypto.randomUUID()}.${extension}`;
    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/upload/resumable`;
    setUploading(true);
    setUploadPercent(0);
    try {
      if (mediaType === "pdf") await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint,
          headers: { authorization: `Bearer ${session.access_token}` },
          retryDelays: [0, 3000, 5000, 10000, 20000],
          chunkSize: 6 * 1024 * 1024,
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: BUCKET,
            objectName: path,
            contentType: "application/pdf",
            cacheControl: "3600",
          },
          onError: reject,
          onSuccess: () => resolve(),
          onProgress: (sent, total) =>
            setUploadPercent(Math.round((sent / total) * 100)),
        });
        upload
          .findPreviousUploads()
          .then((previous) => {
            if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
            upload.start();
          })
          .catch(reject);
      });
      else {
        const objectType = mediaType === "cbz" ? "application/zip" : extension === "mp4" ? "video/mp4" : "video/webm";
        const uploaded = await api.storage.from(BUCKET).upload(path, file, { contentType: objectType });
        if (uploaded.error) throw uploaded.error;
      }
      const { error: insertError } = await api.from("books").insert({
        owner_id: user.id,
        title:
          chapterTitle.trim() ||
          file.name
            .replace(/\.pdf$/i, "")
            .replace(/[_-]+/g, " ")
            .trim(),
        original_filename: file.name,
        file_path: path,
        size_bytes: file.size,
        series_id: selectedSeries || null,
        volume_id: selectedVolume || null,
        chapter_number: chapterNumber ? Number(chapterNumber) : null,
        chapter_title: chapterTitle.trim() || null,
        sort_order: chapterNumber
          ? Math.round(Number(chapterNumber) * 1000)
          : 0,
        content_type: contentType,
        media_type: mediaType,
        skip_intro: mediaType === "video" && skipIntro,
        intro_end: introEnd,
      });
      if (insertError) {
        await api.storage.from(BUCKET).remove([path]);
        throw insertError;
      }
      setFile(null);
      setChapterNumber("");
      setChapterTitle("");
      setShowUpload(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha no upload.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function deleteBook(book: Book) {
    setDeleteTarget({ type: "book", item: book });
  }

  async function removeBook(book: Book) {
    setBusy(true);
    setError("");
    const api = supabase();
    const { error: storageError } = await api.storage
      .from(BUCKET)
      .remove([book.file_path]);
    if (storageError) {
      setError(storageError.message);
      setBusy(false);
      return;
    }
    const { error: dbError } = await api
      .from("books")
      .delete()
      .eq("id", book.id)
      .eq("owner_id", user.id);
    if (dbError)
      setError(
        `PDF excluído, mas o registro não foi removido: ${dbError.message}`,
      );
    else setDeleteTarget(null);
    await load();
    setBusy(false);
  }

  function editBook(book: Book) {
    setEditingBook(book);
    setEditChapterTitle(book.chapter_title || book.title);
    setEditChapterNumber(book.chapter_number?.toString() || "");
  }

  async function saveBookEdit() {
    if (!editingBook || !editChapterTitle.trim()) return;
    const chapter_number = editChapterNumber.trim()
      ? Number(editChapterNumber)
      : null;
    const { error: updateError } = await supabase()
      .from("books")
      .update({
        chapter_title: editChapterTitle.trim(),
        title: editChapterTitle.trim(),
        chapter_number,
        sort_order: chapter_number
          ? Math.round(chapter_number * 1000)
          : editingBook.sort_order,
      })
      .eq("id", editingBook.id)
      .eq("owner_id", user.id);
    if (updateError) setError(updateError.message);
    else setEditingBook(null);
    await load();
  }

  const match = (value: string) =>
    value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const matchesBook = (book: Book) =>
    match(book.title) ||
    match(book.chapter_title || "") ||
    (book.chapter_number !== null &&
      match(`capítulo ${book.chapter_number}`)) ||
    match(
      `${book.content_type === "volume" ? "volume" : "capítulo"} ${book.chapter_number ?? ""}`,
    );
  const groupedSeries = series.filter(
    (item) =>
      (!favoriteOnly || item.is_favorite) &&
      (match(item.title) ||
        books.some((b) => b.series_id === item.id && matchesBook(b)) ||
        volumes.some(
          (v) =>
            v.series_id === item.id &&
            (match(`volume ${v.volume_number ?? ""}`) || match(v.title || "")),
        )),
  );
  const looseBooks = books.filter(
    (book) => !book.series_id && matchesBook(book),
  );
  const recent = [...books]
    .filter((book) => progress[book.id])
    .sort((a, b) =>
      (progress[b.id]?.updated_at || "").localeCompare(
        progress[a.id]?.updated_at || "",
      ),
    )[0];
  const recentSeries = recent
    ? series.find((item) => item.id === recent.series_id)
    : null;
  const recentPercent =
    recent && recent.total_pages
      ? Math.min(
          100,
          Math.round(
            (progress[recent.id].page_number / recent.total_pages) * 100,
          ),
        )
      : 0;
  const relevantVolumes = volumes.filter((v) => v.series_id === selectedSeries);
  const selectedSeriesData = series.find((item) => item.id === selectedSeries);
  const selectedFormat = selectedSeriesData?.format || null;
  const formatLabel = selectedFormat === "novel" ? "Light Novel" : selectedFormat === "manga" ? "Mangá" : selectedFormat === "manhwa" ? "Manhwa" : selectedFormat === "anime" ? "Anime" : "";
  const acceptedMedia = selectedFormat === "novel" ? ".pdf,application/pdf" : selectedFormat === "manga" || selectedFormat === "manhwa" ? ".cbz,application/zip,application/vnd.comicbook+zip" : selectedFormat === "anime" ? ".mp4,.webm,video/mp4,video/webm" : undefined;

  return (
    <>
      <Nav />
      <main className="dashboard">
        <MediaPublisher userId={user.id} />
        {recent && (
          <section className="continue-card">
            <div
              className="continue-icon"
              style={
                recentSeries && coverUrls[recentSeries.id]
                  ? { backgroundImage: `url("${coverUrls[recentSeries.id]}")` }
                  : undefined
              }
            >
              {!(recentSeries && coverUrls[recentSeries.id]) && (
                <BookOpen size={24} />
              )}
            </div>
            <div className="continue-copy">
              <span className="eyebrow">Continuar lendo</span>
              <strong>{recentSeries?.title || recent.title}</strong>
              <small>
                {recent.chapter_number !== null
                  ? `Capítulo ${recent.chapter_number}`
                  : `Página ${progress[recent.id].page_number}`}
                {recent.chapter_title ? ` · ${recent.chapter_title}` : ""}
              </small>
              <div
                className="book-progress"
                aria-label={`${recentPercent}% lido`}
              >
                <div style={{ width: `${recentPercent}%` }} />
              </div>
            </div>
            <Link className="continue-link" href={`/read/${recent.id}`}>
              Continuar <ChevronRight size={18} />
            </Link>
          </section>
        )}
        <section className="library-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Acervo privado</span>
              <h1>
                Minha biblioteca <span className="count">{series.length}</span>
              </h1>
            </div>
            <div className="library-buttons">
              <Link className="manage-link" href="/manage">
                <ListChecks size={16} /> Gerenciar
              </Link>
              <details className="add-menu" ref={addMenuRef}>
                <summary>
                  <Plus size={17} /> Adicionar
                </summary>
                <div className="add-menu-panel">
                  <button
                    onClick={() => {
                      addMenuRef.current?.removeAttribute("open");
                      setShowUpload(true);
                    }}
                    disabled={uploading}
                  >
                    Adicionar capítulo
                  </button>
                  <button
                    onClick={() => {
                      addMenuRef.current?.removeAttribute("open");
                      setShowBatchUpload(true);
                    }}
                  >
                    Adicionar arquivos em lote
                  </button>
                  <button
                    onClick={() => {
                      addMenuRef.current?.removeAttribute("open");
                      setShowCreate(true);
                    }}
                  >
                    Nova obra
                  </button>
                </div>
              </details>
            </div>
          </div>
          {error && (
            <div className="error dashboard-error" role="alert">
              {error}
              <button aria-label="Fechar erro" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="toolbar">
            <div className="search">
              <Search size={18} />
              <input
                aria-label="Buscar obras e capítulos"
                placeholder="Buscar obras, volumes ou capítulos…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="library-filters">
              <button
                className={!favoriteOnly ? "selected" : ""}
                aria-pressed={!favoriteOnly}
                onClick={() => setFavoriteOnly(false)}
              >
                Todos
              </button>
              <button
                className={favoriteOnly ? "selected" : ""}
                aria-pressed={favoriteOnly}
                onClick={() => setFavoriteOnly(true)}
              >
                <Star size={13} /> Favoritos
              </button>
            </div>
            <span className="muted">
              {books.length} {books.length === 1 ? "PDF" : "PDFs"}
            </span>
          </div>
          {loading ? (
            <p className="empty-state">Carregando biblioteca…</p>
          ) : (
            <>
              {groupedSeries.length > 0 && (
                <div className="series-grid">
                  {groupedSeries.map((item, index) => {
                    const inSeries = books.filter(
                      (b) => b.series_id === item.id,
                    );
                    const volumeCount = volumes.filter(
                      (v) => v.series_id === item.id,
                    ).length;
                    const lastBook = inSeries
                      .filter((b) => progress[b.id])
                      .sort((a, b) =>
                        (progress[b.id]?.updated_at || "").localeCompare(
                          progress[a.id]?.updated_at || "",
                        ),
                      )[0];
                    return (
                      <article className="series-card" key={item.id}>
                        <Link
                          href={`/admin/series/${item.id}`}
                          className={`series-cover cover-${index % 5}`}
                          style={
                            coverUrls[item.id]
                              ? {
                                  backgroundImage: `linear-gradient(0deg,#171518e8,transparent 70%),url("${coverUrls[item.id]}")`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }
                              : undefined
                          }
                        >
                          <span className="cover-glyph">✦</span>
                          <strong>{item.title}</strong>
                          <small>NUK · BIBLIOTECA PARTICULAR</small>
                        </Link>
                        <div className="series-copy">
                          <div>
                            <Link
                              href={`/admin/series/${item.id}`}
                              className="series-title"
                            >
                              {item.title}
                            </Link>
                            <button
                              className={`favorite-button ${item.is_favorite ? "active" : ""}`}
                              aria-label={
                                item.is_favorite
                                  ? `Desfavoritar ${item.title}`
                                  : `Favoritar ${item.title}`
                              }
                              aria-pressed={Boolean(item.is_favorite)}
                              disabled={favoriteBusy === item.id}
                              onClick={() => void toggleFavorite(item)}
                            >
                              <Star
                                size={16}
                                fill={
                                  item.is_favorite ? "currentColor" : "none"
                                }
                              />
                            </button>
                            <p>
                              {volumeCount}{" "}
                              {volumeCount === 1 ? "volume" : "volumes"} ·{" "}
                              {inSeries.length}{" "}
                              {inSeries.length === 1 ? "capítulo" : "capítulos"}
                            </p>
                          </div>
                          {lastBook && (
                            <small className="series-last">
                              Última leitura ·{" "}
                              {lastBook.chapter_number
                                ? `Cap. ${lastBook.chapter_number}`
                                : `p. ${progress[lastBook.id].page_number}`}
                            </small>
                          )}
                          <div className="series-actions">
                            <Link href={`/admin/series/${item.id}`}>
                              Abrir obra <ChevronRight size={15} />
                            </Link>
                            <button
                              aria-label={`Editar ${item.title}`}
                              onClick={() => void editSeries(item)}
                              disabled={busy}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              aria-label={`Excluir organização ${item.title}`}
                              onClick={() => void deleteSeries(item)}
                              disabled={busy}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {!favoriteOnly && looseBooks.length > 0 && (
                <section className="loose-section">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">
                        PDFs antigos e não organizados
                      </span>
                      <h2>
                        Sem coleção{" "}
                        <span className="count">{looseBooks.length}</span>
                      </h2>
                    </div>
                  </div>
                  <div className="loose-list">
                    {looseBooks.map((book) => {
                      const current = progress[book.id];
                      return (
                        <article className="loose-row" key={book.id}>
                          <Link
                            href={`/read/${book.id}`}
                            className="loose-icon"
                          >
                            <FileText size={20} />
                          </Link>
                          <div className="loose-details">
                            <Link href={`/read/${book.id}`}>{book.title}</Link>
                            <small>
                              {formatSize(book.size_bytes)} ·{" "}
                              {current
                                ? `Página ${current.page_number}`
                                : "Ainda não iniciado"}
                            </small>
                          </div>
                          <button
                            onClick={() => void editBook(book)}
                            aria-label="Editar metadados"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => void deleteBook(book)}
                            aria-label="Excluir PDF"
                          >
                            <Trash2 size={16} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
              {!groupedSeries.length &&
                (favoriteOnly || (!series.length && !looseBooks.length)) && (
                  <div className="empty-state">
                    <FilePlus2 size={32} />
                    <h3>
                      {favoriteOnly
                        ? "Nenhuma obra favorita"
                        : query
                          ? "Nenhum resultado encontrado"
                          : "Sua biblioteca começa aqui"}
                    </h3>
                    <p>
                      {favoriteOnly
                        ? "Marque uma obra com a estrela para encontrá-la aqui."
                        : query
                          ? "Tente outro termo de busca."
                          : "Crie uma obra ou envie um PDF para começar."}
                    </p>
                    {!favoriteOnly && (
                      <button
                        className="primary-button"
                        onClick={() => setShowCreate(true)}
                      >
                        <Plus size={17} /> Criar obra
                      </button>
                    )}
                  </div>
                )}
            </>
          )}
        </section>
        <footer className="site-footer">
          nook. <span>Um capítulo de cada vez.</span>
        </footer>
        {showCreate && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowCreate(false);
            }}
          >
            <section
              className="form-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-series-title"
            >
              <button
                className="modal-close"
                onClick={() => setShowCreate(false)}
                aria-label="Fechar"
              >
                <X size={19} />
              </button>
              <span className="eyebrow">Nova coleção</span>
              <h2 id="create-series-title">Criar obra</h2>
              <label>
                Nome da obra
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={300}
                  autoFocus
                />
              </label>
              <label>
                Tipo da obra
                <select value={newFormat} onChange={(e) => setNewFormat(e.target.value as Format)}>
                  <option value="novel">Light Novel</option>
                  <option value="manga">Mangá</option>
                  <option value="manhwa">Manhwa</option>
                  <option value="anime">Anime</option>
                </select>
              </label>
              <label>
                Descrição opcional
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                />
              </label>
              <label>
                Capa opcional (JPEG, PNG ou WebP)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                />
              </label>
              <button
                className="primary-button"
                disabled={!newTitle.trim() || busy}
                onClick={() => void createSeries()}
              >
                {busy ? "Salvando…" : "Criar obra"}
              </button>
            </section>
          </div>
        )}
        {showUpload && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !uploading)
                setShowUpload(false);
            }}
          >
            <section
              className="form-modal upload-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="upload-title"
            >
              <button
                className="modal-close"
                onClick={() => !uploading && setShowUpload(false)}
                aria-label="Fechar"
              >
                <X size={19} />
              </button>
              <span className="eyebrow">Acrescentar ao acervo</span>
              <h2 id="upload-title">Adicionar conteúdo</h2>
              <label>
                Obra
                <select
                  value={selectedSeries}
                  onChange={(e) => {
                    setSelectedSeries(e.target.value);
                    setSelectedVolume("");
                    setFile(null);
                  }}
                >
                  <option value="">Sem coleção</option>
                  {series.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="inline-create"
                onClick={() => setCreateSeriesInline(!createSeriesInline)}
              >
                + Criar nova obra
              </button>
              {createSeriesInline && (
                <div className="inline-create-row">
                  <input
                    aria-label="Nome da nova obra"
                    placeholder="Nome da obra"
                    value={inlineSeriesTitle}
                    onChange={(e) => setInlineSeriesTitle(e.target.value)}
                  />
                  <select aria-label="Tipo da obra" value={inlineSeriesFormat} onChange={(e) => setInlineSeriesFormat(e.target.value as Format)}>
                    <option value="novel">Light Novel</option>
                    <option value="manga">Mangá</option>
                    <option value="manhwa">Manhwa</option>
                    <option value="anime">Anime</option>
                  </select>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void createSeriesFromUpload()}
                  >
                    Criar
                  </button>
                </div>
              )}
              <label>
                Volume
                <select
                  value={selectedVolume}
                  onChange={(e) => setSelectedVolume(e.target.value)}
                  disabled={!selectedSeries}
                >
                  <option value="">Sem volume</option>
                  {relevantVolumes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.volume_number
                        ? `Volume ${v.volume_number}`
                        : v.title || "Volume"}
                    </option>
                  ))}
                </select>
              </label>
              {selectedSeries && (
                <>
                  <button
                    type="button"
                    className="inline-create"
                    onClick={() => setCreateVolumeInline(!createVolumeInline)}
                  >
                    + Criar novo volume
                  </button>
                  {createVolumeInline && (
                    <div className="inline-create-row">
                      <input
                        aria-label="Número do novo volume"
                        type="number"
                        placeholder="Número"
                        value={inlineVolumeNumber}
                        onChange={(e) => setInlineVolumeNumber(e.target.value)}
                      />
                      <input
                        aria-label="Título do novo volume"
                        placeholder="Título (opcional)"
                        value={inlineVolumeTitle}
                        onChange={(e) => setInlineVolumeTitle(e.target.value)}
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void createVolumeFromUpload()}
                      >
                        Criar
                      </button>
                    </div>
                  )}
                </>
              )}
              {selectedFormat && <p>Tipo: {formatLabel}</p>}
              {selectedFormat === "anime" && <>
                <label><span>Habilitar pular abertura</span><input type="checkbox" checked={skipIntro} onChange={(e) => setSkipIntro(e.target.checked)} /></label>
                <label>Destino da abertura em segundos<input type="number" min="90" max="110" value={introEnd} onChange={(e) => setIntroEnd(Number(e.target.value))} /></label>
              </>}
              {selectedFormat === "novel" && <label>
                Tipo do conteúdo
                <select
                  value={contentType}
                  onChange={(e) =>
                    setContentType(e.target.value as "chapter" | "volume")
                  }
                >
                  <option value="chapter">Capítulo</option>
                  <option value="volume">Volume completo</option>
                </select>
              </label>}
              <div className="form-row">
                <label>
                  Número do capítulo/volume
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={chapterNumber}
                    onChange={(e) => setChapterNumber(e.target.value)}
                  />
                </label>
                <label>
                  Título
                  <input
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                  />
                </label>
              </div>
              <label className="file-picker">
                Arquivo
                <input
                  ref={inputRef}
                  type="file"
                  accept={acceptedMedia}
                  disabled={!selectedSeries || uploading}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <div
                className={`upload-drop ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (selectedSeries) setFile(e.dataTransfer.files[0] || null);
                }}
              >
                <UploadCloud size={19} />
                {uploading
                  ? `Enviando… ${uploadPercent}%`
                  : file?.name || (selectedFormat === "novel" ? "Arraste o PDF ou escolha acima" : selectedFormat === "anime" ? "Arraste o MP4/WebM ou escolha acima" : selectedFormat ? "Arraste o CBZ ou escolha acima" : "Selecione uma obra primeiro")}
                {uploading && (
                  <div className="upload-track">
                    <div style={{ width: `${uploadPercent}%` }} />
                  </div>
                )}
              </div>
              <button
                className="primary-button"
                disabled={!file || !selectedSeries || uploading}
                onClick={() => void uploadFile()}
              >
                {uploading ? "Enviando…" : selectedFormat === "novel" ? "Enviar PDF" : selectedFormat === "anime" ? "Enviar episódio" : "Enviar capítulo"}
              </button>
            </section>
          </div>
        )}
        {showBatchUpload && (
          <BatchUploadModal
            ownerId={user.id}
            series={series}
            volumes={volumes}
            onClose={() => setShowBatchUpload(false)}
            onComplete={load}
          />
        )}
        {editingSeries && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !busy)
                setEditingSeries(null);
            }}
          >
            <section
              className="form-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-series-title"
            >
              <button
                className="modal-close"
                type="button"
                onClick={() => setEditingSeries(null)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
              <span className="eyebrow">Organização da biblioteca</span>
              <h2 id="edit-series-title">Editar obra</h2>
              <label>
                Nome da obra
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={300}
                  autoFocus
                />
              </label>
              <label>
                Descrição opcional
                <textarea
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  rows={3}
                />
              </label>
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEditingSeries(null)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void saveSeriesEdit()}
                  disabled={!editTitle.trim() || busy}
                >
                  {busy ? "Salvando…" : "Salvar alterações"}
                </button>
              </div>
            </section>
          </div>
        )}
        {editingBook && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEditingBook(null);
            }}
          >
            <section
              className="form-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-book-title"
            >
              <button
                className="modal-close"
                type="button"
                onClick={() => setEditingBook(null)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
              <span className="eyebrow">Metadados do capítulo</span>
              <h2 id="edit-book-title">Editar capítulo</h2>
              <label>
                Título
                <input
                  value={editChapterTitle}
                  onChange={(event) => setEditChapterTitle(event.target.value)}
                  autoFocus
                />
              </label>
              <label>
                Número do capítulo
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editChapterNumber}
                  onChange={(event) => setEditChapterNumber(event.target.value)}
                />
              </label>
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEditingBook(null)}
                >
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void saveBookEdit()}
                  disabled={!editChapterTitle.trim()}
                >
                  Salvar alterações
                </button>
              </div>
            </section>
          </div>
        )}
        {deleteTarget && (
          <ConfirmDialog
            title={
              deleteTarget.type === "series"
                ? `Excluir “${deleteTarget.item.title}”?`
                : `Excluir “${deleteTarget.item.title}”?`
            }
            message={
              deleteTarget.type === "series"
                ? "A organização será removida. Os PDFs e o progresso serão preservados e passarão para Sem coleção."
                : "O arquivo PDF e o progresso de leitura serão excluídos permanentemente."
            }
            confirmLabel={
              deleteTarget.type === "series"
                ? "Excluir organização"
                : "Excluir PDF e progresso"
            }
            busy={busy}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              if (deleteTarget.type === "series")
                void removeSeries(deleteTarget.item);
              else void removeBook(deleteTarget.item);
            }}
          />
        )}
      </main>
    </>
  );
}
