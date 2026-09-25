import type { Series } from "@/lib/types";
import { BUCKET } from "@/lib/supabase";
import { uploadStorageObject } from "@/lib/data/uploads";
import { parseBatchFilename } from "@/lib/batch-parser";

export type BatchDraft = {
  id: string; file: File; chapterNumber: string; volumeNumber: number | null; title: string; resolvedVolumeId: string | null; resolvedVolumeKey: string;
  status: "waiting" | "uploading" | "registering" | "done" | "error" | "cancelled"; percent: number; error: string;
};

export function suggestDraft(file: File, series: Series[] = []): BatchDraft {
  const parsed = parseBatchFilename(file.name, series.map(item => item.title));
  return { id: crypto.randomUUID(), file, chapterNumber: parsed.chapterNumber === null ? "" : String(parsed.chapterNumber), volumeNumber: parsed.volumeNumber, title: parsed.title, resolvedVolumeId: null, resolvedVolumeKey: "", status: "waiting", percent: 0, error: "" };
}

export async function validateBatchFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = ext === "pdf" ? "application/pdf" : ext === "cbz" ? "application/zip" : ext === "mp4" ? "video/mp4" : "";
  if (!type) throw new Error("Formato não suportado. Use PDF, CBZ ou MP4.");
  if (ext === "pdf" && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("O arquivo não parece ser um PDF válido.");
  if (ext === "cbz" && (bytes[0] !== 80 || bytes[1] !== 75 || file.size > 40 * 1024 * 1024)) throw new Error("CBZ inválido ou maior que 40 MB.");
  if (ext === "mp4" && (file.size > 500 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp")) throw new Error("MP4 inválido ou maior que 500 MB.");
  return { extension: ext, contentType: type, mediaType: ext === "pdf" ? "pdf" as const : ext === "cbz" ? "cbz" as const : "video" as const };
}

export async function uploadBatchFile(file: File, path: string, onProgress: (percent: number) => void, signal?: AbortSignal, validated?: Awaited<ReturnType<typeof validateBatchFile>>) {
  const metadata = validated || await validateBatchFile(file);
  await uploadStorageObject(BUCKET, path, file, metadata.contentType, { resumable: true, onProgress, signal });
  return metadata;
}
