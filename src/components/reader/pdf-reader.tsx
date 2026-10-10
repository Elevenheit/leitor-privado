"use client";

import Link from "next/link";
import { toDataError, reportDataError } from "@/lib/data/errors";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { User } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { BookmarkPanel } from "@/components/reader/bookmark-panel";
import { InlineIllustration } from "@/components/reader/inline-illustration";
import { ReaderIndex } from "@/components/reader/reader-index";
import { LazyPdfPage } from "@/components/reader/lazy-pdf-page";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { PdfNavigationPanel } from "@/components/reader/pdf-navigation-panel";
import type { PdfSearchResult } from "@/hooks/use-pdf-navigation";
import { useReaderIndex } from "@/hooks/use-reader-index";
import {
  createReaderIllustrationExtractor,
  type ReaderIllustration,
} from "@/lib/reader-illustrations";
import { BUCKET, supabase } from "@/lib/supabase";
import { getReaderNavigationNeighbors } from "@/lib/data/reader-navigation";
import {
  saveReadingProgress,
  loadReadingProgress,
  ProgressConflictError,
} from "@/lib/data/progress";
import { patchProfileSettings } from "@/lib/data/preferences";
import {
  normalizeReaderPreferences,
  type ReaderPreferences,
} from "@/lib/reader-preferences";
import { calculateReadingProgress } from "@/lib/media-rules";
import { useProgressPersistence } from "@/hooks/use-progress-persistence";
import { consumeReaderRestart } from "@/lib/reader-restart";
import { publishAppPreferences } from "@/lib/app-experience";
import {
  createPrivateMediaUrl,
  isPrivateMediaAuthorizationError,
  PRIVATE_MEDIA_URL_REFRESH_MARGIN_MS,
} from "@/lib/private-media-url";
import { extractReadingBlocks, type ReadingBlock } from "@/lib/reader-text";
import type {
  Book,
  ReadingBookmark,
  ReadingProgress,
  Series,
  Volume,
} from "@/lib/types";

type Mode = "text" | "page";
type Theme = "dark" | "sepia" | "light";
type Position = {
  page: number;
  line: number;
  ratio: number;
  offset?: number;
  character?: number;
};
type OrderedPageContent =
  | { type: "text"; position: number; index: number; block: ReadingBlock }
  | {
      type: "illustration";
      position: number;
      illustration: ReaderIllustration;
    };

function captureTextPosition(segment: Element | null | undefined, top: number) {
  const block = [
    ...(segment?.querySelectorAll<HTMLElement>("[data-line]") || []),
  ].find((node) => node.getBoundingClientRect().bottom > top);
  const line = Number(block?.dataset.line || 0);
  if (block?.firstChild?.nodeType !== Node.TEXT_NODE) return { line };
  const text = block.firstChild;
  const range = document.createRange();
  let low = 0,
    high = Math.max(0, (text.textContent?.length || 0) - 1);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    range.setStart(text, mid);
    range.setEnd(text, mid + 1);
    if (range.getBoundingClientRect().bottom > top) high = mid;
    else low = mid + 1;
  }
  return { line, character: low };
}

function orderPageContent(
  blocks: ReadingBlock[],
  illustrations: ReaderIllustration[],
): OrderedPageContent[] {
  return [
    ...blocks.map((block, index): OrderedPageContent => ({
      type: "text",
      position: block.position,
      index,
      block,
    })),
    ...illustrations.map((illustration): OrderedPageContent => ({
      type: "illustration",
      position: illustration.position,
      illustration,
    })),
  ].sort((left, right) => {
    const positionOrder = left.position - right.position;
    if (positionOrder) return positionOrder;
    if (left.type === right.type)
      return left.type === "text" && right.type === "text"
        ? left.index - right.index
        : 0;
    return left.type === "text" ? -1 : 1;
  });
}

export default function ReadPage() {
  const params = useParams<{ id: string }>();
  return (
    <AuthGate>
      {(user) => (
        <Reader key={`${user.id}:${params.id}`} user={user} id={params.id} />
      )}
    </AuthGate>
  );
}

