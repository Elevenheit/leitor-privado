import { unzipSync } from "fflate";
import { naturalPages, CBZ_LIMITS, validateComicImage, MAX_RENDER_PIXELS } from "./media-rules";
let archive: Uint8Array | null = null;
let names: string[] = [];
let operation = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  operation = operation.then(() => processMessage(event));
};
async function processMessage(event: MessageEvent) {
  try {
    if (event.data.archive) {
      archive = new Uint8Array(event.data.archive);
      if (archive.byteLength > CBZ_LIMITS.archive)
        throw Error("CBZ maior que 40 MB.");
      let total = 0;
      const files: string[] = [];
      let entries = 0;
      unzipSync(archive, {
        filter: (f) => {
          if (++entries > 1000) throw Error("Arquivo com entradas demais.");
          if (/\.(png|jpe?g|webp)$/i.test(f.name)) {
            if (
              f.originalSize > CBZ_LIMITS.page ||
              f.originalSize / Math.max(1, f.size) > 200
            )
              throw Error("Página excede os limites de segurança.");
            total += f.originalSize;
            files.push(f.name);
          }
          return false;
        },
      });
      names = naturalPages(files);
      if (
        !names.length ||
        names.length > CBZ_LIMITS.pages ||
        total > CBZ_LIMITS.total
      )
        throw Error("CBZ vazio ou acima do limite de 400 páginas / 160 MB.");
      self.postMessage({ names });
    } else if (archive) {
      const index = event.data.index;
      const name = names[index];
      if (!name) throw Error("Página inexistente");
      const file = unzipSync(archive, { filter: (f) => f.name === name })[name];
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
    self.postMessage({
      index: event.data.index,
      error: e instanceof Error ? e.message : "CBZ inválido ou corrompido.",
    });
  }
}
