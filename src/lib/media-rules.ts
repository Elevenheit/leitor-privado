export function introTarget(
  enabled: boolean,
  end: number,
  duration: number,
  time: number,
): number | null {
  if (
    !enabled ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(end) ||
    end < 90 ||
    end > 110 ||
    time >= Math.min(end, duration)
  )
    return null;
  return Math.min(end, duration);
}
export function naturalPages(names: string[]) {
  return names
    .filter(
      (n) =>
        /\.(png|jpe?g|webp)$/i.test(n) &&
        !n.startsWith("__MACOSX/") &&
        !n.split("/").some((p) => p.startsWith(".")),
    )
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}
export const CBZ_LIMITS = {
  archive: 40 * 1024 * 1024,
  page: 12 * 1024 * 1024,
  total: 160 * 1024 * 1024,
  pages: 400,
};
export const MAX_RENDER_PIXELS = 16_000_000;
export const HARD_SOURCE_PIXELS = 50_000_000;

// Read dimensions before asking the browser to decode potentially huge images.
export function validateComicImage(data: Uint8Array) {
  let width = 0,
    height = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    data.length >= 24 &&
    data[0] === 137 &&
    data[1] === 80 &&
    data[2] === 78 &&
    data[3] === 71
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (data[0] === 255 && data[1] === 216) {
    let offset = 2;
    while (offset + 4 <= data.length) {
      if (data[offset] !== 255) break;
      while (data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > data.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > data.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        size >= 7
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += size;
    }
  } else if (data.length >= 30 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) {
    const chunk = String.fromCharCode(data[12], data[13], data[14], data[15]);
    if (chunk === "VP8X") {
      width = 1 + data[24] + (data[25] << 8) + (data[26] << 16);
      height = 1 + data[27] + (data[28] << 8) + (data[29] << 16);
    } else if (chunk === "VP8 " && data[23] === 157 && data[24] === 1 && data[25] === 42) {
      width = (data[26] | (data[27] << 8)) & 0x3fff;
      height = (data[28] | (data[29] << 8)) & 0x3fff;
    } else if (chunk === "VP8L" && data[20] === 47) {
      width = 1 + data[21] + ((data[22] & 0x3f) << 8);
      height = 1 + ((data[22] & 0xc0) >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10);
    }
  }
  if (
    !width ||
    !height ||
    width > 30000 ||
    height > 30000 ||
    width * height > HARD_SOURCE_PIXELS
  )
    throw Error("Página inválida ou com dimensões acima do limite seguro de 50 megapixels.");
  return { width, height };
}
