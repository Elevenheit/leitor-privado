import { validateStorageUpload } from "@/lib/upload-validation";
import { Upload } from "tus-js-client";
import { BUCKET, supabase } from "@/lib/supabase";
import type { Book, Series } from "@/lib/types";
import { DataError, throwOnError, toDataError } from "./errors";

export type StorageBucket = "novels" | "covers" | "profiles";
type UploadOptions = {
  resumable?: boolean;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

export async function findDuplicateBook(seriesId: string, filename: string) {
  const result = await supabase().from("books").select("id").eq("series_id", seriesId).eq("original_filename", filename).limit(1);
  const rows = throwOnError(result, "Não foi possível verificar arquivos duplicados.");
  if (rows?.length) throw new DataError("Já existe um arquivo com este nome nesta obra.", "unknown");
}

export async function findOrCreateVolume(ownerId: string, seriesId: string, volumeNumber: number, existingId?: string) {
  if (existingId) return existingId;
  const current = await supabase().from("volumes").select("id").eq("series_id", seriesId).eq("volume_number", volumeNumber).limit(1).maybeSingle();
  const found = throwOnError(current, "Não foi possível verificar volumes existentes.");
  if (found?.id) return found.id as string;
  const result = await supabase().from("volumes").insert({ owner_id: ownerId, series_id: seriesId, volume_number: volumeNumber, sort_order: Math.round(volumeNumber * 1000) }).select("id").single();
  if (result.error) {
    const raced = await supabase().from("volumes").select("id").eq("series_id", seriesId).eq("volume_number", volumeNumber).limit(1).maybeSingle();
    if (raced.data?.id) return raced.data.id as string;
  }
  const volume = throwOnError(result, "Não foi possível criar o volume.");
  if (!volume) throw new DataError("Não foi possível criar o volume.", "unknown");
  return volume.id as string;
}

async function uploadResumable(file: File, path: string, contentType: string, onProgress?: (percent: number) => void, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Upload cancelado.", "AbortError");
  const { data: { session }, error } = await supabase().auth.getSession();
  if (error) throw toDataError(error, "Não foi possível validar a sessão para o upload.");
  if (!session) throw new DataError("Sua sessão expirou. Entre novamente.", "session");
  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const upload = new Upload(file, {
      endpoint,
      headers: { authorization: `Bearer ${session.access_token}` },
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType, cacheControl: "3600" },
      onError: cause => finish(() => reject(cause)),
      onSuccess: () => finish(resolve),
      onProgress: (sent, total) => onProgress?.(Math.round(sent / total * 100)),
    });
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      done();
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      void upload.abort(true).finally(() => reject(new DOMException("Upload cancelado.", "AbortError")));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    void upload.findPreviousUploads().then(previous => {
      if (settled) return;
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(cause => finish(() => reject(cause)));
  });
}

export async function uploadStorageObject(bucket: StorageBucket, path: string, file: File, contentType: string, options: UploadOptions = {}) {
  await validateStorageUpload(file, bucket);
  try {
    if (options.resumable) {
      if (bucket !== BUCKET) throw new DataError("Upload resumível só está habilitado no bucket de mídia.", "unknown");
      await uploadResumable(file, path, contentType, options.onProgress, options.signal);
      return;
    }
    if (options.signal?.aborted) throw new DOMException("Upload cancelado.", "AbortError");
    const { error } = await supabase().storage.from(bucket).upload(path, file, { contentType, upsert: false });
    if (error) throw toDataError(error, "Não foi possível enviar o arquivo.");
    options.onProgress?.(100);
  } catch (cause) {
    await cleanupObject(bucket, path, cause);
    throw toDataError(cause, "Não foi possível enviar o arquivo.");
  }
}

async function cleanupObject(bucket: StorageBucket, path: string, original: unknown) {
  const cleanup = await supabase().storage.from(bucket).remove([path]);
  if (cleanup.error) throw new DataError(`A operação falhou e a limpeza do arquivo também. Verifique o objeto ${path} no Storage.`, "partial", { original, cleanup: cleanup.error });
}

export async function registerUploadedBook(book: Omit<Book, "id" | "created_at" | "total_pages">, removeUploadedObject = true) {
  const result = await supabase().from("books").insert(book);
  if (!result.error) return;
  const original = toDataError(result.error, "Não foi possível registrar o arquivo no catálogo.");
  const confirmed = await supabase().from("books").select("id").eq("file_path", book.file_path).maybeSingle();
  if (confirmed.error) throw new DataError(`Não foi possível confirmar se o registro foi salvo; o arquivo ${book.file_path} foi preservado para evitar um registro sem mídia.`, "partial", { insert: result.error, check: confirmed.error });
  if (confirmed.data) return;
  if (removeUploadedObject) await cleanupObject(BUCKET, book.file_path, result.error);
  throw original;
}

