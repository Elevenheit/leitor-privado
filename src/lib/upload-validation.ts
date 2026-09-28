import { unzipSync } from "fflate";
import { CBZ_LIMITS, validateComicImage } from "./media-rules";

const MiB = 1024 * 1024;
const PDF_LIMIT = 500 * MiB;
const VIDEO_LIMIT = 500 * MiB;
const IMAGE_LIMIT = 2 * MiB;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionOf(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

async function readBytes(file: Blob, start: number, end: number) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

function zipEntries(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const min = Math.max(0, data.length - 22 - 0xffff);
  let eocd = -1;
  for (let offset = data.length - 22; offset >= min; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === data.length) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo CBZ ZIP inválido ou incompleto.");
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk || centralDisk || diskEntries !== entries || entries === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new Error("CBZ dividido em partes ou ZIP64 não é suportado.");
  }
  if (entries > 1000 || centralOffset + centralSize > eocd) throw new Error("CBZ com diretório ZIP inválido ou entradas demais.");
  const result: { name: string; compressed: number; uncompressed: number; flags: number; method: number; crc: number }[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > centralOffset + centralSize || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Diretório ZIP do CBZ corrompido.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const recordEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (!nameLength || recordEnd > centralOffset + centralSize) throw new Error("Entrada de CBZ inválida.");
    const name = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(offset + 46, offset + 46 + nameLength));
    const local = view.getUint32(offset + 42, true);
    if (local + 30 > centralOffset || view.getUint32(local, true) !== 0x04034b50) throw new Error("Cabecalho ZIP invalido.");
    const localNameLength = view.getUint16(local + 26, true);
    const localExtraLength = view.getUint16(local + 28, true);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    if (dataStart + compressed > centralOffset || view.getUint16(local + 8, true) !== method || new TextDecoder().decode(data.subarray(local + 30, local + 30 + localNameLength)) !== name) throw new Error("Entrada ZIP inconsistente.");
    result.push({ name, compressed, uncompressed, flags, method, crc: view.getUint32(offset + 16, true) });
    offset = recordEnd;
  }
  if (offset !== centralOffset + centralSize) throw new Error("Diretório ZIP do CBZ inconsistente.");
  return result;
}

export async function validateCbz(file: File) {
  if (file.size > CBZ_LIMITS.archive) throw new Error("CBZ maior que 40 MB.");
  const archive = await readBytes(file, 0, file.size);
  const entries = zipEntries(archive);
  const seen = new Set<string>();
  let pageCount = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.flags & 1 || ![0, 8].includes(entry.method)) throw new Error("CBZ criptografado ou com compactação não suportada.");
    const normalized = entry.name.replaceAll("\\", "/");
    if (/[\x00-\x1f\x7f:]/.test(normalized) || normalized.includes("//") || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.split("/").some((part) => part === "..")) {
      throw new Error("O CBZ contém um caminho de arquivo inseguro.");
    }
    if (normalized.endsWith("/")) continue;
    if (!/\.(png|jpe?g|webp)$/i.test(normalized) || normalized.startsWith("__MACOSX/") || normalized.split("/").some((part) => part.startsWith("."))) {
      throw new Error("CBZ deve conter somente páginas PNG, JPEG ou WebP.");
    }
    if (seen.has(normalized)) throw new Error("Nomes duplicados no CBZ.");
    seen.add(normalized);
    pageCount++;
    totalBytes += entry.uncompressed;
    if (entry.uncompressed > CBZ_LIMITS.page || entry.uncompressed / Math.max(entry.compressed, 1) > 200) {
      throw new Error("Uma página do CBZ excede os limites de descompactação.");
    }
  }
  if (!pageCount || pageCount > CBZ_LIMITS.pages || totalBytes > CBZ_LIMITS.total) {
    throw new Error("CBZ vazio ou acima do limite de 400 páginas / 160 MB.");
  }
  for (const entry of entries.filter((item) => !item.name.endsWith("/"))) {
    const bytes = unzipSync(archive, { filter: (item) => item.name === entry.name })[entry.name];
    if (!bytes || bytes.length !== entry.uncompressed || crc32(bytes) !== entry.crc) throw new Error("Pagina CBZ corrompida.");
    const png = bytes[0] === 137 && bytes[1] === 80;
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
    if ((/\.png$/i.test(entry.name) && !png) || (/\.jpe?g$/i.test(entry.name) && !jpeg) || (/\.webp$/i.test(entry.name) && !webp)) throw new Error("Pagina CBZ deve ser PNG, JPEG ou WebP real.");
    validateComicImage(bytes);
  }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

export async function validateImageUpload(file: File, maxBytes = IMAGE_LIMIT) {
  if (!IMAGE_TYPES.has(file.type) || file.size > maxBytes) throw new Error("Use JPEG, PNG ou WebP dentro do limite de tamanho.");
  const bytes = await readBytes(file, 0, Math.min(file.size, 32));
  const png = bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if ((file.type === "image/png" && !png) || (file.type === "image/jpeg" && !jpeg) || (file.type === "image/webp" && !webp)) {
    throw new Error("O conteúdo do arquivo não corresponde a uma imagem JPEG, PNG ou WebP.");
  }
  const { width, height } = validateComicImage(await readBytes(file, 0, file.size));
  if (width > 4096 || height > 4096 || width * height > 8_000_000) throw new Error("Use imagem de ate 4096 pixels por lado e 8 megapixels.");
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
  }
}

export async function validateStorageUpload(file: File, bucket: "novels" | "covers" | "profiles") {
  if (bucket !== "novels") return validateImageUpload(file, bucket === "profiles" ? IMAGE_LIMIT : 10 * MiB);
  if (!file.size) throw new Error("Arquivo vazio.");
  const extension = extensionOf(file);
  if (["mp4", "webm"].includes(extension) && file.type !== `video/${extension}`) throw new Error("MIME de video nao permitido.");
  const header = await readBytes(file, 0, Math.min(file.size, 16));
  if (extension === "pdf") {
    if (file.size > PDF_LIMIT || new TextDecoder().decode(header.slice(0, 5)) !== "%PDF-") throw new Error("PDF inválido ou maior que 500 MB.");
    return;
  }
  if (extension === "cbz") return validateCbz(file);
  if (extension === "mp4") {
    if (file.size > VIDEO_LIMIT || new TextDecoder().decode(header.slice(4, 8)) !== "ftyp") throw new Error("MP4 inválido ou maior que 500 MB.");
    return;
  }
  if (extension === "webm") {
    if (file.size > VIDEO_LIMIT || header[0] !== 0x1a || header[1] !== 0x45 || header[2] !== 0xdf || header[3] !== 0xa3) throw new Error("WebM inválido ou maior que 500 MB.");
    return;
  }
  throw new Error("Formato de mídia não suportado.");
}
