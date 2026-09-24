import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export type ReaderIllustration = { src: string; page: number; width: number; height: number; position: number; wide: boolean };

type Matrix = [number, number, number, number, number, number];
type Bounds = { left: number; right: number; bottom: number; top: number };
type ImageSource = { width: number; height: number; kind?: number; data?: Uint8Array | Uint8ClampedArray; bitmap?: ImageBitmap };
type Candidate = { source: string | ImageSource; bounds: Bounds };
type Operators = {
  save: number; restore: number; transform: number; paintImageXObject: number; paintInlineImageXObject: number;
  paintImageXObjectRepeat: number; paintInlineImageXObjectGroup: number;
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const MAX_IMAGES_PER_PAGE = 3;
const MAX_SOURCE_PIXELS = 12_000_000;

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1], left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3], left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4], left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function imageBounds(matrix: Matrix): Bounds {
  const points = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]);
  return {
    left: Math.min(...points.map(point => point[0])), right: Math.max(...points.map(point => point[0])),
    bottom: Math.min(...points.map(point => point[1])), top: Math.max(...points.map(point => point[1])),
  };
}

function illustrationPlacement(bounds: Bounds, view: number[]) {
  const pageWidth = view[2] - view[0];
  const pageHeight = view[3] - view[1];
  const width = Math.max(0, Math.min(bounds.right, view[2]) - Math.max(bounds.left, view[0]));
  const height = Math.max(0, Math.min(bounds.top, view[3]) - Math.max(bounds.bottom, view[1]));
  const coverage = width * height / (pageWidth * pageHeight);
  const centerY = (Math.max(bounds.bottom, view[1]) + Math.min(bounds.top, view[3])) / 2;
  return {
    position: Math.min(1, Math.max(0, (view[3] - centerY) / pageHeight)),
    wide: coverage >= 0.22 || width / pageWidth >= 0.72,
  };
}

function isIllustrationPlacement(bounds: Bounds, view: number[], hasReadableText: boolean) {
  const pageWidth = view[2] - view[0];
  const pageHeight = view[3] - view[1];
  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;
  const visibleWidth = Math.max(0, Math.min(bounds.right, view[2]) - Math.max(bounds.left, view[0]));
  const visibleHeight = Math.max(0, Math.min(bounds.top, view[3]) - Math.max(bounds.bottom, view[1]));
  const coverage = visibleWidth * visibleHeight / (pageWidth * pageHeight);
  const aspect = visibleWidth / visibleHeight;
  const minCoverage = 0.10;
  const maxCoverage = hasReadableText ? 0.75 : 1.01;
  const minWidth = hasReadableText ? 0.38 : 0.28;
  const minHeight = hasReadableText ? 0.19 : 0.28;
  const minAspect = hasReadableText ? 0.42 : 0.28;
  const maxAspect = hasReadableText ? 2.8 : 3.5;
  return Number.isFinite(coverage) && pageWidth > 0 && pageHeight > 0
    && visibleWidth / pageWidth >= minWidth && visibleHeight / pageHeight >= minHeight
    && coverage >= minCoverage && coverage <= maxCoverage
    && visibleWidth / width >= 0.85 && visibleHeight / height >= 0.85
    && aspect >= minAspect && aspect <= maxAspect;
}

function hasTextOverImage(bounds: Bounds, textItems: unknown[]) {
  let count = 0;
  let letters = 0;
  for (const item of textItems) {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) continue;
    const text = item as { str: unknown; transform: unknown; width?: number };
    if (typeof text.str !== "string" || !Array.isArray(text.transform) || text.transform.length < 6) continue;
    const x = text.transform[4] + (text.width || 0) / 2;
    const y = text.transform[5];
    if (x > bounds.left && x < bounds.right && y > bounds.bottom && y < bounds.top) {
      count++;
      letters += text.str.trim().length;
      if (count >= 2 || letters >= 20) return true;
    }
  }
  return false;
}

