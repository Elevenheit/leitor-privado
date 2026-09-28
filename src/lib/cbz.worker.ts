import { validateCbz } from "./upload-validation";
import JSZip from "jszip";
import { naturalPages, CBZ_LIMITS, validateComicImage, MAX_RENDER_PIXELS } from "./media-rules";
let archive: JSZip | null = null;
let names: string[] = [];
let operation = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  operation = operation.then(() => processMessage(event));
};
async function processMessage(event: MessageEvent) {
  try {
    if (event.data.archive) {
      names = [];
      const archiveBytes = event.data.archive as ArrayBuffer;
      await validateCbz(new File([archiveBytes], "chapter.cbz"));
      if (archiveBytes.byteLength > CBZ_LIMITS.archive)
        throw Error("CBZ maior que 40 MB.");
      archive = await JSZip.loadAsync(archiveBytes);
      const entries = Object.values(archive.files);
      names = naturalPages(
        entries.filter((entry) => !entry.dir).map((entry) => entry.name),
      );
      self.postMessage({ names, fileCount: entries.filter((entry) => !entry.dir).length });
    } else if (archive) {
      const index = event.data.index;
      const name = names[index];
      if (!name) throw Error("Página inexistente");
      const entry = archive.file(name);
      if (!entry) throw Error("Página inexistente");
      const file = new Uint8Array(await entry.async("uint8array"));
      const { width, height } = validateComicImage(file);
      const sourceMime = /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg";
      if (width * height <= MAX_RENDER_PIXELS) {
        self.postMessage({ index, name, data: file, mime: sourceMime }, { transfer: [file.buffer] });
      } else {
        if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined")
          throw Error("Este navegador nÃ£o permite normalizar pÃ¡ginas grandes.");
        const bitmap = await createImageBitmap(new Blob([file], { type: sourceMime }));
        const scale = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
        const canvas = new OffscreenCanvas(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)));
        const context = canvas.getContext("2d");
        if (!context) { bitmap.close(); throw Error("NÃ£o foi possÃ­vel normalizar a pÃ¡gina."); }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const mime = sourceMime === "image/jpeg" ? "image/jpeg" : "image/png";
        const blob = await canvas.convertToBlob({ type: mime, quality: 0.92 });
        const normalized = new Uint8Array(await blob.arrayBuffer());
        self.postMessage({ index, name, data: normalized, mime }, { transfer: [normalized.buffer] });
      }
    }
  } catch (e) {
    if (event.data.archive) { archive = null; names = []; }
    console.error("[CBZ] erro", e);
    self.postMessage({
      index: event.data.index,
      error: e instanceof Error ? e.message : "CBZ inválido ou corrompido.",
    });
  }
}
