import Link from "next/link";
import { mediaHref } from "@/lib/catalog";
import type { Book, ReadingProgress, Volume } from "@/lib/types";

export function ChapterList({
  books,
  volumes,
  progress,
  page,
  hasMore,
  onPageChange,
  currentBookId,
}: {
  books: Book[];
  volumes: Volume[];
  progress: ReadingProgress[];
  page: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  currentBookId?: string;
}) {
  const volumeById = new Map(volumes.map((volume) => [volume.id, volume]));
  const progressByBook = new Map(
    progress.map((saved) => [saved.book_id, saved]),
  );
  const groups: { id: string; books: Book[] }[] = [];
  for (const book of books) {
    const id = book.volume_id || "ungrouped";
    const previous = groups.at(-1);
    if (previous?.id === id) previous.books.push(book);
    else groups.push({ id, books: [book] });
  }
  return (
    <section className="volumes-section">
      <h2>Volumes e capítulos</h2>
      {groups.map((group) => {
        const volume = volumeById.get(group.id);
        return (
          <section
            className="chapter-group"
            key={group.id}
            aria-label={
              volume?.title ||
              (volume
                ? `Volume ${volume.volume_number ?? "sem número"}`
                : "Capítulos sem volume")
            }
          >
            <h3>
              {volume
                ? [
                    volume.volume_number !== null
                      ? `Volume ${volume.volume_number}`
                      : "Volume",
                    volume.title,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Capítulos sem volume"}
            </h3>
            <ul className="chapter-items">
              {group.books.map((book) => {
                const saved = progressByBook.get(book.id);
                return (
                  <li key={book.id}>
                    <Link
                      className={`chapter-row${currentBookId === book.id ? " is-current" : ""}`}
                      href={mediaHref(book)}
                      aria-current={
                        currentBookId === book.id ? "location" : undefined
                      }
                    >
                      <span className="chapter-number">
                        {book.chapter_number ?? "—"}
                      </span>
                      <div className="chapter-info">
                        <strong>{book.chapter_title || book.title}</strong>
                        <small>
                          {currentBookId === book.id ? "Última leitura · " : ""}
                          {saved
                            ? saved.completed
                              ? "Concluído"
                              : `Página ${saved.page_number}`
                            : "Não iniciado"}
                        </small>
                      </div>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!books.length && (
        <p className="empty-state">Novos capítulos chegam em breve.</p>
      )}
      <nav className="pagination" aria-label="Páginas de capítulos">
        <button disabled={!page} onClick={() => onPageChange(page - 1)}>
          Anterior
        </button>
        <span aria-live="polite">Página {page + 1}</span>
        <button disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
          Mais capítulos
        </button>
      </nav>
    </section>
  );
}
