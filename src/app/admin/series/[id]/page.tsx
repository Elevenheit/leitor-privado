"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { BetaAccess } from "@/components/beta-access";
import { mediaHref } from "@/lib/catalog";
import { AuthGate } from "@/components/auth-gate";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Nav } from "@/components/nav";
import { supabase } from "@/lib/supabase";
import { calculateReadingProgress } from "@/lib/media-rules";
import { getWorkPage } from "@/lib/data/catalog";
import { nextVolumeOrder } from "@/lib/data/admin";
import { toDataError } from "@/lib/data/errors";
import { SeriesPicker, VolumePicker } from "@/components/admin/library-picker";
import { SeriesCover } from "@/components/series/series-cover";
import type { Book, ReadingProgress, Series, Volume } from "@/lib/types";

export default function SeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState("");
  useEffect(() => {
    void params.then(({ id: value }) => setId(value));
  }, [params]);
  if (!id)
    return (
      <main id="main-content" tabIndex={-1} className="reader-status">
        Abrindo obra…
      </main>
    );
  return (
    <AuthGate>
      {(user) => (
        <BetaAccess admin>
          <SeriesDetail key={`${user.id}:${id}`} user={user} id={id} />
        </BetaAccess>
      )}
    </AuthGate>
  );
}

function SeriesDetail({ user, id }: { user: User; id: string }) {
  const [series, setSeries] = useState<Series | null>(null);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [chapterVolumeItem, setChapterVolumeItem] = useState<Volume | null>(
    null,
  );
  const [chapterWork, setChapterWork] = useState<Series | null>(null);
  const [managedVolume, setManagedVolume] = useState<Volume | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [volumeTitle, setVolumeTitle] = useState("");
  const [volumeNumber, setVolumeNumber] = useState("");
  const [editingVolume, setEditingVolume] = useState<Volume | null>(null);
  const [editVolumeNumber, setEditVolumeNumber] = useState("");
  const [editVolumeTitle, setEditVolumeTitle] = useState("");
  const [deleteVolumeTarget, setDeleteVolumeTarget] = useState<Volume | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [chapterName, setChapterName] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterSeries, setChapterSeries] = useState(id);
  const [chapterVolume, setChapterVolume] = useState("");
  const [page, setPage] = useState(0);
  const [summary, setSummary] = useState({
    chapterCount: 0,
    completedCount: 0,
    volumeCount: 0,
    hasMore: false,
  });
  const [lastRead, setLastRead] = useState<Pick<
    Book,
    "id" | "media_type"
  > | null>(null);
  const generation = useRef(0);
  const operation = useRef(false);
  const [coverUrl, setCoverUrl] = useState("");

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const result = await getWorkPage(id, page, user.id);
      if (request !== generation.current) return;
      if (!result.series || result.series.owner_id !== user.id)
        throw new Error("Obra indisponível.");
      setSeries(result.series);
      setVolumes(result.volumes);
      setBooks(result.books);
      setSummary(result);
      setLastRead(result.lastRead);
      setProgress(
        Object.fromEntries(result.progress.map((item) => [item.book_id, item])),
      );
      const url = result.series.cover_path
        ? await supabase()
            .storage.from("covers")
            .createSignedUrl(result.series.cover_path, 3600)
        : null;
      if (request === generation.current)
        setCoverUrl(url?.data?.signedUrl || "");
    } catch (cause) {
      if (request === generation.current)
        setError(
          toDataError(
            cause,
            "Não foi possível carregar a obra. Tente novamente.",
          ).message,
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [id, user.id, page]);
  useEffect(() => {
    const requests = generation;
    const timer = setTimeout(() => {
      setError("");
      void load();
    }, 0);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);
  async function runAction(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        toDataError(cause, "Não foi possível concluir. Tente novamente.")
          .message,
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function createVolume() {
    if (!volumeNumber && !volumeTitle.trim()) return;
    const number = volumeNumber ? Number(volumeNumber) : null;
    if (number !== null && (!Number.isFinite(number) || number < 0)) {
      setError("O número do volume deve ser zero ou maior.");
      return;
    }
    const { error: saveError } = await supabase()
      .from("volumes")
      .insert({
        owner_id: user.id,
        series_id: id,
        volume_number: number,
        title: volumeTitle.trim() || null,
        sort_order:
          number !== null
            ? Math.round(number * 1000)
            : await nextVolumeOrder(user.id, id),
      });
    if (saveError) setError(saveError.message);
    else {
      setVolumeNumber("");
      setVolumeTitle("");
      await load();
    }
  }
  function editVolume(volume: Volume) {
    setEditingVolume(volume);
    setEditVolumeNumber(volume.volume_number?.toString() ?? "");
    setEditVolumeTitle(volume.title || "");
  }
  async function saveVolumeEdit() {
    if (!editingVolume) return;
    const number = editVolumeNumber.trim() ? Number(editVolumeNumber) : null;
    if (number !== null && (!Number.isFinite(number) || number < 0)) {
      setError("O número do volume deve ser zero ou maior.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase()
      .from("volumes")
      .update({
        volume_number: number,
        title: editVolumeTitle.trim() || null,
        sort_order:
          number !== null
            ? Math.round(number * 1000)
            : editingVolume.sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingVolume.id)
      .eq("owner_id", user.id);
    if (updateError) setError(updateError.message);
    else setEditingVolume(null);
    await load();
    setBusy(false);
  }
  function deleteVolume(volume: Volume) {
    setDeleteVolumeTarget(volume);
  }
  async function removeVolume(volume: Volume) {
    setBusy(true);
    const { error: deleteError } = await supabase()
      .from("volumes")
      .delete()
      .eq("id", volume.id)
      .eq("owner_id", user.id);
    if (deleteError) setError(deleteError.message);
    else setDeleteVolumeTarget(null);
    await load();
    setBusy(false);
  }
  function openEdit(book: Book) {
    setEditing(book);
    setChapterName(book.chapter_title || book.title);
    setChapterNumber(book.chapter_number?.toString() ?? "");
    setChapterSeries(book.series_id || id);
    setChapterVolume(book.volume_id || "");
    setChapterWork(series);
    setChapterVolumeItem(
      volumes.find((volume) => volume.id === book.volume_id) || null,
    );
  }
  async function saveChapter() {
    if (!editing || !chapterName.trim()) return;
    const selectedVolume = chapterVolumeItem;
    if (
      chapterVolume &&
      (!selectedVolume || selectedVolume.series_id !== chapterSeries)
    ) {
      setError("O volume selecionado não pertence à obra escolhida.");
      return;
    }
    const number = chapterNumber.trim() ? Number(chapterNumber) : null;
    if (number !== null && (!Number.isFinite(number) || number < 0)) {
      setError("O número do capítulo deve ser zero ou maior.");
      return;
    }
    const { error: updateError } = await supabase()
      .from("books")
      .update({
        title: chapterName.trim(),
        chapter_title: chapterName.trim(),
        chapter_number: number,
        sort_order:
          number !== null ? Math.round(number * 1000) : editing.sort_order,
        series_id: chapterSeries || null,
        volume_id: chapterVolume || null,
      })
      .eq("id", editing.id)
      .eq("owner_id", user.id);
    if (updateError) setError(updateError.message);
    else setEditing(null);
    await load();
  }
  const wholeChapters = books.filter((book) => !book.volume_id);
  const chapterCount = summary.chapterCount;
  const overallProgress = chapterCount
    ? Math.round((summary.completedCount / chapterCount) * 100)
    : 0;

  if (loading)
    return (
      <>
        <Nav back />
        <main id="main-content" tabIndex={-1} className="reader-status">
          Carregando obra…
        </main>
      </>
    );
  if (!series)
    return (
      <>
        <Nav back />
        <main id="main-content" tabIndex={-1} className="reader-status">
          <h1>Obra não encontrada</h1>
          <p>{error || "A obra não existe ou você não tem acesso."}</p>
          <Link className="primary-button" href="/">
            Voltar
          </Link>
        </main>
      </>
    );
  return (
    <>
      <Nav back />
      <main id="main-content" tabIndex={-1} className="series-page">
        <Link className="back-link" href="/admin">
          <ArrowLeft size={16} /> Administração
        </Link>
        <section className="series-hero">
          <div className="series-hero-cover">
            <SeriesCover title={series.title} src={coverUrl} />
          </div>
          <div className="series-hero-copy">
            <span className="eyebrow">
              Administração ·{" "}
              {series.beta_visible ? "Publicada" : "Restrita"}
            </span>
            <h1>{series.title}</h1>
            {series.description && <p>{series.description}</p>}
            <div className="series-stats">
              <span>
                {summary.volumeCount}{" "}
                {summary.volumeCount === 1 ? "volume" : "volumes"}
              </span>
              <span>
                {chapterCount} {chapterCount === 1 ? "arquivo" : "arquivos"}
              </span>
              {overallProgress > 0 && (
                <span>{overallProgress}% concluídos</span>
              )}
            </div>
            {lastRead && (
              <Link className="last-read" href={mediaHref(lastRead)}>
                {" "}
                <BookOpen size={16} /> Continuar leitura{" "}
                <ChevronRight size={15} />
              </Link>
            )}
          </div>
        </section>
        {error && (
          <div className="error dashboard-error">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        <section className="volumes-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Organize sua leitura</span>
              <h2>
                Volumes <span className="count">{summary.volumeCount}</span>
              </h2>
            </div>
          </div>
          <form
            className="new-volume-form"
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(createVolume);
            }}
          >
            <label>
              Número
              <input
                type="number"
                min="0"
                step="any"
                placeholder="16"
                value={volumeNumber}
                onChange={(e) => setVolumeNumber(e.target.value)}
              />
            </label>
            <label>
              Título opcional
              <input
                placeholder="Subtítulo do volume"
                value={volumeTitle}
                onChange={(e) => setVolumeTitle(e.target.value)}
              />
            </label>
            <button className="secondary-button" type="submit">
              <Plus size={16} /> Criar volume
            </button>
          </form>
          <details className="volume-manager">
            <summary>Encontrar e editar um volume</summary>
            <VolumePicker
              ownerId={user.id}
              seriesId={id}
              value={managedVolume}
              onChange={setManagedVolume}
              disabled={busy}
            />
            {managedVolume && (
              <div className="batch-actions">
                <button onClick={() => editVolume(managedVolume)}>
                  Editar volume
                </button>
                <button onClick={() => deleteVolume(managedVolume)}>
                  Excluir organização do volume
                </button>
              </div>
            )}
          </details>
          <p className="muted">
            Arquivos {page * 100 + (books.length ? 1 : 0)}–
            {page * 100 + books.length} de {summary.chapterCount}
          </p>
          {volumes.map((volume) => {
            const chapters = books.filter(
              (book) => book.volume_id === volume.id,
            );
            return (
              <section className="volume-section" key={volume.id}>
                <header className="volume-heading">
                  <div>
                    <span className="eyebrow">
                      {volume.volume_number !== null
                        ? `Volume ${volume.volume_number}`
                        : "Volume"}
                    </span>
                    <h3>
                      {volume.title ||
                        `Volume ${volume.volume_number ?? "sem número"}`}
                    </h3>
                    <small>{chapters.length} arquivos nesta página</small>
                  </div>
                  <div className="volume-actions">
                    <button
                      aria-label="Editar e reorganizar volume"
                      onClick={() => void editVolume(volume)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      aria-label="Excluir volume"
                      onClick={() => void deleteVolume(volume)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </header>
                <ChapterList
                  chapters={chapters}
                  progress={progress}
                  onEdit={openEdit}
                />
              </section>
            );
          })}
          {wholeChapters.length > 0 && (
            <section className="volume-section">
              <header className="volume-heading">
                <div>
                  <span className="eyebrow">Capítulos</span>
                  <h3>Sem volume</h3>
                </div>
              </header>
              <ChapterList
                chapters={wholeChapters}
                progress={progress}
                onEdit={openEdit}
              />
            </section>
          )}
          {!volumes.length && !wholeChapters.length && (
            <div className="empty-state">
              <BookOpen size={30} />
              <h3>Nenhum capítulo cadastrado</h3>
              <p>
                Adicione um PDF pela biblioteca para associá-lo a esta obra.
              </p>
              <Link href="/" className="primary-button">
                Voltar à biblioteca
              </Link>
            </div>
          )}
        </section>
        <nav className="pagination" aria-label="Páginas de arquivos">
          <button disabled={!page || busy} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            disabled={!summary.hasMore || busy}
            onClick={() => setPage(page + 1)}
          >
            Mais arquivos
          </button>
        </nav>
        {editingVolume && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !busy)
                setEditingVolume(null);
            }}
          >
            <section
              className="form-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-volume-title"
            >
              <button
                className="modal-close"
                type="button"
                onClick={() => setEditingVolume(null)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
              <span className="eyebrow">Organização da obra</span>
              <h2 id="edit-volume-title">Editar volume</h2>
              <label>
                Número e ordem
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editVolumeNumber}
                  onChange={(event) => setEditVolumeNumber(event.target.value)}
                  autoFocus
                />
              </label>
              <label>
                Título opcional
                <input
                  value={editVolumeTitle}
                  onChange={(event) => setEditVolumeTitle(event.target.value)}
                />
              </label>
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEditingVolume(null)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void runAction(saveVolumeEdit)}
                  disabled={busy}
                >
                  {busy ? "Salvando…" : "Salvar alterações"}
                </button>
              </div>
            </section>
          </div>
        )}
        {editing && (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setEditing(null);
            }}
          >
            <section
              className="form-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-chapter-title"
            >
              <button
                className="modal-close"
                onClick={() => setEditing(null)}
                aria-label="Fechar"
              >
                ×
              </button>
              <span className="eyebrow">Metadados do PDF</span>
              <h2 id="edit-chapter-title">Editar capítulo</h2>
              <label>
                Título
                <input
                  value={chapterName}
                  onChange={(e) => setChapterName(e.target.value)}
                />
              </label>
              <label>
                Número
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={chapterNumber}
                  onChange={(e) => setChapterNumber(e.target.value)}
                />
              </label>
              <SeriesPicker
                ownerId={user.id}
                value={chapterWork}
                emptyLabel="Sem coleção"
                disabled={busy}
                onChange={(work) => {
                  setChapterWork(work);
                  setChapterSeries(work?.id || "");
                  setChapterVolume("");
                  setChapterVolumeItem(null);
                }}
              />
              <VolumePicker
                ownerId={user.id}
                seriesId={chapterSeries}
                value={chapterVolumeItem}
                disabled={!chapterSeries || busy}
                onChange={(volume) => {
                  setChapterVolumeItem(volume);
                  setChapterVolume(volume?.id || "");
                }}
              />
              <button
                className="primary-button"
                onClick={() => void runAction(saveChapter)}
              >
                <Check size={17} /> Salvar capítulo
              </button>
            </section>
          </div>
        )}
        {deleteVolumeTarget && (
          <ConfirmDialog
            title={`Excluir ${deleteVolumeTarget.title || `Volume ${deleteVolumeTarget.volume_number ?? ""}`}?`}
            message="A organização do volume será removida. Os PDFs e o progresso serão preservados e os capítulos passarão para Sem volume."
            confirmLabel="Excluir organização"
            busy={busy}
            onCancel={() => setDeleteVolumeTarget(null)}
            onConfirm={() =>
              void runAction(() => removeVolume(deleteVolumeTarget))
            }
          />
        )}
        <footer className="site-footer">
          nook. <span>Um capítulo de cada vez.</span>
        </footer>
      </main>
    </>
  );
}

