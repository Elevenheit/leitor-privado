"use client";

import type { Book } from "@/lib/types";

export function LibraryBookRow({ book, selected, seriesTitle, volumeLabel, onToggle }: {
  book: Book;
  selected: boolean;
  seriesTitle: string;
  volumeLabel: string;
  onToggle: () => void;
}) {
  return <label className="manager-row">
    <input type="checkbox" checked={selected} onChange={onToggle}/>
    <span>
      <strong>{book.chapter_title || book.title}</strong>
      <small>{seriesTitle} ? {volumeLabel} ? ordem {book.sort_order}</small>
    </span>
  </label>;
}
