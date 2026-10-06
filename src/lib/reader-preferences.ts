export const READER_FONT_MIN = 16;
export const READER_FONT_MAX = 32;

export type ReaderPreferences = {
  theme: "dark" | "sepia" | "light";
  fontSize: number;
  fontFamily: "serif" | "sans";
  lineHeight: number;
  textWidth: number;
  showIllustrations: boolean;
  comicMode: "vertical" | "page";
};
export const defaultReaderPreferences: ReaderPreferences = {
  theme: "dark",
  fontSize: 22,
  fontFamily: "serif",
  lineHeight: 1.85,
  textWidth: 760,
  showIllustrations: true,
  comicMode: "vertical",
};

export function normalizeReaderPreferences(value: unknown): ReaderPreferences {
  const p =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const defaults = defaultReaderPreferences;
  return {
    theme: p.theme === "sepia" || p.theme === "light" ? p.theme : "dark",
    fontSize:
      typeof p.fontSize === "number" && Number.isFinite(p.fontSize)
        ? Math.min(
            READER_FONT_MAX,
            Math.max(READER_FONT_MIN, Math.round(p.fontSize)),
          )
        : defaults.fontSize,
    fontFamily: p.fontFamily === "sans" ? "sans" : "serif",
    lineHeight: [1.65, 1.85, 2.05].includes(Number(p.lineHeight))
      ? Number(p.lineHeight)
      : defaults.lineHeight,
    textWidth: [700, 760, 820].includes(Number(p.textWidth))
      ? Number(p.textWidth)
      : defaults.textWidth,
    showIllustrations:
      typeof p.showIllustrations === "boolean" ? p.showIllustrations : true,
    comicMode: p.comicMode === "page" ? "page" : "vertical",
  };
}