export async function uploadAndRegisterBook(
  book: Omit<Book, "id" | "created_at" | "total_pages">,
  file: File,
  contentType: string,
  options: UploadOptions = {},
) {
  await uploadStorageObject(BUCKET, book.file_path, file, contentType, options);
  await registerUploadedBook(book);
}

export async function replaceStorageReference(
  bucket: StorageBucket,
  path: string,
  file: File,
  contentType: string,
  updateReference: (path: string) => Promise<void>,
  verifyReference: (path: string) => Promise<boolean>,
  oldPath?: string | null,
  isOldPathReferenced?: (path: string) => Promise<boolean>,
) {
  await uploadStorageObject(bucket, path, file, contentType);
  try {
    await updateReference(path);
  } catch (cause) {
    try {
      if (await verifyReference(path)) return { cleanupWarning: "A referência foi salva, mas a resposta da atualização foi perdida. Recarregue para confirmar." };
    } catch (verifyError) {
      throw new DataError(`Não foi possível confirmar se o catálogo aponta para ${path}; o arquivo foi preservado para evitar uma referência quebrada.`, "partial", { update: cause, verify: verifyError });
    }
    await cleanupObject(bucket, path, cause);
    throw toDataError(cause, "Não foi possível salvar a referência do arquivo.");
  }
  if (oldPath && oldPath !== path) {
    try {
      if (await isOldPathReferenced?.(oldPath)) return { cleanupWarning: "" };
      const cleanup = await supabase().storage.from(bucket).remove([oldPath]);
      if (cleanup.error) throw cleanup.error;
    } catch {
      return { cleanupWarning: "A nova imagem foi salva. A imagem anterior requer limpeza administrativa." };
    }
  }
  return { cleanupWarning: "" };
}

export async function deleteBookAndFile(ownerId: string, book: Pick<Book, "id" | "file_path" | "title">) {
  const api = supabase();
  const deleted = await api.from("books").delete().eq("id", book.id).eq("owner_id", ownerId).select("id").maybeSingle();
  if (deleted.error) {
    const current = await api.from("books").select("id").eq("id", book.id).eq("owner_id", ownerId).maybeSingle();
    if (current.error) throw new DataError(`Não foi possível confirmar se ${book.title} foi removido; o arquivo foi preservado.`, "partial", { delete: deleted.error, check: current.error });
    if (current.data) throw toDataError(deleted.error, `Não foi possível remover ${book.title} do catálogo.`);
  } else if (!deleted.data) {
    throw new DataError(`Não foi possível confirmar a exclusão de ${book.title}.`, "authorization");
  }
  const removed = await api.storage.from(BUCKET).remove([book.file_path]);
  if (removed.error) throw new DataError(`O registro de ${book.title} foi removido, mas o objeto ${book.file_path} continua no Storage e requer limpeza.`, "partial", removed.error);
}

export async function deleteSeriesAndMedia(ownerId: string, series: Pick<Series, "id" | "title" | "cover_path">) {
  const api = supabase();
  const booksResult = await api.from("books").select("file_path").eq("series_id", series.id).eq("owner_id", ownerId);
  const books = throwOnError(booksResult, "Não foi possível listar a mídia da obra para exclusão.");
  const deleted = await api.from("series").delete().eq("id", series.id).eq("owner_id", ownerId).select("id").maybeSingle();
  if (deleted.error) {
    const current = await api.from("series").select("id").eq("id", series.id).eq("owner_id", ownerId).maybeSingle();
    if (current.error) throw new DataError(`Não foi possível confirmar se ${series.title} foi removida; os arquivos foram preservados.`, "partial", { delete: deleted.error, check: current.error });
    if (current.data) throw toDataError(deleted.error, `Não foi possível remover ${series.title} do catálogo.`);
  } else if (!deleted.data) {
    throw new DataError(`Não foi possível confirmar a exclusão de ${series.title}.`, "authorization");
  }
  const novelPaths = (books || []).map(book => book.file_path);
  const cleanup = await Promise.all([
    novelPaths.length ? api.storage.from(BUCKET).remove(novelPaths) : Promise.resolve({ error: null }),
    series.cover_path ? api.storage.from("covers").remove([series.cover_path]) : Promise.resolve({ error: null }),
  ]);
  const failures = cleanup.flatMap((result, index) => result.error ? [index === 0 ? `${novelPaths.length} arquivo(s) de mídia` : `capa ${series.cover_path}`] : []);
  if (failures.length) throw new DataError(`A obra foi removida do catálogo; a limpeza de ${failures.join(" e ")} no Storage precisa de revisão.`, "partial", cleanup.map(result => result.error));
}
