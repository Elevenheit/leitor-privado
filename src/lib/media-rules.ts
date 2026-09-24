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
        /\.(png|jpe?g)$/i.test(n) &&
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
  }
  if (
    !width ||
    !height ||
    width > 16000 ||
    height > 16000 ||
    width * height > 16000000
  )
    throw Error(
      "Página inválida ou acima de 16 megapixels. Use JPEG ou PNG menor.",
    );
  return { width, height };
}
