"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  List,
  Maximize2,
  Minus,
  Plus,
  Settings2,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { User } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { BookmarkPanel } from "@/components/reader/bookmark-panel";
import { InlineIllustration } from "@/components/reader/inline-illustration";
import { ReaderIndex } from "@/components/reader/reader-index";
import { LazyPdfPage } from "@/components/reader/lazy-pdf-page";
import {
  createReaderIllustrationExtractor,
  type ReaderIllustration,
} from "@/lib/reader-illustrations";
import { BUCKET, supabase } from "@/lib/supabase";
import { saveReadingProgress } from "@/lib/data/progress";
import { calculateReadingProgress } from "@/lib/media-rules";
import { createPrivateMediaUrl, isPrivateMediaAuthorizationError, PRIVATE_MEDIA_URL_REFRESH_MARGIN_MS } from "@/lib/private-media-url";
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
type Position = { page: number; line: number; ratio: number };
type OrderedPageContent =
  | { type: "text"; position: number; index: number; block: ReadingBlock }
  | {
      type: "illustration";
      position: number;
      illustration: ReaderIllustration;
    };

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
      {(user) => <Reader key={params.id} user={user} id={params.id} />}
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
  const [fontFamily, setFontFamily] = useState("serif");
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
  const [previousId, setPreviousId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [libraryBooks, setLibraryBooks] = useState<Book[]>([]);
  const [libraryHasMore, setLibraryHasMore] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryVolumes, setLibraryVolumes] = useState<Volume[]>([]);
  const [libraryProgress, setLibraryProgress] = useState<
    Record<string, ReadingProgress>
  >({});
  const [indexOpen, setIndexOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [restoreTick, setRestoreTick] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [focusControlsVisible, setFocusControlsVisible] = useState(false);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusEnteredAt = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);
  const pageRef = useRef(1);
  const modeRef = useRef<Mode>("text");
  const readyRef = useRef(false);
  const restoringRef = useRef<Position | null>(null);
  const loadingRef = useRef(new Set<number>());
  const retainedPagesRef = useRef(new Set<number>());

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
    for (const element of root.querySelectorAll<HTMLElement>("[data-page-segment]")) {
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

  const save = useCallback(async () => {
    if (!readyRef.current || restoringRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    const version = ++saveVersion.current;
    const ratio = Math.min(
      1,
      Math.max(
        0,
        container.scrollTop /
          Math.max(1, container.scrollHeight - container.clientHeight),
      ),
    );
    const segment = container.querySelector<HTMLElement>(
      `[data-page-segment="${pageRef.current}"]`,
    );
    const visibleTop = container.getBoundingClientRect().top + 28;
    const lines = segment?.querySelectorAll<HTMLElement>("[data-line]");
    let lineIndex = 0;
    if (lines)
      for (const line of lines) {
        if (line.getBoundingClientRect().bottom >= visibleTop) {
          lineIndex = Number(line.dataset.line);
          break;
        }
      }
    setSaveState("Salvando…");
    try {
      await saveReadingProgress(user.id, id, {
        page_number: pageRef.current,
        line_index: lineIndex,
        scroll_ratio: ratio,
        reading_mode: modeRef.current,
        completed: calculateReadingProgress({
          mediaType: "pdf",
          pageNumber: pageRef.current,
          totalPages: pages,
          scrollRatio: ratio,
        }).completed,
      });
      if (version === saveVersion.current) setSaveState("Salvo");
    } catch {
      if (version === saveVersion.current) setSaveState("Falha ao salvar");
    }
  }, [id, user.id, pages]);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const loadLibraryPage = useCallback(async () => {
    if (!book || libraryLoading || !libraryHasMore) return;
    setLibraryLoading(true);
    const offset = libraryBooks.length;
    try {
      const api = supabase();
      let booksQuery = api.from("books").select("id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type,skip_intro,intro_end");
      booksQuery = book.series_id
        ? booksQuery.eq("series_id", book.series_id)
        : booksQuery.is("series_id", null);
      const { data, error: booksError } = await booksQuery
        .order("sort_order")
        .order("chapter_number")
        .order("id")
        .range(offset, offset + 99);
      if (booksError) throw booksError;
      const rows = (data || []) as Book[];
      if (rows.length) {
        const ids = rows.map((item) => item.id);
        const { data: saved, error: progressError } = await api
          .from("reading_progress")
          .select("owner_id,book_id,page_number,line_index,scroll_ratio,reading_mode,updated_at,completed,position_seconds")
          .eq("owner_id", user.id)
          .in("book_id", ids);
        if (progressError) throw progressError;
        setLibraryBooks((previous) => [...previous, ...rows]);
        setLibraryProgress((previous) => ({
          ...previous,
          ...Object.fromEntries(((saved || []) as ReadingProgress[]).map((item) => [item.book_id, item])),
        }));
      }
      setLibraryHasMore(rows.length === 100);
    } catch {
      setError("NÃ£o foi possÃ­vel carregar o Ã­ndice da obra.");
      setLibraryHasMore(false);
    } finally {
      setLibraryLoading(false);
    }
  }, [book, libraryBooks.length, libraryHasMore, libraryLoading, user.id]);

  useEffect(() => {
    if (!indexOpen || libraryBooks.length > 0 || !libraryHasMore || libraryLoading) return;
    const timer = setTimeout(() => void loadLibraryPage(), 0);
    return () => clearTimeout(timer);
  }, [indexOpen, libraryBooks.length, libraryHasMore, libraryLoading, loadLibraryPage]);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    async function init() {
      try {
        const api = supabase();
        const [bookResult, progressResult] = await Promise.all([
          api.from("books").select("id,owner_id,title,original_filename,file_path,size_bytes,total_pages,created_at,series_id,volume_id,chapter_number,chapter_title,sort_order,content_type,media_type,skip_intro,intro_end").eq("id", id).single(),
          api.from("reading_progress").select("owner_id,book_id,page_number,line_index,scroll_ratio,reading_mode,updated_at,completed,position_seconds").eq("owner_id", user.id).eq("book_id", id).maybeSingle(),
        ]);
        if (bookResult.error || !bookResult.data)
          throw new Error("Capítulo não encontrado ou sem acesso.");
        const current = bookResult.data as Book;
        const [workResult, volumeResult, privateUrl, indexVolumes, neighborsResult] = await Promise.all([
          current.series_id
            ? api
                .from("series")
                .select("id,owner_id,title,description,cover_path,format,created_at,updated_at,tags,rights_note,beta_visible")
                .eq("id", current.series_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          current.volume_id
            ? api
                .from("volumes")
                .select("id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at")
                .eq("id", current.volume_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          createPrivateMediaUrl(BUCKET, current.file_path),
          current.series_id
            ? api.from("volumes").select("id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at").eq("series_id", current.series_id).order("sort_order").order("volume_number")
            : Promise.resolve({ data: [] as Volume[], error: null }),
          api.rpc("reader_navigation_neighbors", { target_book_id: id }).maybeSingle().returns<{ previous_id: string | null; next_id: string | null }>(),
        ]);
        if (neighborsResult.error) throw neighborsResult.error;
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const openDocument = (url: string) => pdfjs.getDocument({
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
          activePrivateUrl = await createPrivateMediaUrl(BUCKET, current.file_path);
          task = openDocument(activePrivateUrl.url);
          loaded = await task.promise;
        }
        if (cancelled) return;
        const refreshIn = Math.max(0, activePrivateUrl.expiresAt - Date.now() - PRIVATE_MEDIA_URL_REFRESH_MARGIN_MS);
        refreshTimer = setTimeout(() => {
          void saveRef.current().finally(() => {
            if (!cancelled) {
              setLoading(true);
              setUrlGeneration((generation) => generation + 1);
            }
          });
        }, refreshIn);
        const saved = progressResult.data as ReadingProgress | null;
        const start = Math.min(
          loaded.numPages,
          Math.max(1, saved?.page_number ?? 1),
        );
        setBook(current);
        setSeries(workResult.data as Series | null);
        setVolume(volumeResult.data as Volume | null);
        setPdf(loaded);
        setPages(loaded.numPages);
        setCurrentPage(start);
        pageRef.current = start;
        restoringRef.current = saved
          ? {
              page: start,
              line: saved.line_index || 0,
              ratio: saved.scroll_ratio || 0,
            }
          : null;
        setMode(saved?.reading_mode || "text");
        modeRef.current = saved?.reading_mode || "text";
        setActivePages(
          new Set([
            Math.max(1, start - 1),
            start,
            Math.min(loaded.numPages, start + 1),
          ]),
        );
        setLibraryVolumes((indexVolumes.data || []) as Volume[]);
        setLibraryBooks([]);
        setLibraryProgress({});
        setLibraryHasMore(true);
        setPreviousId(neighborsResult.data?.previous_id || null);
        setNextId(neighborsResult.data?.next_id || null);
        // Catalog metadata is written only by administrators.
        try {
          const prefs = localStorage.getItem("nook-reader-prefs");
          if (prefs) {
            const value = JSON.parse(prefs) as {
              fontSize?: number;
              lineHeight?: number;
              textWidth?: number;
              theme?: Theme;
              showIllustrations?: boolean;
            };
            if (value.fontSize) setFontSize(value.fontSize);
            if (value.lineHeight) setLineHeight(value.lineHeight);
            if (value.textWidth)
              setTextWidth(
                value.textWidth <= 730
                  ? 700
                  : value.textWidth <= 790
                    ? 760
                    : 820,
              );
            if (value.theme) setTheme(value.theme);
            if (typeof value.showIllustrations === "boolean")
              setShowIllustrations(value.showIllustrations);
          } else if (window.matchMedia("(max-width: 620px)").matches)
            setFontSize(19);
        } catch {
          /* Preferences are optional. */
        }
        const profile = await api
          .from("profiles")
          .select("preferences")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const preferences = profile.data?.preferences;
        if (preferences) {
          if (Number.isFinite(preferences.lineHeight))
            setLineHeight(Math.min(2.5, Math.max(1.3, preferences.lineHeight)));
          if (Number.isFinite(preferences.textWidth))
            setTextWidth(Math.min(900, Math.max(500, preferences.textWidth)));
          if (typeof preferences.showIllustrations === "boolean")
            setShowIllustrations(preferences.showIllustrations);
          if (["dark", "sepia", "light"].includes(preferences.theme))
            setTheme(preferences.theme);
          if (Number.isFinite(preferences.fontSize))
            setFontSize(Math.min(32, Math.max(16, preferences.fontSize)));
          setFontFamily(preferences.fontFamily === "sans" ? "sans" : "serif");
        }
        readyRef.current = true;
        setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Falha ao abrir PDF.",
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
      if (task) void task.destroy();
    };
  }, [id, user.id, pages, urlGeneration]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !pages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) =>
            Number((entry.target as HTMLElement).dataset.pageSegment),
          );
        if (!visible.length) return;
        const selected = visible.reduce((best, value) => {
          const bestEl = root.querySelector<HTMLElement>(
            `[data-page-segment="${best}"]`,
          );
          const el = root.querySelector<HTMLElement>(
            `[data-page-segment="${value}"]`,
          );
          return Math.abs(
            (el?.getBoundingClientRect().top || 0) -
              root.getBoundingClientRect().top,
          ) <
            Math.abs(
              (bestEl?.getBoundingClientRect().top || 0) -
                root.getBoundingClientRect().top,
            )
            ? value
            : best;
        }, visible[0]);
        pageRef.current = selected;
        setCurrentPage(selected);
        const near = new Set<number>();
        for (const n of visible)
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
    for (let page = Math.max(1, currentPage - 10); page <= Math.min(pages, currentPage + 10); page++)
      retained.add(page);
    retainedPagesRef.current = retained;
    const prune = <T,>(previous: Record<number, T>) => {
      const entries = Object.entries(previous).filter(([page]) => retained.has(Number(page)));
      return entries.length === Object.keys(previous).length
        ? previous
        : Object.fromEntries(entries) as Record<number, T>;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTextByPage(prune);
    setIllustrationsByPage(prune);
    setIllustrationStatus(prune);
    setLoadingPages((previous) => new Set([...previous].filter((page) => retained.has(page))));
    for (const page of Object.keys(illustrationStatus).map(Number))
      if (!retained.has(page)) illustrationExtractor?.release(page);
  }, [activePages, currentPage, illustrationExtractor, illustrationStatus, pages]);

  const loadPageText = useCallback(
    async (pageNo: number) => {
      if (
        !pdf ||
        loadingRef.current.has(pageNo) ||
        textByPage[pageNo] !== undefined
      )
        return;
      loadingRef.current.add(pageNo);
      setLoadingPages((previous) => new Set(previous).add(pageNo));
      try {
        const pdfPage = await pdf.getPage(pageNo);
        const content = await pdfPage.getTextContent();
        const blocks = extractReadingBlocks(content.items, pdfPage.view);
        if (retainedPagesRef.current.has(pageNo))
          setTextByPage((previous) => ({ ...previous, [pageNo]: blocks }));
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Falha ao extrair texto.",
        );
      } finally {
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
          if (images.length && retainedPagesRef.current.has(pageNo))
            setIllustrationsByPage((previous) => ({
              ...previous,
              [pageNo]: images,
            }));
        })
        .finally(() => {
          if (retainedPagesRef.current.has(pageNo))
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
    requestAnimationFrame(() => {
      const target = segment.querySelector<HTMLElement>(
        `[data-line="${saved.line}"]`,
      );
      if (target)
        root.scrollTop +=
          target.getBoundingClientRect().top -
          root.getBoundingClientRect().top -
          32;
      else if (saved.ratio)
        root.scrollTop =
          saved.ratio * Math.max(0, root.scrollHeight - root.clientHeight);
      else root.scrollTop = segment.offsetTop;
      restoringRef.current = null;
    });
  }, [pages, textByPage, mode, restoreTick]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void save();
    };
    const onPageHide = () => void save();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void save();
    };
  }, [save]);

  const toggleFocusMode = useCallback(() => {
    focusEnteredAt.current = focusMode ? 0 : performance.now();
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = null;
    setFocusControlsVisible(false);
    setFocusMode(!focusMode);
  }, [focusMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      if (event.key === "Escape") {
        focusEnteredAt.current = 0;
        if (focusTimer.current) clearTimeout(focusTimer.current);
        focusTimer.current = null;
        setFocusMode(false);
        setFocusControlsVisible(false);
        setIndexOpen(false);
        setBookmarksOpen(false);
        return;
      }
      if (
        event.key.toLowerCase() === "f" &&
        !indexOpen &&
        !bookmarksOpen &&
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
  }, [indexOpen, bookmarksOpen, toggleFocusMode]);

  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  function revealFocusControls() {
    if (!focusMode || performance.now() - focusEnteredAt.current < 900) return;
    setFocusControlsVisible(true);
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocusControlsVisible(false), 2800);
  }

  function onScroll() {
    if (restoringRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 900);
  }
  function updatePrefs(
    change: Partial<{
      fontSize: number;
      lineHeight: number;
      textWidth: number;
      theme: Theme;
      showIllustrations: boolean;
    }>,
  ) {
    const next = {
      fontFamily,
      fontSize,
      lineHeight,
      textWidth,
      theme,
      showIllustrations,
      ...change,
    };
    if (change.fontSize) setFontSize(change.fontSize);
    if (change.lineHeight) setLineHeight(change.lineHeight);
    if (change.textWidth) setTextWidth(change.textWidth);
    if (change.theme) setTheme(change.theme);
    if (change.showIllustrations !== undefined)
      setShowIllustrations(change.showIllustrations);
    try {
      localStorage.setItem("nook-reader-prefs", JSON.stringify(next));
    } catch {
      /* Storage is optional. */
    }
    void supabase()
      .from("profiles")
      .update({ preferences: next })
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) setSaveState("Preferências salvas apenas neste navegador");
      });
  }
  function setView(next: Mode) {
    modeRef.current = next;
    setMode(next);
    setSettingsOpen(false);
    void save();
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
      scroll_ratio: root
        ? Math.min(
            1,
            Math.max(
              0,
              root.scrollTop /
                Math.max(1, root.scrollHeight - root.clientHeight),
            ),
          )
        : 0,
    };
  }

  function jumpToBookmark(bookmark: ReadingBookmark) {
    const targetPage = Math.max(1, Math.min(pages, bookmark.page_number));
    restoringRef.current = {
      page: targetPage,
      line: bookmark.line_index,
      ratio: bookmark.scroll_ratio,
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

  if (loading)
    return (
      <>
        <Nav back />
        <main className="reader-status">Abrindo sua leitura…</main>
      </>
    );
  if (error && !book)
    return (
      <>
        <Nav back />
        <main className="reader-status">
          <BookOpen size={34} />
          <h1>Não foi possível abrir</h1>
          <p>{error}</p>
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
      onMouseMove={revealFocusControls}
      onTouchStart={revealFocusControls}
    >
      <header className="reader-topbar">
        <button
          className="reader-back"
          aria-label="Voltar à biblioteca"
          onClick={() => {
            void save().finally(() => router.push(series ? `/series/${series.id}` : "/"));
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
      <div className="reader-toolbar">
        <div className="mode-toggle" role="group" aria-label="Modo de leitura">
          <button
            className={mode === "text" ? "selected" : ""}
            aria-pressed={mode === "text"}
            title="Leitura limpa, apenas texto"
            onClick={() => setView("text")}
          >
            <Type size={15} /> Texto
          </button>
          <button
            className={mode === "page" ? "selected" : ""}
            aria-pressed={mode === "page"}
            title="Visualização fiel às páginas do PDF"
            onClick={() => setView("page")}
          >
            <BookOpen size={15} /> PDF
          </button>
        </div>
        <div className="reader-quick-nav">
          <Link
            href={previousId ? `/read/${previousId}` : "#"}
            aria-disabled={!previousId}
            onClick={(event) => {
              if (!previousId) event.preventDefault();
            }}
            aria-label="Capítulo anterior"
          >
            <ChevronLeft size={18} />
          </Link>
          <button aria-label="Abrir índice" onClick={() => setIndexOpen(true)}>
            <List size={16} />
            <span>Índice</span>
          </button>
          <Link
            href={nextId ? `/read/${nextId}` : "#"}
            aria-disabled={!nextId}
            onClick={(event) => {
              if (!nextId) event.preventDefault();
            }}
            aria-label="Próximo capítulo"
          >
            <ChevronRight size={18} />
          </Link>
        </div>
        <div className="reader-toolbar-end">
          <span className="reader-page-count">
            p. {currentPage} / {pages}
          </span>
          <button
            className="reader-settings-button"
            aria-label="Marcadores"
            title="Marcadores"
            onClick={() => setBookmarksOpen(true)}
          >
            <Bookmark size={16} />
          </button>
          <button
            className="reader-settings-button"
            aria-label={focusMode ? "Sair do modo foco" : "Ativar modo foco"}
            aria-pressed={focusMode}
            title="Modo foco (F)"
            onClick={toggleFocusMode}
          >
            <Maximize2 size={16} />
          </button>
          <button
            className={`reader-settings-button ${settingsOpen ? "active" : ""}`}
            aria-label="Ajustes de leitura"
            aria-expanded={settingsOpen}
            aria-controls="reader-settings"
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <Settings2 size={17} />
            <span>Ajustes</span>
          </button>
        </div>
        {settingsOpen && (
          <div className="reader-settings" id="reader-settings">
            <div className="reader-settings-title">Ajustes de leitura</div>
            <div className="reader-controls">
              <div className="font-tools">
                <span>Fonte</span>
                <div>
                  <button
                    aria-label="Diminuir fonte"
                    onClick={() =>
                      updatePrefs({ fontSize: Math.max(15, fontSize - 1) })
                    }
                  >
                    <Minus size={15} />
                  </button>
                  <span>{fontSize}px</span>
                  <button
                    aria-label="Aumentar fonte"
                    onClick={() =>
                      updatePrefs({ fontSize: Math.min(30, fontSize + 1) })
                    }
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
              <label className="reader-select">
                Linha
                <select
                  aria-label="Altura da linha"
                  value={lineHeight}
                  onChange={(e) =>
                    updatePrefs({ lineHeight: Number(e.target.value) })
                  }
                >
                  <option value={1.65}>Compacta</option>
                  <option value={1.85}>Confortável</option>
                  <option value={2.05}>Ampla</option>
                </select>
              </label>
              <label className="reader-select">
                Largura
                <select
                  aria-label="Largura do texto"
                  value={textWidth}
                  onChange={(e) =>
                    updatePrefs({ textWidth: Number(e.target.value) })
                  }
                >
                  <option value={700}>Estreita</option>
                  <option value={760}>Padrão</option>
                  <option value={820}>Ampla</option>
                </select>
              </label>
              <label className="reader-select">
                Tema
                <select
                  aria-label="Tema do leitor"
                  value={theme}
                  onChange={(e) =>
                    updatePrefs({ theme: e.target.value as Theme })
                  }
                >
                  <option value="dark">Escuro</option>
                  <option value="sepia">Sépia</option>
                  <option value="light">Claro</option>
                </select>
              </label>
              <label className="reader-select">
                Ilustrações
                <select
                  aria-label="Ilustrações no modo texto"
                  value={showIllustrations ? "show" : "hide"}
                  onChange={(e) =>
                    updatePrefs({
                      showIllustrations: e.target.value === "show",
                    })
                  }
                >
                  <option value="show">Mostrar</option>
                  <option value="hide">Ocultar</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
      <div className="reader-scroll" ref={scrollRef} onScroll={onScroll}>
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
              style={mode === "text" && textByPage[pageNo] === undefined && pageHeights[pageNo]
                ? { minHeight: `${pageHeights[pageNo]}px` }
                : undefined}
            >
              {mode === "text" ? (
                textByPage[pageNo] !== undefined ? (
                  textByPage[pageNo].length ||
                  (showIllustrations && illustrationsByPage[pageNo]?.length) ? (
                    <article className="reflow-text">
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
                      <button onClick={() => setView("page")}>
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
                />
              )}
            </section>
          ))}
          {error && <div className="error">{error}</div>}
          <div className="chapter-navigation">
            <span>Fim do capítulo</span>
            <div>
              {previousId ? (
                <Link href={`/read/${previousId}`} onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  void save().finally(() => router.push(`/read/${previousId}`));
                }}>
                  <ChevronLeft size={17} /> Capítulo anterior
                </Link>
              ) : (
                <span />
              )}
              <button onClick={() => setIndexOpen(true)}>Índice</button>
              {nextId ? (
                <Link href={`/read/${nextId}`} onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  void save().finally(() => router.push(`/read/${nextId}`));
                }}>
                  Próximo capítulo <ChevronRight size={17} />
                </Link>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      </div>
      {indexOpen && (
        <ReaderIndex
          series={series}
          volumes={libraryVolumes}
          books={libraryBooks}
          progress={libraryProgress}
          currentId={id}
          onClose={() => setIndexOpen(false)}
          onNavigate={(bookId) => void save().finally(() => router.push(`/read/${bookId}`))}
          onLoadMore={() => void loadLibraryPage()}
          hasMore={libraryHasMore}
          loading={libraryLoading}
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
