export type Book = {
  id: string;
  owner_id: string;
  title: string;
  original_filename: string;
  file_path: string;
  size_bytes: number;
  total_pages: number | null;
  created_at: string;
  series_id: string | null;
  volume_id: string | null;
  chapter_number: number | null;
  chapter_title: string | null;
  sort_order: number;
  content_type: "chapter" | "volume";
};

export type Series = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
};

export type Volume = {
  id: string;
  owner_id: string;
  series_id: string;
  volume_number: number | null;
  title: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ReadingProgress = {
  book_id: string;
  owner_id: string;
  page_number: number;
  line_index: number;
  scroll_ratio: number;
  reading_mode: "text" | "page";
  updated_at: string;
};

export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