export function findIllustrationCandidates(page: PDFPageProxy, operatorList: Awaited<ReturnType<PDFPageProxy["getOperatorList"]>>, ops: Operators, hasReadableText = true): Candidate[] {
  const found: Candidate[] = [];
  const stack: Matrix[] = [];
  let matrix: Matrix = [...IDENTITY];
  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const operator = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];
    if (operator === ops.save) stack.push([...matrix]);
    else if (operator === ops.restore) matrix = stack.pop() || [...IDENTITY];
    else if (operator === ops.transform && Array.isArray(args) && args.length === 6 && args.every(value => typeof value === "number")) matrix = multiply(matrix, args as Matrix);
    else if (operator === ops.paintImageXObject || operator === ops.paintInlineImageXObject) {
      const source = args?.[0];
      const bounds = imageBounds(matrix);
      if ((typeof source === "string" || (source && typeof source === "object")) && isIllustrationPlacement(bounds, page.view, hasReadableText)) {
        found.push({ source, bounds });
      }
    } else if (operator === ops.paintImageXObjectRepeat && typeof args?.[0] === "string"
      && typeof args[1] === "number" && typeof args[2] === "number" && Array.isArray(args[3])) {
      // PDF.js repeats one embedded image at explicit placements (often decorative marks).
      const positions = args[3] as unknown[];
      const scaleX = args[1], scaleY = args[2];
      for (let index = 0; index + 1 < positions.length; index += 2) {
        const x = positions[index], y = positions[index + 1];
        if (typeof x !== "number" || typeof y !== "number") continue;
        const bounds = imageBounds(multiply(matrix, [scaleX, 0, 0, scaleY, x, y]));
        if (isIllustrationPlacement(bounds, page.view, hasReadableText)) found.push({ source: args[0], bounds });
      }
    } else if (operator === ops.paintInlineImageXObjectGroup && args?.[0] && typeof args[0] === "object" && Array.isArray(args[1])) {
      // A single-entry group is a real embedded image with its own transform. Multi-entry groups
      // are typically tiles/components; skipping them avoids assembling or mislabeling fragments.
      const map = args[1] as Array<{ transform?: unknown }>;
      if (map.length === 1 && Array.isArray(map[0]?.transform) && map[0].transform.length === 6
        && map[0].transform.every(value => typeof value === "number")) {
        const bounds = imageBounds(multiply(matrix, map[0].transform as Matrix));
        if (isIllustrationPlacement(bounds, page.view, hasReadableText)) found.push({ source: args[0], bounds });
      }
    }
    // PDF.js mask operators are stencil masks colored by the current fill/pattern state, not
    // standalone image objects. Reconstructing them here would lose their actual appearance.
  }
  return found.slice(0, 12);
}

function isImageSource(value: unknown): value is ImageSource {
  if (!value || typeof value !== "object") return false;
  const image = value as ImageSource;
  const pixels = image.width * image.height;
  return Number.isInteger(image.width) && Number.isInteger(image.height)
    && image.width >= 320 && image.height >= 260 && pixels >= 120_000 && pixels <= MAX_SOURCE_PIXELS
    && image.width / image.height >= 0.28 && image.width / image.height <= 3.5;
}

async function resolveSource(page: PDFPageProxy, source: Candidate["source"]): Promise<unknown> {
  if (typeof source !== "string") return source;
  const pool = source.startsWith("g_") ? page.commonObjs : page.objs;
  if (pool.has(source)) return pool.get(source);
  // Some image objects arrive after the operator list. A missing dependency is skipped.
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 2000);
    try { pool.get(source, (value: unknown) => { clearTimeout(timer); resolve(value); }); }
    catch { clearTimeout(timer); resolve(null); }
  });
}

