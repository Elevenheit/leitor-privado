export type ParsedBatchName = {
  volumeNumber: number | null;
  chapterNumber: number | null;
  title: string;
  special: "prologue" | "epilogue" | null;
};

const volumePattern = /(?:^|[\s._-])(?:volume|vol\.?|v)[\s_-]*(\d+(?:[.,]\d+)?)/i;
const chapterPattern = /(?:^|[\s._-])(?:cap(?:\u00ed|i)tulo|cap\.?|chapter|chap\.?|c)[\s_-]*(\d+(?:[.,]\d+)?)/i;
const specialPattern = /(?:^|[\s._-])(pr(?:\u00f3|o)logo|prologue|ep(?:\u00ed|i)logo|epilogue)(?=$|[\s._-])/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseBatchFilename(filename: string, seriesNames: string[] = []): ParsedBatchName {
  const stem = filename.replace(/\.[^.]+$/, "").trim();
  const candidates = [...seriesNames].sort((a, b) => b.length - a.length);
  let remainder = stem;
  for (const name of candidates) {
    const separatorFlexible = escapeRegExp(name.trim()).replace(/[ _-]+/g, "[ _-]+");
    const match = new RegExp(`^${separatorFlexible}(?:$|[ _.-])`, "i").exec(stem);
    if (match) {
      remainder = stem.slice(match[0].length).replace(/^[ _.-]+/, "");
      break;
    }
  }

  const volumeMatch = volumePattern.exec(remainder);
  const chapterMatch = chapterPattern.exec(remainder);
  const specialMatch = specialPattern.exec(remainder);
  const volumeNumber = volumeMatch ? Number(volumeMatch[1].replace(",", ".")) : null;
  const chapterNumber = chapterMatch ? Number(chapterMatch[1].replace(",", ".")) : null;
  const special = specialMatch
    ? /^(?:pr|pro)/i.test(specialMatch[1])
      ? "prologue"
      : "epilogue"
    : null;
  const title = remainder
    .replace(volumeMatch?.[0] || /$^/, " ")
    .replace(chapterMatch?.[0] || /$^/, " ")
    .replace(specialMatch?.[0] || /$^/, " ")
    .replace(/[_]+/g, " ")
    .replace(/^[\s.·–—:-]+|[\s.·–—:-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    volumeNumber: Number.isFinite(volumeNumber) ? volumeNumber : null,
    chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : null,
    title: title || (special ? (special === "prologue" ? "Prólogo" : "Epílogo") : chapterNumber !== null ? `Capítulo ${chapterNumber}` : volumeNumber !== null ? `Volume ${volumeNumber}` : remainder || stem),
    special,
  };
}
