import type { Series } from "@/lib/types";
import { BUCKET } from "@/lib/supabase";
import { uploadStorageObject } from "@/lib/data/uploads";
import { parseBatchFilename } from "@/lib/batch-parser";
import { validateStorageUpload } from "@/lib/upload-validation";

export type BatchDraft = {
  id: string; file: File; chapterNumber: string; volumeNumber: number | null; title: string; mediaType: "pdf" | "cbz"; resolvedVolumeId: string | null; resolvedVolumeKey: string;
  status: "waiting" | "uploading" | "registering" | "done" | "error" | "cancelled"; percent: number; error: string;
};

export function suggestDraft(file: File, series: Series[] = []): BatchDraft {
  const parsed = parseBatchFilename(file.name, series.map(item => item.title));
  return { id: crypto.randomUUID(), file, chapterNumber: parsed.chapterNumber === null ? "" : String(parsed.chapterNumber), volumeNumber: parsed.volumeNumber, title: parsed.title, mediaType: /\.cbz$/i.test(file.name) ? "cbz" : "pdf", resolvedVolumeId: null, resolvedVolumeKey: "", status: "waiting", percent: 0, error: "" };
}

export async function validateBatchFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "pdf" && ext !== "cbz") throw new Error("Formato não suportado. Use PDF ou CBZ.");
  const totalPages = await validateStorageUpload(file, "novels");
  return { extension: ext, contentType: ext === "pdf" ? "application/pdf" : "application/zip", mediaType: ext as "pdf" | "cbz", totalPages: typeof totalPages === "number" ? totalPages : null };
}

export async function uploadBatchFile(file: File, path: string, onProgress: (percent: number) => void, signal?: AbortSignal, validated?: Awaited<ReturnType<typeof validateBatchFile>>) {
  const metadata = validated || await validateBatchFile(file);
  await uploadStorageObject(BUCKET, path, file, metadata.contentType, { resumable: true, onProgress, signal });
  return metadata;
}