function ChapterList({
  chapters,
  progress,
  onEdit,
}: {
  chapters: Book[];
  progress: Record<string, ReadingProgress>;
  onEdit: (book: Book) => void;
}) {
  return (
    <ol className="chapter-list">
      {chapters.map((book, index) => {
        const saved = progress[book.id];
        const measured = saved
          ? calculateReadingProgress({
              mediaType: book.media_type,
              pageNumber: saved.page_number,
              totalPages: book.total_pages,
              scrollRatio: saved.scroll_ratio,
            })
          : null;
        const done = Boolean(saved?.completed) || measured?.completed;
        const percent = done ? 100 : measured?.percent || 0;
        return (
          <li className="chapter-row" key={book.id}>
            <span
              className={`chapter-number ${book.content_type === "volume" ? "volume-number" : ""}`}
            >
              {book.content_type === "volume"
                ? `V${book.chapter_number ?? ""}`
                : (book.chapter_number ?? index + 1)}
            </span>
            <div className="chapter-info">
              <Link href={mediaHref(book)}>
                {book.content_type === "volume"
                  ? `Volume completo · ${book.chapter_title || book.title}`
                  : book.chapter_title || book.title}
              </Link>
              <small>
                {done ? "Concluído" : saved ? "Lendo" : "Não iniciado"}
                {saved && book.total_pages ? ` · ${percent}%` : ""}
              </small>
              <div className="book-progress">
                <div style={{ width: `${percent}%` }} />
              </div>
            </div>
            <Link className="chapter-continue" href={mediaHref(book)}>
              {saved ? "Continuar" : "Ler"}
              <ChevronRight size={16} />
            </Link>
            <button
              className="chapter-edit"
              onClick={() => onEdit(book)}
              aria-label="Editar capítulo ou mover"
            >
              <Pencil size={15} />
            </button>
          </li>
        );
      })}
      {!chapters.length && (
        <li className="chapter-empty">Ainda não há capítulos neste volume.</li>
      )}
    </ol>
  );
}
