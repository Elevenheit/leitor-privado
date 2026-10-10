"use client";
import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractReadingBlocks } from "@/lib/reader-text";

export type PdfOutlineEntry = {
  title: string;
  page: number | null;
  depth: number;
};
export type PdfSearchResult = {
  page: number;
  line: number;
  character: number;
  excerpt: string;
};

/** User-triggered, bounded navigation. Never extract the book during startup. */
export function usePdfNavigation(
  pdf: PDFDocumentProxy | null,
  open: boolean,
  query: string,
) {
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
  const [outlineState, setOutlineState] = useState("loading");
  const [results, setResults] = useState<PdfSearchResult[]>([]);
  const [searchedPages, setSearchedPages] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [textFound, setTextFound] = useState(false);

  useEffect(() => {
    if (!pdf || !open) return;
    let live = true;
    async function load() {
      await Promise.resolve();
      if (!live) return;
      setOutlineState("loading");
      setOutline([]);
      try {
        const tree = await pdf!.getOutline();
        const rows: PdfOutlineEntry[] = [];
        async function walk(items: NonNullable<typeof tree>, depth: number) {
          for (const item of items) {
            if (!live || rows.length >= 500 || depth > 10) return;
            let page: number | null = null;
            try {
              const dest =
                typeof item.dest === "string"
                  ? await pdf!.getDestination(item.dest)
                  : item.dest;
              if (Array.isArray(dest) && dest.length) {
                const index =
                  typeof dest[0] === "number"
                    ? dest[0]
                    : await pdf!.getPageIndex(dest[0]);
                if (index >= 0 && index < pdf!.numPages) page = index + 1;
              }
            } catch {
              /* Invalid individual destinations do not hide the outline. */
            }
            if (!live) return;
            rows.push({ title: item.title, page, depth });
            await walk(item.items, depth + 1);
          }
        }
        await walk(tree || [], 0);
        if (live) {
          setOutline(rows);
          setOutlineState("ready");
        }
      } catch {
        if (live) setOutlineState("error");
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [pdf, open]);

  useEffect(() => {
    if (!pdf || !open) return;
    let live = true;
    const timer = setTimeout(async () => {
      if (!live) return;
      setResults([]);
      setSearchedPages(0);
      setTextFound(false);
      setSearchError("");
      const term = query.trim().toLocaleLowerCase("pt-BR");
      if (!term) {
        setSearching(false);
        return;
      }
      setSearching(true);
      const found: PdfSearchResult[] = [];
      try {
        for (
          let pageNumber = 1;
          pageNumber <= pdf.numPages && found.length < 200;
          pageNumber++
        ) {
          if (!live) return;
          const page = await pdf.getPage(pageNumber);
          if (!live) return;
          const text = await page.getTextContent();
          if (!live) return;
          const blocks = extractReadingBlocks(text.items, page.view);
          if (blocks.length) setTextFound(true);
          blocks.forEach((block, line) => {
            const value = block.text.toLocaleLowerCase("pt-BR");
            let index = value.indexOf(term);
            while (index >= 0 && found.length < 200) {
              found.push({
                page: pageNumber,
                line,
                character: index,
                excerpt:
                  (index > 45 ? "…" : "") +
                  block.text.slice(
                    Math.max(0, index - 45),
                    index + term.length + 65,
                  ) +
                  (index + term.length + 65 < block.text.length ? "…" : ""),
              });
              index = value.indexOf(term, index + Math.max(1, term.length));
            }
          });
          setSearchedPages(pageNumber);
          setResults([...found]);
          // Yield between pages so touch/typing/closing interrupts the work.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } catch {
        if (live)
          setSearchError(
            "Não foi possível pesquisar todas as páginas. Tente novamente.",
          );
      } finally {
        if (live) setSearching(false);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [pdf, open, query]);

  return {
    outline,
    outlineState,
    results,
    searchedPages,
    searching,
    searchError,
    textFound,
  };
}
