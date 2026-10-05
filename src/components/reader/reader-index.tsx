"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { readingStatus, sortVolumes } from "@/lib/reader-navigation";
import type { Book, ReadingProgress, Series, Volume } from "@/lib/types";

export function ReaderIndex({ series, volumes, books, progress, currentId, onClose, onNavigate, onLoadMore, hasMore, loading, error }: {
  series: Series | null;
  volumes: Volume[];
  books: Book[];
  progress: Record<string, ReadingProgress>;
  currentId: string;
  onClose: () => void;
  onNavigate: (bookId: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  error: string;
}) {
  const groups = [{ id: "loose", title: "Sem volume", books: books.filter(book => !book.volume_id) },
    ...sortVolumes(volumes).map(volume => ({ id: volume.id, title: `${volume.volume_number !== null ? `Volume ${volume.volume_number}` : "Volume sem número"}${volume.title ? ` · ${volume.title}` : ""}`, books: books.filter(book => book.volume_id === volume.id) }))]
    .filter(group => group.books.length);

  return <div className="reader-index-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="reader-index" role="dialog" aria-modal="true" aria-label="Índice da obra">
      <header><div><small>Índice da obra</small><strong>{series?.title || "PDFs sem coleção"}</strong></div><button aria-label="Fechar índice" onClick={onClose}><X size={19}/></button></header>
      <div className="reader-index-list">{error && <p role="alert" className="error">{error}</p>}{groups.length ? groups.map(group => <section key={group.id}><h2>{group.title}</h2><ol>{group.books.map(book => <li key={book.id}><Link href={`/read/${book.id}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(book.id); }} aria-current={book.id === currentId ? "page" : undefined} className={book.id === currentId ? "current" : ""}><span>{book.chapter_number !== null ? `Cap. ${book.chapter_number}` : book.content_type === "volume" ? "Volume completo" : "Extra"}</span><strong>{book.chapter_title || book.title}</strong><small>{readingStatus(book, progress[book.id])}</small></Link></li>)}</ol></section>) : !error && <p>Nenhum capítulo disponível.</p>}{hasMore && <button className="secondary-button" type="button" onClick={onLoadMore} disabled={loading}>{loading ? "Carregando..." : "Carregar mais capítulos"}</button>}</div>
    </aside>
  </div>;
}