function Reader({ user, id }: { user: User; id: string }) {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [volume, setVolume] = useState<Volume | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState(0);
  const [mode, setMode] = useState<Mode>("text");
  const [theme, setTheme] = useState<Theme>("dark");
  const [fontFamily, setFontFamily] = useState<"serif" | "sans">("serif");
  const [fontSize, setFontSize] = useState(22);
  const [lineHeight, setLineHeight] = useState(1.85);
  const [textWidth, setTextWidth] = useState(760);
  const [showIllustrations, setShowIllustrations] = useState(true);
  const [textByPage, setTextByPage] = useState<Record<number, ReadingBlock[]>>(
    {},
  );
  const [illustrationsByPage, setIllustrationsByPage] = useState<
    Record<number, ReaderIllustration[]>
  >({});
  const [illustrationStatus, setIllustrationStatus] = useState<
    Record<number, "loading" | "complete">
  >({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePages, setActivePages] = useState<Set<number>>(
    new Set([1, 2, 3]),
  );
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageHeights, setPageHeights] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [urlGeneration, setUrlGeneration] = useState(0);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("Salvo");
  const [saveError, setSaveError] = useState("");
  const [saveConflict, setSaveConflict] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const pendingPreferences = useRef<Partial<ReaderPreferences>>({});
  const preferenceVersion = useRef(0);
  const [destination, setDestination] = useState<string | null>(null);
  const navigating = useRef(false);
  const [previousId, setPreviousId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);

  const [indexOpen, setIndexOpen] = useState(false);
  const [documentNavigationOpen, setDocumentNavigationOpen] = useState(false);
  const [documentQuery, setDocumentQuery] = useState("");
  const {
    books: libraryBooks,
    volumes: libraryVolumes,
    progress: libraryProgress,
    hasMore: libraryHasMore,
    loading: libraryLoading,
    error: indexError,
    loadPage: loadLibraryPage,
  } = useReaderIndex(book, user.id, indexOpen);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [restoreTick, setRestoreTick] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [focusControlsVisible, setFocusControlsVisible] = useState(false);
  const focusRecovery = useRef<HTMLButtonElement>(null);
  const wasFocused = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveVersion = useRef(0);
  const pageRef = useRef(1);
  const modeRef = useRef<Mode>("text");
  const readyRef = useRef(false);
  const restoringRef = useRef<Position | null>(null);
  const restoredTextAnchor = useRef<{
    page: number;
    line: number;
    character: number;
    scrollTop: number;
  } | null>(null);
  const resizeAnchor = useRef<Position>({
    page: 1,
    line: 0,
    ratio: 0,
    offset: 0,
  });
  const lastTextAnchor = useRef<Position | null>(null);
  const loadingRef = useRef(new Map<number, PDFDocumentProxy>());
  const activePdf = useRef<PDFDocumentProxy | null>(null);
  const retainedPagesRef = useRef(new Set<number>());
  const restart = useRef<boolean | null>(null);

  const orderedPages = useMemo(
    () => Array.from({ length: pages }, (_, i) => i + 1),
    [pages],
  );
  const illustrationExtractor = useMemo(
    () => (pdf ? createReaderIllustrationExtractor(pdf) : null),
    [pdf],
  );

  useEffect(
    () => () => illustrationExtractor?.dispose(),
    [illustrationExtractor],
  );

  useLayoutEffect(() => {
    if (mode !== "text") return;
    const root = scrollRef.current;
    if (!root) return;
    const measurements: Record<number, number> = {};
    for (const element of root.querySelectorAll<HTMLElement>(
      "[data-page-segment]",
    )) {
      const page = Number(element.dataset.pageSegment);
      if (textByPage[page] !== undefined && element.offsetHeight > 0)
        measurements[page] = element.offsetHeight;
    }
    setPageHeights((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const [page, height] of Object.entries(measurements)) {
        if (next[Number(page)] !== height) {
          next[Number(page)] = height;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [mode, textByPage, illustrationsByPage, illustrationStatus]);

  const currentTextPosition = useCallback(
    (root: HTMLElement, page: number, top: number) => {
      const restored = restoredTextAnchor.current;
      // Reflow can move the original character within the first visible line.
      // Until the reader scrolls, successive changes must keep that character.
      if (
        modeRef.current === "text" &&
        restored?.page === page &&
        Math.abs(root.scrollTop - restored.scrollTop) < 1
      )
        return { line: restored.line, character: restored.character };
      return captureTextPosition(
        root.querySelector(`[data-page-segment="${page}"]`),
        top,
      );
    },
    [],
  );

  const save = useCallback(async () => {
    if (!readyRef.current || restoringRef.current) return false;
    const container = scrollRef.current;
    if (!container) return;
    const atEnd =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 16;
    if (atEnd) pageRef.current = pages;
    const version = ++saveVersion.current;
    const segment = container.querySelector<HTMLElement>(
      `[data-page-segment="${pageRef.current}"]`,
    );
    const visibleTop = container.getBoundingClientRect().top + 28;
    const rect = segment?.getBoundingClientRect();
    const offset = rect
      ? Math.min(
          1,
          Math.max(0, (visibleTop - rect.top) / Math.max(1, rect.height)),
        )
      : 0;
    const ratio = atEnd
      ? 1
      : (pageRef.current - 1 + offset) / Math.max(1, pages);
    const textPosition = currentTextPosition(
      container,
      pageRef.current,
      visibleTop,
    );
    const lineIndex = textPosition.line;
    resizeAnchor.current = {
      page: pageRef.current,
      line: lineIndex,
      ratio,
      offset,
      character: textPosition.character,
    };
    setSaveState("Salvando…");
    try {
      const result = await saveReadingProgress(user.id, id, {
        page_number: pageRef.current,
        line_index: lineIndex,
        scroll_ratio: ratio,
        reading_mode: modeRef.current,
        page_count: pages,
        page_offset: offset,
        text_offset: textPosition.character,
        completed: calculateReadingProgress({
          mediaType: "pdf",
          pageNumber: pageRef.current,
          totalPages: pages,
          scrollRatio: ratio,
        }).completed,
      });
      if (version === saveVersion.current)
        setSaveState(result.synced ? "Salvo" : "Salvo neste dispositivo");
      if (version === saveVersion.current) {
        setSaveError("");
        setSaveConflict(false);
      }
      return true;
    } catch (cause) {
      if (version === saveVersion.current) {
        setSaveState("Falha ao salvar");
        setSaveConflict(cause instanceof ProgressConflictError);
        setSaveError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível salvar o progresso. Tente novamente.",
        );
      }
      return false;
    }
  }, [id, user.id, pages, currentTextPosition]);
  const scheduleSave = useProgressPersistence(save, !loading);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    async function init() {
      try {
        if (restart.current === null) restart.current = consumeReaderRestart();
        const api = supabase();
        const [bookResult, progressResult] = await Promise.all([
          api
            .from("books")
            .select(
              "id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type",
            )
            .eq("id", id)
            .single(),
          loadReadingProgress(user.id, id),
        ]);
        if (bookResult.error || !bookResult.data)
          throw new Error("Capítulo não encontrado ou sem acesso.");
        if (cancelled) return;
        const current = bookResult.data as Book;
        if (current.media_type === "cbz") {
          router.replace(`/media/${id}`);
          return;
        }
        void getReaderNavigationNeighbors(current)
          .then(({ previousId, nextId }) => {
            if (!cancelled) {
              setPreviousId(previousId);
              setNextId(nextId);
            }
          })
          .catch(() => {
            if (!cancelled)
              setSaveError(
                "Não foi possível carregar os capítulos vizinhos. Use o índice ou tente recarregar.",
              );
          });
        const [workResult, volumeResult, privateUrl] = await Promise.all([
          current.series_id
            ? api
                .from("series")
                .select(
                  "id,owner_id,title,description,cover_path,format,created_at,updated_at,tags,rights_note,beta_visible",
                )
                .eq("id", current.series_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          current.volume_id
            ? api
                .from("volumes")
                .select(
                  "id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at",
                )
                .eq("id", current.volume_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          createPrivateMediaUrl(BUCKET, current.file_path),
        ]);
        if (cancelled) return;
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const openDocument = (url: string) =>
          pdfjs.getDocument({
            url,
            disableAutoFetch: true,
            disableStream: true,
            rangeChunkSize: 262144,
          });
        let activePrivateUrl = privateUrl;
        task = openDocument(activePrivateUrl.url);
        let loaded: PDFDocumentProxy;
        try {
          loaded = await task.promise;
        } catch (cause) {
          if (!isPrivateMediaAuthorizationError(cause)) throw cause;
          await task.destroy();
          if (cancelled) return;
          activePrivateUrl = await createPrivateMediaUrl(
            BUCKET,
            current.file_path,
          );
          if (cancelled) return;
          task = openDocument(activePrivateUrl.url);
          loaded = await task.promise;
        }
        if (cancelled) return;
        const refreshIn = Math.max(
          0,
          activePrivateUrl.expiresAt -
            Date.now() -
            PRIVATE_MEDIA_URL_REFRESH_MARGIN_MS,
        );
        refreshTimer = setTimeout(() => {
          void saveRef.current().finally(() => {
            if (!cancelled) {
              setLoading(true);
              setUrlGeneration((generation) => generation + 1);
            }
          });
        }, refreshIn);
        const saved = restart.current
          ? null
          : (progressResult as ReadingProgress | null);
        const start = Math.min(
          loaded.numPages,
          Math.max(1, saved?.page_number ?? 1),
        );
        setBook(current);
        setSeries(workResult.data as Series | null);
        setVolume(volumeResult.data as Volume | null);
        setPdf(loaded);
        activePdf.current = loaded;
        setTextByPage({});
        setIllustrationsByPage({});
        setIllustrationStatus({});
        setLoadingPages(new Set());
        setPages(loaded.numPages);
        setCurrentPage(start);
        pageRef.current = start;
        restoringRef.current = saved
          ? {
              page: start,
              line: saved.line_index || 0,
              character: saved.text_offset,
              ratio: saved.scroll_ratio || 0,
              offset:
                saved.page_offset ??
                Math.min(
                  1,
                  Math.max(
                    0,
                    saved.scroll_ratio * loaded.numPages - (start - 1),
                  ),
                ),
            }
          : null;
        resizeAnchor.current = restoringRef.current || {
          page: start,
          line: 0,
          ratio: 0,
          offset: 0,
        };
        setMode(saved?.reading_mode || "text");
        modeRef.current = saved?.reading_mode || "text";
        setActivePages(
          new Set([
            Math.max(1, start - 1),
            start,
            Math.min(loaded.numPages, start + 1),
          ]),
        );

        const applyPreferences = (value: unknown) => {
          const p = normalizeReaderPreferences(value);
          setFontSize(p.fontSize);
          setLineHeight(p.lineHeight);
          setTextWidth(p.textWidth);
          setTheme(p.theme);
          setFontFamily(p.fontFamily);
          setShowIllustrations(p.showIllustrations);
        };
        try {
          const cached = localStorage.getItem(`nook-reader-prefs:${user.id}`);
          if (cached) applyPreferences(JSON.parse(cached));
        } catch {
          /* The remote profile remains authoritative. */
        }
        const profile = await api
          .from("profiles")
          .select("preferences")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (profile.error)
          setPreferenceError(
            "Não foi possível carregar as preferências da conta. Os ajustes locais continuam disponíveis.",
          );
        else if (profile.data) {
          applyPreferences(profile.data.preferences);
          publishAppPreferences(user.id, profile.data.preferences);
        }
        readyRef.current = true;
        restart.current = false;
        setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(
            toDataError(
              cause,
              "Nao foi possivel abrir o PDF. Confira o arquivo e seu acesso.",
              "pdf",
            ).message,
          );
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      readyRef.current = false;
      lastTextAnchor.current = null;
      activePdf.current = null;
      if (task)
        void task.destroy().catch((cause) => reportDataError(cause, "pdf"));
    };
  }, [id, user.id, urlGeneration, router]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !pages) return;
    const intersecting = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number(
            (entry.target as HTMLElement).dataset.pageSegment,
          );
          if (entry.isIntersecting) intersecting.add(page);
          else intersecting.delete(page);
        }
        const visible = [...intersecting];
        if (!visible.length) return;
        const viewport = root.getBoundingClientRect();
        const inside = visible.filter((value) => {
          const rect = root
            .querySelector<HTMLElement>(`[data-page-segment="${value}"]`)
            ?.getBoundingClientRect();
          return (
            rect &&
            rect.bottom >
              viewport.top + Math.min(120, root.clientHeight * 0.25) &&
            rect.top < viewport.bottom
          );
        });
        const selected =
          restoringRef.current?.page ??
          (root.scrollTop + root.clientHeight >= root.scrollHeight - 16
            ? pages
            : inside.length
              ? Math.min(...inside)
              : pageRef.current);
        pageRef.current = selected;
        setCurrentPage(selected);
        const near = new Set<number>();
        for (const n of [...visible, selected])
          for (let offset = -2; offset <= 2; offset++)
            if (n + offset >= 1 && n + offset <= pages) near.add(n + offset);
        setActivePages(near);
      },
      { root, rootMargin: "900px 0px", threshold: 0.02 },
    );
    root
      .querySelectorAll("[data-page-segment]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pages, loading]);

  useEffect(() => {
    const retained = new Set(activePages);
    for (
      let page = Math.max(1, currentPage - 10);
      page <= Math.min(pages, currentPage + 10);
      page++
    )
      retained.add(page);
    retainedPagesRef.current = retained;
    const prune = <T,>(previous: Record<number, T>) => {
      const entries = Object.entries(previous).filter(([page]) =>
        retained.has(Number(page)),
      );
      return entries.length === Object.keys(previous).length
        ? previous
        : (Object.fromEntries(entries) as Record<number, T>);
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTextByPage(prune);
    setIllustrationsByPage(prune);
    setIllustrationStatus(prune);
    setLoadingPages(
      (previous) => new Set([...previous].filter((page) => retained.has(page))),
    );
    for (const page of Object.keys(illustrationStatus).map(Number))
      if (!retained.has(page)) illustrationExtractor?.release(page);
  }, [
    activePages,
    currentPage,
    illustrationExtractor,
    illustrationStatus,
    pages,
  ]);

  const loadPageText = useCallback(
    async (pageNo: number) => {
      if (
        !pdf ||
        loadingRef.current.get(pageNo) === pdf ||
        textByPage[pageNo] !== undefined
      )
        return;
      loadingRef.current.set(pageNo, pdf);
      setLoadingPages((previous) => new Set(previous).add(pageNo));
      try {
        const pdfPage = await pdf.getPage(pageNo);
        const content = await pdfPage.getTextContent();
        const blocks = extractReadingBlocks(content.items, pdfPage.view);
        if (activePdf.current === pdf && retainedPagesRef.current.has(pageNo))
          setTextByPage((previous) => ({ ...previous, [pageNo]: blocks }));
      } catch (cause) {
        if (activePdf.current === pdf)
          setError(
            toDataError(
              cause,
              "Nao foi possivel extrair o texto desta pagina.",
              "pdf",
            ).message,
          );
      } finally {
        if (loadingRef.current.get(pageNo) !== pdf) return;
        loadingRef.current.delete(pageNo);
        setLoadingPages((previous) => {
          const next = new Set(previous);
          next.delete(pageNo);
          return next;
        });
      }
    },
    [pdf, textByPage],
  );

  useEffect(() => {
    if (!pdf || mode !== "text") return;
    // Extract only pages inside the lazy loading window as they enter it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const pageNo of activePages) void loadPageText(pageNo);
  }, [pdf, mode, activePages, loadPageText]);

  useEffect(() => {
    if (!illustrationExtractor || mode !== "text" || !showIllustrations) return;
    const pagesToExtract = [...activePages].filter(
      (pageNo) =>
        textByPage[pageNo] !== undefined &&
        illustrationStatus[pageNo] !== "loading" &&
        illustrationStatus[pageNo] !== "complete",
    );
    if (!pagesToExtract.length) return;
    // Mark pages before starting async extraction so the empty-text fallback cannot flash early.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIllustrationStatus((previous) => {
      const next = { ...previous };
      for (const pageNo of pagesToExtract) next[pageNo] = "loading";
      return next;
    });
    for (const pageNo of pagesToExtract) {
      const hasReadableText = textByPage[pageNo].length > 0;
      void illustrationExtractor
        .get(pageNo, hasReadableText)
        .then((images) => {
          if (
            activePdf.current === pdf &&
            images.length &&
            retainedPagesRef.current.has(pageNo)
          )
            setIllustrationsByPage((previous) => ({
              ...previous,
              [pageNo]: images,
            }));
        })
        .finally(() => {
          if (activePdf.current === pdf && retainedPagesRef.current.has(pageNo))
            setIllustrationStatus((previous) => ({
              ...previous,
              [pageNo]: "complete",
            }));
        });
    }
  }, [
    illustrationExtractor,
    mode,
    showIllustrations,
    activePages,
    textByPage,
    illustrationStatus,
    pdf,
  ]);

  useEffect(() => {
    const root = scrollRef.current;
    const saved = restoringRef.current;
    if (!root || !saved || !pages) return;
    const segment = root.querySelector<HTMLElement>(
      `[data-page-segment="${saved.page}"]`,
    );
    if (!segment) return;
    if (modeRef.current === "text" && textByPage[saved.page] === undefined)
      return;
    if (
      modeRef.current === "page" &&
      !segment.querySelector("canvas[data-ready='true']")
    )
      return;
    if (
      modeRef.current === "text" &&
      showIllustrations &&
      illustrationStatus[saved.page] !== "complete"
    )
      return;
    const frame = requestAnimationFrame(() => {
      const target = segment.querySelector<HTMLElement>(
        `[data-line="${saved.line}"]`,
      );
      if (
        target &&
        saved.character !== undefined &&
        target.firstChild?.nodeType === Node.TEXT_NODE
      ) {
        const range = document.createRange();
        const text = target.firstChild;
        const index = Math.min(
          saved.character,
          Math.max(0, (text.textContent?.length || 0) - 1),
        );
        range.setStart(text, index);
        range.setEnd(text, Math.min(index + 1, text.textContent?.length || 0));
        root.scrollTop +=
          range.getBoundingClientRect().top -
          root.getBoundingClientRect().top -
          32;
      } else if (target && saved.offset === undefined)
        root.scrollTop +=
          target.getBoundingClientRect().top -
          root.getBoundingClientRect().top -
          32;
      else
        root.scrollTop +=
          segment.getBoundingClientRect().top -
          root.getBoundingClientRect().top -
          28 +
          (saved.offset || 0) * segment.getBoundingClientRect().height;
      pageRef.current = saved.page;
      restoredTextAnchor.current =
        modeRef.current === "text" && saved.character !== undefined
          ? {
              page: saved.page,
              line: saved.line,
              character: saved.character,
              scrollTop: root.scrollTop,
            }
          : null;
      setCurrentPage(saved.page);
      resizeAnchor.current = saved;
      restoringRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    pages,
    textByPage,
    mode,
    restoreTick,
    showIllustrations,
    illustrationStatus,
  ]);

  const onPageReady = useCallback((page: number) => {
    if (restoringRef.current?.page === page)
      setRestoreTick((value) => value + 1);
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || loading) return;
    let previousWidth = root.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = root.clientWidth;
      if (Math.abs(width - previousWidth) < 2) return;
      previousWidth = width;
      if (restoringRef.current || !readyRef.current) return;
      const anchor = resizeAnchor.current;
      restoringRef.current = { ...anchor };
      setActivePages(
        new Set([
          Math.max(1, anchor.page - 1),
          anchor.page,
          Math.min(pages, anchor.page + 1),
        ]),
      );
      setRestoreTick((value) => value + 1);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [loading, pages]);

  const toggleFocusMode = useCallback(() => {
    setFocusControlsVisible(false);
    setSettingsOpen(false);
    setIndexOpen(false);
    setBookmarksOpen(false);
    setFocusMode((value) => !value);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], [role='dialog']",
        )
      )
        return;
      if (event.key === "Escape") {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (indexOpen || bookmarksOpen || documentNavigationOpen) {
          setIndexOpen(false);
          setBookmarksOpen(false);
          setDocumentNavigationOpen(false);
          return;
        }
        if (focusControlsVisible) {
          setFocusControlsVisible(false);
          focusRecovery.current?.focus({ preventScroll: true });
        } else setFocusMode(false);
        return;
      }
      if (
        event.key.toLowerCase() === "f" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        toggleFocusMode();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    indexOpen,
    bookmarksOpen,
    documentNavigationOpen,
    settingsOpen,
    focusControlsVisible,
    toggleFocusMode,
  ]);

  useEffect(() => {
    if (focusMode) focusRecovery.current?.focus({ preventScroll: true });
    else if (wasFocused.current)
      document
        .querySelector<HTMLButtonElement>(
          '.reader-toolbar [aria-label="Ativar modo foco"]',
        )
        ?.focus({ preventScroll: true });
    wasFocused.current = focusMode;
  }, [focusMode]);

  function onScroll() {
    if (restoringRef.current) return;
    const root = scrollRef.current;
    if (root) {
      const top = root.getBoundingClientRect().top + 28;
      let low = 1,
        high = pages;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const node = root.querySelector<HTMLElement>(
          `[data-page-segment="${mid}"]`,
        );
        if (
          node &&
          node.getBoundingClientRect().bottom <=
            root.getBoundingClientRect().top +
              Math.min(120, root.clientHeight * 0.25)
        )
          low = mid + 1;
        else high = mid;
      }
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 16)
        low = pages;
      pageRef.current = low;
      setCurrentPage((previous) => (previous === low ? previous : low));
      const segment = root.querySelector<HTMLElement>(
        `[data-page-segment="${low}"]`,
      );
      const rect = segment?.getBoundingClientRect();
      const offset = rect
        ? Math.min(1, Math.max(0, (top - rect.top) / Math.max(1, rect.height)))
        : 0;
      const line = [
        ...(segment?.querySelectorAll<HTMLElement>("[data-line]") || []),
      ].find((node) => node.getBoundingClientRect().bottom >= top);
      resizeAnchor.current = {
        page: low,
        line: Number(line?.dataset.line || 0),
        ratio: (low - 1 + offset) / Math.max(1, pages),
        offset,
      };
    }
    scheduleSave();
  }
  function updatePrefs(
    change: Partial<{
      fontSize: number;
      fontFamily: "serif" | "sans";
      lineHeight: number;
      textWidth: number;
      theme: Theme;
      showIllustrations: boolean;
    }>,
  ) {
    if (
      modeRef.current === "text" &&
      readyRef.current &&
      (change.fontSize !== undefined ||
        change.fontFamily !== undefined ||
        change.lineHeight !== undefined ||
        change.textWidth !== undefined ||
        change.showIllustrations !== undefined)
    ) {
      const anchor: Position = { ...resizeAnchor.current };
      const root = scrollRef.current;
      const top = (root?.getBoundingClientRect().top || 0) + 32;
      Object.assign(
        anchor,
        root ? currentTextPosition(root, pageRef.current, top) : {},
      );
      restoringRef.current = anchor;
      setRestoreTick((value) => value + 1);
    }
    const next = normalizeReaderPreferences({
      fontFamily,
      fontSize,
      lineHeight,
      textWidth,
      theme,
      showIllustrations,
      ...change,
    });
    if (change.fontSize !== undefined) setFontSize(next.fontSize);
    if (change.fontFamily !== undefined) setFontFamily(next.fontFamily);
    if (change.lineHeight !== undefined) setLineHeight(next.lineHeight);
    if (change.textWidth !== undefined) setTextWidth(next.textWidth);
    if (change.theme !== undefined) setTheme(next.theme);
    if (change.showIllustrations !== undefined)
      setShowIllustrations(next.showIllustrations);
    pendingPreferences.current = { ...pendingPreferences.current, ...change };
    const patch = { ...pendingPreferences.current };
    const version = ++preferenceVersion.current;
    try {
      localStorage.setItem(
        `nook-reader-prefs:${user.id}`,
        JSON.stringify(next),
      );
    } catch {
      /* Storage is optional. */
    }
    void patchProfileSettings(user.id, patch)
      .then(() => {
        if (version !== preferenceVersion.current) return;
        for (const key of Object.keys(patch) as (keyof ReaderPreferences)[])
          if (pendingPreferences.current[key] === patch[key])
            delete pendingPreferences.current[key];
        if (!Object.keys(pendingPreferences.current).length)
          setPreferenceError("");
      })
      .catch(() => {
        if (version === preferenceVersion.current)
          setPreferenceError(
            "Preferências guardadas neste navegador. Tente sincronizar novamente.",
          );
      });
  }
  function setView(next: Mode) {
    if (next === modeRef.current) return;
    const page = pageRef.current;
    const root = scrollRef.current;
    const top = (root?.getBoundingClientRect().top || 0) + 28;
    const segment = root?.querySelector<HTMLElement>(
      `[data-page-segment="${page}"]`,
    );
    const rect = segment?.getBoundingClientRect();
    const offset = rect
      ? Math.min(1, Math.max(0, (top - rect.top) / Math.max(1, rect.height)))
      : 0;
    // Text -> PDF uses the physical page fraction. PDF -> text maps that
    // fraction to reflowed content; keep the precise text anchor if unchanged.
    const anchor =
      modeRef.current === "text" && root
        ? currentTextPosition(root, page, top)
        : null;
    if (anchor)
      lastTextAnchor.current = {
        page,
        offset,
        ratio: (page - 1 + offset) / Math.max(1, pages),
        ...anchor,
      };
    const remembered = lastTextAnchor.current;
    const pendingModeRestore = restoringRef.current;
    const samePosition =
      next === "text" &&
      remembered?.page === page &&
      (Math.abs((remembered.offset ?? 0) - offset) < 0.015 ||
        (pendingModeRestore?.page === page &&
          pendingModeRestore.character === remembered.character &&
          Math.abs(
            (pendingModeRestore.offset ?? 0) - (remembered.offset ?? 0),
          ) < 0.015));
    restoringRef.current = {
      page,
      line: samePosition ? remembered!.line : (anchor?.line ?? 0),
      ratio: (page - 1 + offset) / Math.max(1, pages),
      offset,
      character: samePosition
        ? remembered!.character
        : next === "text"
          ? undefined
          : anchor?.character,
    };
    modeRef.current = next;
    resizeAnchor.current = restoringRef.current;
    setMode(next);
    setRestoreTick((value) => value + 1);
    setSettingsOpen(false);
  }
  async function navigate(href: string) {
    if (navigating.current) return;
    navigating.current = true;
    setDestination(href);
    try {
      if (await save()) router.push(href);
    } finally {
      navigating.current = false;
    }
  }
  function bookmarkPosition() {
    const root = scrollRef.current;
    const segment = root?.querySelector<HTMLElement>(
      `[data-page-segment="${pageRef.current}"]`,
    );
    const top = (root?.getBoundingClientRect().top || 0) + 28;
    const lines = segment?.querySelectorAll<HTMLElement>("[data-line]");
    let lineIndex = 0;
    if (lines)
      for (const line of lines) {
        if (line.getBoundingClientRect().bottom >= top) {
          lineIndex = Number(line.dataset.line);
          break;
        }
      }
    return {
      page_number: pageRef.current,
      line_index: lineIndex,
      text_offset:
        root && modeRef.current === "text"
          ? currentTextPosition(root, pageRef.current, top).character
          : undefined,
      page_offset: segment
        ? Math.min(
            1,
            Math.max(
              0,
              (top - segment.getBoundingClientRect().top) /
                Math.max(1, segment.getBoundingClientRect().height),
            ),
          )
        : 0,
      scroll_ratio: segment
        ? (pageRef.current -
            1 +
            Math.min(
              1,
              Math.max(
                0,
                (top - segment.getBoundingClientRect().top) /
                  Math.max(1, segment.getBoundingClientRect().height),
              ),
            )) /
          Math.max(1, pages)
        : 0,
    };
  }

  function jumpToBookmark(bookmark: ReadingBookmark) {
    const targetPage = Math.max(1, Math.min(pages, bookmark.page_number));
    restoringRef.current = {
      page: targetPage,
      line: bookmark.line_index,
      character: bookmark.text_offset ?? undefined,
      ratio: bookmark.scroll_ratio,
      offset:
        bookmark.page_offset ??
        (modeRef.current === "text"
          ? undefined // Legacy text bookmarks retain their original line anchor.
          : Math.min(
              1,
              Math.max(0, bookmark.scroll_ratio * pages - (targetPage - 1)),
            )),
    };
    setActivePages(
      new Set([
        Math.max(1, targetPage - 1),
        targetPage,
        Math.min(pages, targetPage + 1),
      ]),
    );
    setBookmarksOpen(false);
    setRestoreTick((value) => value + 1);
  }

  function jumpInDocument(page: number, result?: PdfSearchResult) {
    const target = Math.min(pages, Math.max(1, page));
    if (result) {
      modeRef.current = "text";
      setMode("text");
    }
    restoringRef.current = {
      page: target,
      line: result?.line ?? 0,
      character: result?.character,
      ratio: (target - 1) / Math.max(1, pages),
      offset: result ? undefined : 0,
    };
    setActivePages(
      new Set([Math.max(1, target - 1), target, Math.min(pages, target + 1)]),
    );
    setRestoreTick((value) => value + 1);
  }

  if (loading)
    return (
      <>
        <Nav back />
        <main id="main-content" className="reader-status" aria-busy="true">
          <span className="reader-loading-mark" />
          Abrindo sua leitura…
        </main>
      </>
    );
  if (error && !book)
    return (
      <>
        <Nav back />
        <main id="main-content" className="reader-status">
          <BookOpen size={34} />
          <h1>Não foi possível abrir</h1>
          <p>{error}</p>
          <button
            className="secondary-button"
            onClick={() => location.reload()}
          >
            Tentar novamente
          </button>
          <Link href="/" className="primary-button">
            Voltar à biblioteca
          </Link>
        </main>
      </>
    );

  const pageCaption =
    book?.content_type === "volume"
      ? `Volume completo${book.chapter_number !== null ? ` ${book.chapter_number}` : ""}${book.chapter_title ? ` · ${book.chapter_title}` : ""}`
      : book?.chapter_number !== null && book?.chapter_number !== undefined
        ? `Capítulo ${book.chapter_number}${book.chapter_title ? ` · ${book.chapter_title}` : ""}`
        : book?.chapter_title || book?.title;
  return (
    <div
      className={`reader-app reader-theme-${theme} ${focusMode ? "focus-mode" : ""} ${focusControlsVisible ? "focus-controls-visible" : ""}`}
    >
      {focusMode && (
        <button
          ref={focusRecovery}
          className="focus-recovery"
          aria-label={
            focusControlsVisible
              ? "Ocultar controles de leitura"
              : "Mostrar controles de leitura"
          }
          aria-expanded={focusControlsVisible}
          aria-controls="reader-chrome"
          onClick={() => {
            setSettingsOpen(false);
            setFocusControlsVisible((value) => !value);
          }}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
        </button>
      )}
      <div
        id="reader-chrome"
        className="reader-chrome"
        inert={focusMode && !focusControlsVisible}
      >
        <header className="reader-topbar">
          <button
            className="reader-back"
            aria-label="Voltar à biblioteca"
            onClick={() => {
              void navigate(series ? `/series/${series.id}` : "/");
            }}
          >
            <ArrowLeft size={18} />
            <span>Biblioteca</span>
          </button>
          <div className="reader-heading">
            <strong>{series?.title || book?.title}</strong>
            <span>
              {volume
                ? volume.volume_number !== null
                  ? `Volume ${volume.volume_number}`
                  : volume.title
                : ""}
              {volume ? " · " : ""}
              {pageCaption}
            </span>
          </div>
          <span
            className={`save-state ${saveState === "Salvo" ? "" : saveState === "Falha ao salvar" ? "save-state-error" : "save-state-active"}`}
            aria-live="polite"
          >
            {saveState}
          </span>
        </header>
        <ReaderToolbar
          onDocumentNavigation={() => setDocumentNavigationOpen(true)}
          mode={mode}
          setView={setView}
          previousId={previousId}
          nextId={nextId}
          setIndexOpen={setIndexOpen}
          currentPage={currentPage}
          pages={pages}
          setBookmarksOpen={setBookmarksOpen}
          focusMode={focusMode}
          toggleFocusMode={toggleFocusMode}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineHeight={lineHeight}
          textWidth={textWidth}
          theme={theme}
          showIllustrations={showIllustrations}
          updatePrefs={updatePrefs}
          onNavigate={(bookId) => void navigate(`/read/${bookId}`)}
        />
      </div>
      {saveError && (
        <div className="reader-save-feedback" role="alert">
          <p>{saveError}</p>
          {saveConflict ? (
            <button onClick={() => location.reload()}>
              Carregar posição recente
            </button>
          ) : (
            <button
              onClick={() => {
                if (destination) void navigate(destination);
                else void save();
              }}
            >
              Tentar salvar novamente
            </button>
          )}
          {destination && (
            <button onClick={() => router.push(destination)}>
              Sair sem salvar esta posição
            </button>
          )}
        </div>
      )}
      {preferenceError && (
        <div className="reader-save-feedback" role="status">
          <p>{preferenceError}</p>
          <button onClick={() => updatePrefs(pendingPreferences.current)}>
            Sincronizar preferências
          </button>
        </div>
      )}
      <main
        id="main-content"
        tabIndex={-1}
        className="reader-scroll"
        ref={scrollRef}
        onScroll={onScroll}
      >
        <div
          className={`continuous-document ${mode === "text" ? "text-document" : "pdf-document"}`}
          style={
            {
              "--reader-font-size": `${fontSize}px`,
              "--reader-font-family":
                fontFamily === "sans"
                  ? "var(--font-ui)"
                  : "var(--font-literary)",
              "--reader-line-height": lineHeight,
              "--reader-width": `${textWidth}px`,
            } as React.CSSProperties
          }
        >
          {orderedPages.map((pageNo) => (
            <section
              className={`document-segment ${mode === "text" ? "text-segment" : "pdf-segment"}`}
              key={pageNo}
              data-page-segment={pageNo}
              style={
                mode === "text" &&
                textByPage[pageNo] === undefined &&
                pageHeights[pageNo]
                  ? { minHeight: `${pageHeights[pageNo]}px` }
                  : undefined
              }
            >
              {mode === "text" ? (
                textByPage[pageNo] !== undefined ? (
                  textByPage[pageNo].length ||
                  (showIllustrations && illustrationsByPage[pageNo]?.length) ? (
                    <article className="reflow-text">
                      {textByPage[pageNo].reduce(
                        (size, block) => size + block.text.length,
                        0,
                      ) < 40 && (
                        <aside className="text-only-note">
                          Pouco texto extraível nesta página.{" "}
                          <button
                            onClick={() => {
                              pageRef.current = pageNo;
                              setView("page");
                            }}
                          >
                            Ver página original
                          </button>
                        </aside>
                      )}
                      {orderPageContent(
                        textByPage[pageNo],
                        showIllustrations
                          ? illustrationsByPage[pageNo] || []
                          : [],
                      ).map((item) =>
                        item.type === "illustration" ? (
                          <InlineIllustration
                            key={item.illustration.src}
                            illustration={item.illustration}
                          />
                        ) : item.block.kind === "heading" ? (
                          <h2 data-line={item.index} key={`line-${item.index}`}>
                            {item.block.text}
                          </h2>
                        ) : (
                          <p data-line={item.index} key={`line-${item.index}`}>
                            {item.block.text}
                          </p>
                        ),
                      )}
                    </article>
                  ) : showIllustrations &&
                    illustrationStatus[pageNo] !== "complete" ? (
                    <div
                      className="text-placeholder illustration-pending"
                      aria-live="polite"
                      aria-label="Verificando ilustração"
                    />
                  ) : (
                    <div className="text-only-note">
                      Página {pageNo} sem texto extraível.{" "}
                      <button
                        onClick={() => {
                          pageRef.current = pageNo;
                          setView("page");
                        }}
                      >
                        Ver no PDF
                      </button>
                    </div>
                  )
                ) : (
                  <div className="text-placeholder">
                    {loadingPages.has(pageNo) ? "Preparando leitura…" : ""}
                  </div>
                )
              ) : (
                <LazyPdfPage
                  pdf={pdf!}
                  page={pageNo}
                  active={activePages.has(pageNo)}
                  onReady={onPageReady}
                />
              )}
            </section>
          ))}
          {error && (
            <div className="error" role="alert">
              {error}{" "}
              <button onClick={() => location.reload()}>
                Tentar novamente
              </button>
            </div>
          )}
          <div className="chapter-navigation">
            <span>Fim do capítulo</span>
            <div>
              {previousId ? (
                <Link
                  href={`/read/${previousId}`}
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    void navigate(`/read/${previousId}`);
                  }}
                >
                  <ChevronLeft size={17} /> Capítulo anterior
                </Link>
              ) : (
                <span />
              )}
              <button onClick={() => setIndexOpen(true)}>Índice</button>
              {nextId ? (
                <Link
                  href={`/read/${nextId}`}
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    void navigate(`/read/${nextId}`);
                  }}
                >
                  Próximo capítulo <ChevronRight size={17} />
                </Link>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      </main>
      {documentNavigationOpen && pdf && (
        <PdfNavigationPanel
          pdf={pdf}
          currentPage={currentPage}
          query={documentQuery}
          setQuery={setDocumentQuery}
          onJump={jumpInDocument}
          onClose={() => setDocumentNavigationOpen(false)}
        />
      )}
      {indexOpen && (
        <ReaderIndex
          series={series}
          volumes={libraryVolumes}
          books={libraryBooks}
          progress={libraryProgress}
          currentId={id}
          onClose={() => setIndexOpen(false)}
          onNavigate={(bookId) => void navigate(`/read/${bookId}`)}
          onLoadMore={() => void loadLibraryPage()}
          hasMore={libraryHasMore}
          loading={libraryLoading}
          error={indexError}
        />
      )}
      {bookmarksOpen && (
        <BookmarkPanel
          bookId={id}
          ownerId={user.id}
          position={bookmarkPosition}
          onJump={jumpToBookmark}
          onClose={() => setBookmarksOpen(false)}
        />
      )}
    </div>
  );
}
