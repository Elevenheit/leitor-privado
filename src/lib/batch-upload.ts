import { Upload } from "tus-js-client";
import { BUCKET, supabase } from "@/lib/supabase";
import type { Series, Volume } from "@/lib/types";

export type BatchDraft = {
  id: string;
  file: File;
  seriesId: string;
  volumeId: string;
  volumeNumber: string;
  chapterNumber: string;
  title: string;
  contentType: "chapter" | "volume";
  status: "waiting" | "uploading" | "done" | "error";
  percent: number;
  error: string;
};

export function suggestDraft(file: File, series: Series[], volumes: Volume[]): BatchDraft {
  const base = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  const volumeNumber = base.match(/\b(?:vol(?:ume)?\.?\s*|v)(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(",", ".") || "";
  const chapterNumber = base.match(/\b(?:cap(?:[íi]tulo)?\.?\s*|c)(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(",", ".") || "";
  const matchedSeries = [...series].sort((a, b) => b.title.length - a.title.length).find(item => base.toLocaleLowerCase().startsWith(item.title.toLocaleLowerCase()));
  const residual = base.slice(matchedSeries?.title.length || 0)
    .replace(/\b(?:vol(?:ume)?\.?\s*|v)\d+(?:[.,]\d+)?\b/gi, "")
    .replace(/\b(?:cap(?:[íi]tulo)?\.?\s*|c)\d+(?:[.,]\d+)?\b/gi, "")
    .replace(/^[\s.·–—:-]+|[\s.·–—:-]+$/g, "").trim();
  const matchedVolume = matchedSeries && volumeNumber ? volumes.find(item => item.series_id === matchedSeries.id && item.volume_number === Number(volumeNumber)) : null;
  return { id: crypto.randomUUID(), file, seriesId: matchedSeries?.id || "", volumeId: matchedVolume?.id || (matchedSeries && volumeNumber ? "new" : ""), volumeNumber, chapterNumber,
    title: residual || (chapterNumber ? `Capítulo ${chapterNumber}` : volumeNumber ? `Volume ${volumeNumber}` : base), contentType: volumeNumber && !chapterNumber ? "volume" : "chapter", status: "waiting", percent: 0, error: "" };
}

export async function uploadBatchPdf(file: File, path: string, onProgress: (percent: number) => void) {
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Escolha um PDF.");
  const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (signature !== "%PDF-") throw new Error("O arquivo não parece ser um PDF válido.");
  const { data: { session } } = await supabase().auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, { endpoint, headers: { authorization: `Bearer ${session.access_token}` }, retryDelays: [0, 3000, 5000, 10000, 20000], chunkSize: 6 * 1024 * 1024, uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType: "application/pdf", cacheControl: "3600" }, onError: reject, onSuccess: () => resolve(), onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)) });
    upload.findPreviousUploads().then(previous => { if (previous.length) upload.resumeFromPreviousUpload(previous[0]); upload.start(); }).catch(reject);
  });
}
