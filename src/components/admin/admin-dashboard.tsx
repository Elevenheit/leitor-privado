"use client";

import Link from "next/link";
import { CatalogAccess } from "@/components/admin/catalog-access";
import { useRef, useState } from "react";
import {
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
import type { User } from "@supabase/supabase-js";
import { BatchUploadModal } from "@/components/library/batch-upload-modal";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Nav } from "@/components/nav";
import { supabase } from "@/lib/supabase";
import { useAdminCatalog } from "@/components/admin/use-admin-catalog";
import { SeriesPicker, VolumePicker } from "./library-picker";
import { SeriesCover } from "@/components/series/series-cover";
import { mediaHref } from "@/lib/catalog";
import { validateCbz, validateImageUpload } from "@/lib/upload-validation";
import {
  deleteBookAndFile,
  deleteSeriesAndMedia,
  findDuplicateBook,
  replaceStorageReference,
  uploadAndRegisterBook,
} from "@/lib/data/uploads";
import { formatSize, type Book, type Series, type Volume } from "@/lib/types";
import type { Format } from "@/lib/catalog";
import { nextVolumeOrder } from "@/lib/data/admin";

export function AdminDashboard({ user }: { user: User }) {
  const [query, setQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [page, setPage] = useState(0);
  const {
    books,
    setBooks,
    series,
    setSeries,
    loading,
    coverUrls,
    load,
    error,
    setError,
    totalCount,
    looseCount,
    fileCount,
    hasMore,
  } = useAdminCatalog(user.id, page, query, favoriteOnly);
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFormat, setNewFormat] = useState<Format>("novel");
  const [selectedSeries, setSelectedSeries] = useState("");
  const [selectedVolume, setSelectedVolume] = useState("");
  const [selectedWork, setSelectedWork] = useState<Series | null>(null);
  const [selectedVolumeItem, setSelectedVolumeItem] = useState<Volume | null>(
    null,
  );
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [contentType, setContentType] = useState<"chapter" | "volume">(
    "chapter",
  );
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
  const operation = useRef(false);
  async function runAction(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function createSeries() {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    setError("");
    if (coverFile) await validateImageUpload(coverFile);
    const { data: created, error: saveError } = await supabase()
      .from("series")
      .insert({
        owner_id: user.id,
        title,
        description: newDescription.trim() || null,
        format: newFormat,
        beta_visible: false,
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
        try {
          await replaceStorageReference(
            "covers",
            path,
            coverFile,
            coverFile.type,
            async (coverPath) => {
              const linked = await supabase()
                .from("series")
                .update({ cover_path: coverPath })
                .eq("id", created.id)
                .select("id")
                .single();
              if (linked.error) throw linked.error;
            },
            async (coverPath) => {
              const current = await supabase()
                .from("series")
                .select("cover_path")
                .eq("id", created.id)
                .maybeSingle();
              if (current.error) throw current.error;
              return current.data?.cover_path === coverPath;
            },
          );
        } catch (cause) {
          setError(
            `Obra criada, mas a capa não foi vinculada: ${cause instanceof Error ? cause.message : "falha no Storage ou no catálogo."}`,
          );
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
        beta_visible: false,
      })
      .select()
      .single();
    if (saveError) setError(saveError.message);
    else {
      setSelectedWork(data as Series);
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
        sort_order:
          number !== null
            ? Math.round(number * 1000)
            : await nextVolumeOrder(user.id, selectedSeries),
      })
      .select()
      .single();
    if (saveError) setError(saveError.message);
    else {
      setSelectedVolumeItem(data as Volume);
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
    if (updateError) setError("Não foi possível salvar a obra.");
    else {
      setSeries((previous) =>
        previous.map((item) =>
          item.id === editingSeries.id
            ? {
                ...item,
                title: editTitle.trim(),
                description: editDescription.trim() || null,
              }
            : item,
        ),
      );
      setEditingSeries(null);
    }
    setBusy(false);
  }

  async function toggleFavorite(item: Series) {
    if (favoriteBusy) return;
    setError("");
    setFavoriteBusy(item.id);
    const next = !item.is_favorite;
    const { error: updateError } = next
      ? await supabase()
          .from("favorites")
          .upsert({ owner_id: user.id, series_id: item.id })
      : await supabase()
          .from("favorites")
          .delete()
          .eq("owner_id", user.id)
          .eq("series_id", item.id);
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
    setError("");
    try {
      await deleteSeriesAndMedia(user.id, item);
      setDeleteTarget(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir a obra.",
      );
    }
    await load();
    setBusy(false);
  }

  async function uploadFile() {
    if (!file || uploading || !selectedSeries || !selectedFormat) return;
    setError("");
    const parsedChapterNumber =
      chapterNumber.trim() !== "" ? Number(chapterNumber) : null;
    if (
      parsedChapterNumber !== null &&
      (!Number.isFinite(parsedChapterNumber) || parsedChapterNumber < 0)
    ) {
      setError("O número do capítulo deve ser zero ou maior.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const mediaType = selectedFormat === "novel" ? "pdf" : "cbz";
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
      if (
        mediaType === "cbz" &&
        (extension !== "cbz" ||
          file.size > 40 * 1024 * 1024 ||
          bytes[0] !== 80 ||
          bytes[1] !== 75)
      ) {
        setError("Use um arquivo CBZ ZIP válido de até 40 MB.");
        return;
      }
    }
    const path = `${user.id}/${selectedSeries}/${selectedVolume || "unassigned"}/${crypto.randomUUID()}.${extension}`;
    setUploading(true);
    setUploadPercent(0);
    try {
      await findDuplicateBook(selectedSeries, file.name);
      const objectType =
        mediaType === "pdf" ? "application/pdf" : "application/zip";
      const totalPages = mediaType === "cbz" ? await validateCbz(file) : null;
      await uploadAndRegisterBook(
        {
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
          chapter_number: parsedChapterNumber,
          chapter_title: chapterTitle.trim() || null,
          sort_order:
            parsedChapterNumber !== null
              ? Math.round(parsedChapterNumber * 1000)
              : 0,
          content_type: contentType,
          media_type: mediaType,
          total_pages: totalPages,
        },
        file,
        objectType,
        { resumable: true, onProgress: setUploadPercent },
      );
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
    try {
      await deleteBookAndFile(user.id, book);
      setDeleteTarget(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir o arquivo.",
      );
    }
    await load();
    setBusy(false);
  }

  function editBook(book: Book) {
    setEditingBook(book);
    setEditChapterTitle(book.chapter_title || book.title);
    setEditChapterNumber(book.chapter_number?.toString() ?? "");
  }

  async function saveBookEdit() {
    if (!editingBook || !editChapterTitle.trim()) return;
    const chapter_number = editChapterNumber.trim()
      ? Number(editChapterNumber)
      : null;
    if (
      chapter_number !== null &&
      (!Number.isFinite(chapter_number) || chapter_number < 0)
    ) {
      setError("O número do capítulo deve ser zero ou maior.");
      return;
    }
    const { error: updateError } = await supabase()
      .from("books")
      .update({
        chapter_title: editChapterTitle.trim(),
        title: editChapterTitle.trim(),
        chapter_number,
        sort_order:
          chapter_number !== null
            ? Math.round(chapter_number * 1000)
            : editingBook.sort_order,
      })
      .eq("id", editingBook.id)
      .eq("owner_id", user.id);
    if (updateError) setError("Não foi possível salvar o capítulo.");
    else {
      setBooks((previous) =>
        previous.map((item) =>
          item.id === editingBook.id
            ? {
                ...item,
                title: editChapterTitle.trim(),
                chapter_title: editChapterTitle.trim(),
                chapter_number,
                sort_order:
                  chapter_number !== null
                    ? Math.round(chapter_number * 1000)
                    : item.sort_order,
              }
            : item,
        ),
      );
      setEditingBook(null);
    }
  }

  const groupedSeries = series;
  const looseBooks = books;
  const selectedSeriesData = selectedWork;
  const selectedFormat = selectedSeriesData?.format || null;
  const formatLabel =
    selectedFormat === "novel"
      ? "Light Novel"
      : selectedFormat === "manga"
        ? "Mangá"
        : selectedFormat === "manhwa"
          ? "Manhwa"
          : "";
  const acceptedMedia =
    selectedFormat === "novel"
      ? ".pdf,application/pdf"
      : selectedFormat
        ? ".cbz,application/zip,application/vnd.comicbook+zip"
        : undefined;

  return (
    <>
      <Nav />
      <main
        id="main-content"
        tabIndex={-1}
        className="dashboard admin-dashboard"
      >
        <CatalogAccess ownerId={user.id} onChanged={load} />
        <section className="library-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Administração do acervo</span>
              <h1>
                Gerenciar biblioteca <span className="count">{totalCount}</span>
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
              <button onClick={() => void load()}>Atualizar acervo</button>
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
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="library-filters">
              <button
                className={!favoriteOnly ? "selected" : ""}
                aria-pressed={!favoriteOnly}
                onClick={() => {
                  setFavoriteOnly(false);
                  setPage(0);
                }}
              >
                Todos
              </button>
              <button
                className={favoriteOnly ? "selected" : ""}
                aria-pressed={favoriteOnly}
                onClick={() => {
                  setFavoriteOnly(true);
                  setPage(0);
                }}
              >
                <Star size={13} /> Favoritos
              </button>
            </div>
            <span className="muted">
              {fileCount}{" "}
              {fileCount === 1 ? "arquivo no acervo" : "arquivos no acervo"}
            </span>
          </div>
          {loading ? (
            <p className="empty-state">Carregando biblioteca…</p>
          ) : (
            <>
              {groupedSeries.length > 0 && (
                <div className="series-grid">
                  {groupedSeries.map((item, index) => {
                    const volumeCount = item.volume_count;
                    return (
                      <article className="series-card" key={item.id}>
                        <Link
                          href={`/admin/series/${item.id}`}
                          className={`series-cover cover-${index % 5}`}
                          aria-label={`Administrar ${item.title}`}
                        >
                          <SeriesCover
                            title={item.title}
                            src={coverUrls[item.id]}
                          />
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
                              onClick={() =>
                                void runAction(() => toggleFavorite(item))
                              }
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
                              {item.chapter_count}{" "}
                              {item.chapter_count === 1
                                ? "capítulo"
                                : "capítulos"}
                            </p>
                          </div>
                          <small className="visibility-badge">
                            {item.beta_visible
                              ? "Publicada"
                              : "Restrita à administração"}
                          </small>
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
                      <span className="eyebrow">Arquivos sem obra</span>
                      <h2>
                        Sem coleção <span className="count">{looseCount}</span>
                      </h2>
                    </div>
                  </div>
                  <div className="loose-list">
                    {looseBooks.map((book) => {
                      return (
                        <article className="loose-row" key={book.id}>
                          <Link href={mediaHref(book)} className="loose-icon">
                            <FileText size={20} />
                          </Link>
                          <div className="loose-details">
                            <Link href={mediaHref(book)}>{book.title}</Link>
                            <small>
                              {formatSize(book.size_bytes)} ·{" "}
                              {book.media_type.toUpperCase()}
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
                            aria-label="Excluir arquivo"
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
                          : "Crie uma obra ou envie um arquivo para começar."}
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
          <nav className="pagination" aria-label="Páginas da administração">
            <button
              disabled={!page || loading}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              disabled={!hasMore || loading}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </nav>
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
              <p className="field-helper">
                Novas obras ficam restritas à administração. A liberação exige
                autorização de compartilhamento.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
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
                <select
                  value={newFormat}
                  onChange={(e) => setNewFormat(e.target.value as Format)}
                >
                  <option value="novel">Light Novel</option>
                  <option value="manga">Mangá</option>
                  <option value="manhwa">Manhwa</option>
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
                onClick={() => void runAction(createSeries)}
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
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <SeriesPicker
                ownerId={user.id}
                value={selectedWork}
                disabled={uploading || busy}
                onChange={(work) => {
                  setSelectedWork(work);
                  setSelectedSeries(work?.id || "");
                  setSelectedVolume("");
                  setSelectedVolumeItem(null);
                  setFile(null);
                }}
              />
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
                  <select
                    aria-label="Tipo da obra"
                    value={inlineSeriesFormat}
                    onChange={(e) =>
                      setInlineSeriesFormat(e.target.value as Format)
                    }
                  >
                    <option value="novel">Light Novel</option>
                    <option value="manga">Mangá</option>
                    <option value="manhwa">Manhwa</option>
                  </select>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void runAction(createSeriesFromUpload)}
                  >
                    Criar
                  </button>
                </div>
              )}
              <VolumePicker
                ownerId={user.id}
                seriesId={selectedSeries}
                value={selectedVolumeItem}
                disabled={!selectedSeries || uploading || busy}
                onChange={(volume) => {
                  setSelectedVolumeItem(volume);
                  setSelectedVolume(volume?.id || "");
                }}
              />
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
                        onClick={() => void runAction(createVolumeFromUpload)}
                      >
                        Criar
                      </button>
                    </div>
                  )}
                </>
              )}
              {selectedFormat && <p>Tipo: {formatLabel}</p>}
              {selectedFormat === "novel" && (
                <label>
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
                </label>
              )}
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
                  : file?.name ||
                    (selectedFormat === "novel"
                      ? "Arraste o PDF ou escolha acima"
                      : selectedFormat
                        ? "Arraste o CBZ ou escolha acima"
                        : "Selecione uma obra primeiro")}
                {uploading && (
                  <div className="upload-track">
                    <div style={{ width: `${uploadPercent}%` }} />
                  </div>
                )}
              </div>
              <button
                className="primary-button"
                disabled={!file || !selectedSeries || uploading}
                onClick={() => void runAction(uploadFile)}
              >
                {uploading
                  ? "Enviando…"
                  : selectedFormat === "novel"
                    ? "Enviar PDF"
                    : "Enviar capítulo"}
              </button>
            </section>
          </div>
        )}
        {showBatchUpload && (
          <BatchUploadModal
            ownerId={user.id}
            series={series}

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
                  onClick={() => void runAction(saveSeriesEdit)}
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
                  onClick={() => void runAction(saveBookEdit)}
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
                ? "A organização será removida. Os arquivos e o progresso serão preservados e passarão para Sem coleção."
                : "O arquivo e o progresso de leitura serão excluídos permanentemente."
            }
            confirmLabel={
              deleteTarget.type === "series"
                ? "Excluir organização"
                : "Excluir arquivo e progresso"
            }
            busy={busy}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              if (deleteTarget.type === "series")
                void runAction(() => removeSeries(deleteTarget.item));
              else void runAction(() => removeBook(deleteTarget.item));
            }}
          />
        )}
      </main>
    </>
  );
}
