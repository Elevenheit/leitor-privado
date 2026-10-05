import Link from "next/link";
import { mediaHref } from "@/lib/catalog";
import type { Book, ReadingProgress, Volume } from "@/lib/types";

export function ChapterList({ books, volumes, progress, page, hasMore, onPageChange }: {
  books: Book[];
  volumes: Volume[];
  progress: ReadingProgress[];
  page: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
}) {
  const volumeById = new Map(volumes.map(volume => [volume.id, volume]));
  const progressByBook = new Map(progress.map(saved => [saved.book_id, saved]));
  return <section className="volumes-section">
    <h2>Volumes e capítulos</h2>
    {books.map(book => {
      const volume = book.volume_id ? volumeById.get(book.volume_id) : null;
      const saved = progressByBook.get(book.id);
      return <Link className="chapter-row" href={mediaHref(book)} key={book.id}>
        <span className="chapter-number">{book.chapter_number ?? "—"}</span>
        <div className="chapter-info">
          <strong>{book.chapter_title || book.title}</strong>
          <small>{volume ? `Volume ${volume.volume_number ?? ""} · ` : ""}{saved ? saved.completed ? "Concluído" : `Página ${saved.page_number}` : "Não iniciado"}</small>
        </div>
        <span>→</span>
      </Link>;
    })}
    {!books.length && <p className="empty-state">Novos capítulos chegam em breve.</p>}
    <div className="pagination">
      <button disabled={!page} onClick={() => onPageChange(page - 1)}>Anterior</button>
      <button disabled={!hasMore} onClick={() => onPageChange(page + 1)}>Mais capítulos</button>
    </div>
  </section>;
}
