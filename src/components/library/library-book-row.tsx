"use client";

import { FileText } from "lucide-react";
import type { Book } from "@/lib/types";

export function LibraryBookRow({
  book,
  selected,
  seriesTitle,
  volumeLabel,
  onToggle,
}: {
  book: Book;
  selected: boolean;
  seriesTitle: string;
  volumeLabel: string;
  onToggle: () => void;
}) {
  return (
    <label className="manager-row">
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <span className="manager-file-icon">
        <FileText size={19} />
      </span>
      <span>
        <strong>{book.chapter_title || book.title}</strong>
        <small>
          {seriesTitle} · {volumeLabel} · ordem {book.sort_order}
        </small>
      </span>
      <small className="manager-format">{book.media_type.toUpperCase()}</small>
    </label>
  );
}
