import { Upload } from "tus-js-client";
import { BUCKET, supabase } from "@/lib/supabase";
import type { Series } from "@/lib/types";

export type BatchDraft = {
  id: string; file: File; chapterNumber: string; title: string;
  status: "waiting" | "uploading" | "done" | "error"; percent: number; error: string;
};

export function suggestDraft(file: File, series: Series[] = []): BatchDraft {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const chapterNumber = base.match(/\b(?:cap(?:[íi]tulo)?\.?|epis[oó]dio|ep\.?|chapter|episode|c)\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(",", ".") || "";
  const matchedSeries = [...series].sort((a, b) => b.title.length - a.title.length).find(item => base.toLocaleLowerCase().startsWith(item.title.toLocaleLowerCase()));
  const title = base.slice(matchedSeries?.title.length || 0).replace(/\b(?:cap(?:[íi]tulo)?\.?|epis[oó]dio|ep\.?|chapter|episode|c)\s*\d+(?:[.,]\d+)?\b/gi, "").replace(/^[\s.·–—:-]+|[\s.·–—:-]+$/g, "").trim();
  return { id: crypto.randomUUID(), file, chapterNumber, title: title || (chapterNumber ? `Capítulo ${chapterNumber}` : base), status: "waiting", percent: 0, error: "" };
}

export async function uploadBatchFile(file: File, path: string, onProgress: (percent: number) => void) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = ext === "pdf" ? "application/pdf" : ext === "cbz" ? "application/zip" : ext === "mp4" ? "video/mp4" : "";
  if (!type) throw new Error("Formato não suportado. Use PDF, CBZ ou MP4.");
  if (ext === "pdf" && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("O arquivo não parece ser um PDF válido.");
  if (ext === "cbz" && (bytes[0] !== 80 || bytes[1] !== 75 || file.size > 40 * 1024 * 1024)) throw new Error("CBZ inválido ou maior que 40 MB.");
  if (ext === "mp4" && (file.size > 500 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp")) throw new Error("MP4 inválido ou maior que 500 MB.");
  if (ext !== "pdf") {
    const { error } = await supabase().storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false });
    if (error) throw error;
    onProgress(100); return { mediaType: ext === "cbz" ? "cbz" as const : "video" as const, contentType: type };
  }
  const { data: { session } } = await supabase().auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, { endpoint, headers: { authorization: `Bearer ${session.access_token}` }, retryDelays: [0, 3000, 5000, 10000, 20000], chunkSize: 6 * 1024 * 1024, uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType: type, cacheControl: "3600" }, onError: reject, onSuccess: () => resolve(), onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)) });
    upload.findPreviousUploads().then(previous => { if (previous.length) upload.resumeFromPreviousUpload(previous[0]); upload.start(); }).catch(reject);
  });
  return { mediaType: "pdf" as const, contentType: type };
}
