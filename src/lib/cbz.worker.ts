import { unzipSync } from "fflate";
import { naturalPages, CBZ_LIMITS, validateComicImage } from "./media-rules";
let archive: Uint8Array | null = null;
let names: string[] = [];
self.onmessage = (event: MessageEvent) => {
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
          if (/\.(png|jpe?g)$/i.test(f.name)) {
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
      validateComicImage(file);
      self.postMessage(
        { index, name, data: file },
        { transfer: [file.buffer] },
      );
    }
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "CBZ inválido ou corrompido.",
    });
  }
};