function imageCanvas(source: ImageSource, rgbKind: number, rgbaKind: number): HTMLCanvasElement | null {
  const output = document.createElement("canvas");
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  output.width = Math.max(1, Math.round(source.width * scale));
  output.height = Math.max(1, Math.round(source.height * scale));
  const context = output.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  if (source.bitmap) {
    context.drawImage(source.bitmap, 0, 0, output.width, output.height);
    return output;
  }
  const raw = source.data;
  if (!raw || (source.kind !== rgbKind && source.kind !== rgbaKind)) return null;
  const channels = source.kind === rgbKind ? 3 : 4;
  if (raw.length !== source.width * source.height * channels) return null;
  const pixels = new Uint8ClampedArray(source.width * source.height * 4);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < raw.length; sourceIndex += channels, targetIndex += 4) {
    pixels[targetIndex] = raw[sourceIndex]; pixels[targetIndex + 1] = raw[sourceIndex + 1]; pixels[targetIndex + 2] = raw[sourceIndex + 2];
    pixels[targetIndex + 3] = channels === 4 ? raw[sourceIndex + 3] : 255;
  }
  const original = document.createElement("canvas");
  original.width = source.width; original.height = source.height;
  const originalContext = original.getContext("2d");
  if (!originalContext) return null;
  originalContext.putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
  context.drawImage(original, 0, 0, output.width, output.height);
  original.width = 0; original.height = 0;
  return output;
}

function fingerprint(canvas: HTMLCanvasElement): string | null {
  const sample = document.createElement("canvas");
  sample.width = 24; sample.height = 24;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(canvas, 0, 0, 24, 24);
  const pixels = context.getImageData(0, 0, 24, 24).data;
  let white = 0, dark = 0, transparent = 0, hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2], alpha = pixels[index + 3];
    if (alpha < 230) transparent++;
    if (red > 240 && green > 240 && blue > 240) white++;
    if (red < 100 && green < 100 && blue < 100) dark++;
    for (const channel of [red, green, blue]) { hash ^= channel; hash = Math.imul(hash, 16777619); }
  }
  const cells = 24 * 24;
  if (transparent / cells > 0.05 || (white / cells > 0.72 && dark / cells < 0.12)) return null;
  return (hash >>> 0).toString(16);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.88));
}

export function createReaderIllustrationExtractor(pdf: PDFDocumentProxy) {
  const cache = new Map<number, Promise<ReaderIllustration[]>>();
  const fingerprints = new Set<string>();
  const urls = new Set<string>();
  let disposed = false;

  async function extract(pageNumber: number, hasReadableText: boolean): Promise<ReaderIllustration[]> {
    try {
      const [{ OPS, ImageKind }, page] = await Promise.all([import("pdfjs-dist"), pdf.getPage(pageNumber)]);
      const operatorList = await page.getOperatorList();
      const candidates = findIllustrationCandidates(page, operatorList, OPS, hasReadableText);
      if (!candidates.length || disposed) return [];
      const text = await page.getTextContent();
      const illustrations: ReaderIllustration[] = [];
      for (const candidate of candidates) {
        if (illustrations.length >= MAX_IMAGES_PER_PAGE || disposed) break;
        // A page classified as text-free may still contain stray metadata text in the PDF layer.
        // Meaningful extracted text keeps the overlap guard for scanned backgrounds and logos.
        if (hasReadableText && hasTextOverImage(candidate.bounds, text.items)) continue;
        const source = await resolveSource(page, candidate.source);
        if (!isImageSource(source)) continue;
        const canvas = imageCanvas(source, ImageKind.RGB_24BPP, ImageKind.RGBA_32BPP);
        if (!canvas) continue;
        const signature = fingerprint(canvas);
        if (!signature || fingerprints.has(signature)) { canvas.width = 0; canvas.height = 0; continue; }
        fingerprints.add(signature);
        const blob = await toBlob(canvas);
        canvas.width = 0; canvas.height = 0;
        if (!blob || disposed) { fingerprints.delete(signature); continue; }
        const src = URL.createObjectURL(blob);
        urls.add(src);
        illustrations.push({ src, page: pageNumber, width: source.width, height: source.height, ...illustrationPlacement(candidate.bounds, page.view) });
      }
      return illustrations;
    } catch { return []; }
  }

  return {
    get(pageNumber: number, hasReadableText = true) {
      if (disposed || pageNumber < 1 || pageNumber > pdf.numPages) return Promise.resolve([]);
      const existing = cache.get(pageNumber);
      if (existing) return existing;
      const pending = extract(pageNumber, hasReadableText);
      cache.set(pageNumber, pending);
      return pending;
    },
    dispose() {
      disposed = true;
      for (const src of urls) URL.revokeObjectURL(src);
      urls.clear(); cache.clear(); fingerprints.clear();
    },
  };
}
