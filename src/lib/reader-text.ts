type PdfTextItem = {
  str: string;
  hasEOL: boolean;
  transform: number[];
  height?: number;
  width?: number;
};

export type ReadingBlock = { text: string; kind: "paragraph" | "heading" };

type Line = { text: string; x: number; y: number; height: number };

function isTextItem(item: unknown): item is PdfTextItem {
  return typeof item === "object" && item !== null && "str" in item && typeof item.str === "string";
}

function cleanLine(value: string) {
  return value.replace(/(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function isStructuralNoise(value: string) {
  const line = value.trim();
  return /^(?:https?:\/\/|www\.)\S+$/i.test(line)
    || /^(?:source|fonte|url|link|arquivo|file|download|baixado de|extraído de)\s*[:：-]?\s*$/i.test(line)
    || /^(?:(?:source|fonte|url|link|arquivo|file|download|baixado de|extraído de)\s*[:：-]\s*)?(?:https?:\/\/|www\.)\S+$/i.test(line)
    || /^(?:p(?:á|a)gina|page)\s*\d+(?:\s*(?:de|of|\/)\s*\d+)?$/i.test(line)
    || /^\d+\s*(?:\/|de|of)\s*\d+$/i.test(line)
    || /^\d{1,4}$/.test(line)
    || /^(?:isbn|doi|copyright|all rights reserved|todos os direitos reservados)\b/i.test(line);
}

function isHeading(value: string) {
  return value.length < 100 && (/^(?:cap[ií]tulo|chapter|pr[oó]logo|ep[ií]logo|parte|part)\b/i.test(value)
    || (value.length < 58 && value === value.toLocaleUpperCase() && /\p{L}/u.test(value)));
}

function joinLines(left: string, right: string) {
  if (/[-‐‑]$/.test(left) && /^\p{Ll}/u.test(right)) return left.slice(0, -1) + right;
  if (/\s$/.test(left) || /^[,.;:!?)}\]]/.test(right)) return left + right;
  return `${left} ${right}`;
}

export function extractReadingBlocks(items: unknown[]): ReadingBlock[] {
  const lines: Line[] = [];
  let parts: string[] = [];
  let x = 0;
  let y = 0;
  let height = 0;
  let right = 0;

  const flush = () => {
    const text = cleanLine(parts.join(""));
    if (text && !isStructuralNoise(text)) lines.push({ text, x, y, height });
    parts = [];
  };

  for (const raw of items) {
    if (!isTextItem(raw)) continue;
    const value = raw.str;
    if (value.trim()) {
      const itemX = raw.transform?.[4] ?? 0;
      const itemY = raw.transform?.[5] ?? 0;
      const itemHeight = raw.height || Math.abs(raw.transform?.[0] ?? 0) || 12;
      if (parts.length && Math.abs(itemY - y) > Math.max(3, itemHeight * 0.55)) flush();
      if (!parts.length) {
        x = itemX;
        y = itemY;
        height = itemHeight;
      }
      const previous = parts.at(-1) || "";
      const gap = itemX - right;
      const separator = previous && gap > itemHeight * 0.18 && !/\s$/.test(previous) && !/^\s/.test(value) && !/^[,.;:!?)}\]]/.test(value) ? " " : "";
      parts.push(separator + value);
      right = itemX + (raw.width || 0);
    }
    if (raw.hasEOL) flush();
  }
  flush();

  const blocks: ReadingBlock[] = [];
  let paragraph = "";
  let previous: Line | null = null;
  const gaps = lines.slice(1).map((line, index) => Math.abs(line.y - lines[index].y)).filter(gap => gap > 1 && gap < 80).sort((a, b) => a - b);
  const typicalGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const flushParagraph = () => {
    if (paragraph) blocks.push({ text: paragraph, kind: "paragraph" });
    paragraph = "";
  };

  for (const line of lines) {
    if (isHeading(line.text)) {
      flushParagraph();
      blocks.push({ text: line.text, kind: "heading" });
      previous = null;
      continue;
    }
    const gap = previous ? Math.abs(line.y - previous.y) : 0;
    const newParagraph = previous && (
      (typicalGap > 0 && gap > Math.max(typicalGap * 1.45, previous.height * 1.55))
      || line.x - previous.x > Math.max(12, previous.height * 0.9)
      || /^[—–]/.test(line.text)
      || (/[.!?…]["”']?$/u.test(previous.text) && previous.text.length < 55 && /^[\p{Lu}“"‘]/u.test(line.text))
    );
    if (newParagraph) flushParagraph();
    paragraph = paragraph ? joinLines(paragraph, line.text) : line.text;
    previous = line;
  }
  flushParagraph();
  return blocks;
}
