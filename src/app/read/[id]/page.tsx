"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Minus, Plus, Settings2, Type } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { User } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { BUCKET, supabase } from "@/lib/supabase";
import { extractReadingBlocks, type ReadingBlock } from "@/lib/reader-text";
import type { Book, ReadingProgress, Series, Volume } from "@/lib/types";

type Mode = "text" | "page";
type Theme = "dark" | "sepia" | "light";
type Position = { page: number; line: number; ratio: number };

export default function ReadPage() {
  const params = useParams<{ id: string }>();
  return <AuthGate>{user => <Reader key={params.id} user={user} id={params.id}/>}</AuthGate>;
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
  const [fontSize, setFontSize] = useState(22);
  const [lineHeight, setLineHeight] = useState(1.85);
  const [textWidth, setTextWidth] = useState(760);
  const [textByPage, setTextByPage] = useState<Record<number, ReadingBlock[]>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePages, setActivePages] = useState<Set<number>>(new Set([1, 2, 3]));
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("Salvo");
  const [previousId, setPreviousId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef(1);
  const modeRef = useRef<Mode>("text");
  const readyRef = useRef(false);
  const restoringRef = useRef<Position | null>(null);
  const loadingRef = useRef(new Set<number>());

  const orderedPages = useMemo(() => Array.from({ length: pages }, (_, i) => i + 1), [pages]);

  const save = useCallback(async () => {
    if (!readyRef.current || restoringRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    const ratio = Math.min(1, Math.max(0, container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight)));
    const segment = container.querySelector<HTMLElement>(`[data-page-segment="${pageRef.current}"]`);
    const visibleTop = container.getBoundingClientRect().top + 28;
    const lines = segment?.querySelectorAll<HTMLElement>("[data-line]");
    let lineIndex = 0;
    if (lines) for (const line of lines) { if (line.getBoundingClientRect().bottom >= visibleTop) { lineIndex = Number(line.dataset.line); break; } }
    setSaveState("Salvando…");
    const { error: saveError } = await supabase().from("reading_progress").upsert({ book_id: id, owner_id: user.id, page_number: pageRef.current, line_index: lineIndex, scroll_ratio: ratio, reading_mode: modeRef.current, updated_at: new Date().toISOString() }, { onConflict: "book_id" });
    setSaveState(saveError ? "Falha ao salvar" : "Salvo");
  }, [id, user.id]);

  useEffect(() => {
    let cancelled = false; let task: PDFDocumentLoadingTask | null = null;
    async function init() {
      try {
        const api = supabase();
        const [bookResult, progressResult] = await Promise.all([
          api.from("books").select("*").eq("id", id).eq("owner_id", user.id).single(),
          api.from("reading_progress").select("*").eq("book_id", id).maybeSingle(),
        ]);
        if (bookResult.error || !bookResult.data) throw new Error("Capítulo não encontrado ou sem acesso.");
        const current = bookResult.data as Book;
        const [workResult, volumeResult, blobResult] = await Promise.all([
          current.series_id ? api.from("series").select("*").eq("id", current.series_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
          current.volume_id ? api.from("volumes").select("*").eq("id", current.volume_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
          api.storage.from(BUCKET).download(current.file_path),
        ]);
        if (blobResult.error || !blobResult.data) throw new Error(blobResult.error?.message || "Não foi possível baixar o PDF.");
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = pdfjs.getDocument({ data: new Uint8Array(await blobResult.data.arrayBuffer()) });
        const loaded = await task.promise;
        if (cancelled) return;
        const saved = progressResult.data as ReadingProgress | null;
        const start = Math.min(loaded.numPages, Math.max(1, saved?.page_number || 1));
        setBook(current); setSeries(workResult.data as Series | null); setVolume(volumeResult.data as Volume | null); setPdf(loaded); setPages(loaded.numPages); setCurrentPage(start); pageRef.current = start;
        restoringRef.current = saved ? { page: start, line: saved.line_index || 0, ratio: saved.scroll_ratio || 0 } : null;
        setMode(saved?.reading_mode || "text"); modeRef.current = saved?.reading_mode || "text";
        setActivePages(new Set([Math.max(1, start - 1), start, Math.min(loaded.numPages, start + 1)]));
        const [allBooks, allVolumes] = await Promise.all([
          current.series_id ? api.from("books").select("id, series_id, volume_id, chapter_number, sort_order, created_at").eq("owner_id", user.id).eq("series_id", current.series_id) : api.from("books").select("id, series_id, volume_id, chapter_number, sort_order, created_at").eq("owner_id", user.id),
          current.series_id ? api.from("volumes").select("id, series_id, volume_number, sort_order").eq("owner_id", user.id).eq("series_id", current.series_id) : Promise.resolve({ data: [] as Pick<Volume, "id" | "series_id" | "volume_number" | "sort_order">[], error: null }),
        ]);
        if (!cancelled && allBooks.data) {
          const volumeList = (allVolumes.data || []) as Pick<Volume, "id" | "series_id" | "volume_number" | "sort_order">[];
          const bookList = [...allBooks.data] as Pick<Book, "id" | "series_id" | "volume_id" | "chapter_number" | "sort_order" | "created_at">[];
          const volOrder = (value: string | null) => volumeList.find(v => v.id === value)?.sort_order ?? volumeList.find(v => v.id === value)?.volume_number ?? -1;
          bookList.sort((a, b) => Number(volOrder(a.volume_id)) - Number(volOrder(b.volume_id)) || Number(a.chapter_number ?? a.sort_order) - Number(b.chapter_number ?? b.sort_order) || a.created_at.localeCompare(b.created_at));
          const index = bookList.findIndex(item => item.id === id);
          setPreviousId(index > 0 ? bookList[index - 1].id : null); setNextId(index >= 0 && index < bookList.length - 1 ? bookList[index + 1].id : null);
        }
        if (current.total_pages !== loaded.numPages) void api.from("books").update({ total_pages: loaded.numPages }).eq("id", id);
        try { const prefs = localStorage.getItem("nook-reader-prefs"); if (prefs) { const value = JSON.parse(prefs) as { fontSize?: number; lineHeight?: number; textWidth?: number; theme?: Theme }; if (value.fontSize) setFontSize(value.fontSize); if (value.lineHeight) setLineHeight(value.lineHeight); if (value.textWidth) setTextWidth(value.textWidth <= 730 ? 700 : value.textWidth <= 790 ? 760 : 820); if (value.theme) setTheme(value.theme); } } catch { /* Preferences are optional. */ }
        readyRef.current = true; setLoading(false);
      } catch (cause) { if (!cancelled) { setError(cause instanceof Error ? cause.message : "Falha ao abrir PDF."); setLoading(false); } }
    }
    void init();
    return () => { cancelled = true; readyRef.current = false; if (task) void task.destroy(); };
  }, [id, user.id]);

  useEffect(() => {
    const root = scrollRef.current; if (!root || !pages) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).map(entry => Number((entry.target as HTMLElement).dataset.pageSegment));
      if (!visible.length) return;
      const selected = visible.reduce((best, value) => {
        const bestEl = root.querySelector<HTMLElement>(`[data-page-segment="${best}"]`); const el = root.querySelector<HTMLElement>(`[data-page-segment="${value}"]`);
        return Math.abs((el?.getBoundingClientRect().top || 0) - root.getBoundingClientRect().top) < Math.abs((bestEl?.getBoundingClientRect().top || 0) - root.getBoundingClientRect().top) ? value : best;
      }, visible[0]);
      pageRef.current = selected; setCurrentPage(selected);
      const near = new Set<number>(); for (const n of visible) for (let offset = -2; offset <= 2; offset++) if (n + offset >= 1 && n + offset <= pages) near.add(n + offset);
      setActivePages(near);
    }, { root, rootMargin: "900px 0px", threshold: 0.02 });
    root.querySelectorAll("[data-page-segment]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [pages, loading]);

  const loadPageText = useCallback(async (pageNo: number) => {
    if (!pdf || loadingRef.current.has(pageNo) || textByPage[pageNo] !== undefined) return;
    loadingRef.current.add(pageNo); setLoadingPages(previous => new Set(previous).add(pageNo));
    try {
      const pdfPage = await pdf.getPage(pageNo);
      const content = await pdfPage.getTextContent();
      const blocks = extractReadingBlocks(content.items);
      setTextByPage(previous => ({ ...previous, [pageNo]: blocks }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao extrair texto."); }
    finally { loadingRef.current.delete(pageNo); setLoadingPages(previous => { const next = new Set(previous); next.delete(pageNo); return next; }); }
  }, [pdf, textByPage]);

  useEffect(() => {
    if (!pdf || mode !== "text") return;
    // Extract only pages inside the lazy loading window as they enter it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const pageNo of activePages) void loadPageText(pageNo);
  }, [pdf, mode, activePages, loadPageText]);

  useEffect(() => {
    const root = scrollRef.current; const saved = restoringRef.current;
    if (!root || !saved || !pages) return;
    const segment = root.querySelector<HTMLElement>(`[data-page-segment="${saved.page}"]`);
    if (!segment) return;
    if (modeRef.current === "text" && textByPage[saved.page] === undefined) return;
    requestAnimationFrame(() => {
      const target = segment.querySelector<HTMLElement>(`[data-line="${saved.line}"]`);
      if (target) root.scrollTop += target.getBoundingClientRect().top - root.getBoundingClientRect().top - 32;
      else if (saved.ratio) root.scrollTop = saved.ratio * Math.max(0, root.scrollHeight - root.clientHeight);
      else root.scrollTop = segment.offsetTop;
      restoringRef.current = null;
    });
  }, [pages, textByPage, mode]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") void save(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); if (saveTimer.current) clearTimeout(saveTimer.current); void save(); };
  }, [save]);

  function onScroll() {
    if (restoringRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 900);
  }
  function updatePrefs(change: Partial<{ fontSize: number; lineHeight: number; textWidth: number; theme: Theme }>) {
    const next = { fontSize, lineHeight, textWidth, theme, ...change };
    if (change.fontSize) setFontSize(change.fontSize); if (change.lineHeight) setLineHeight(change.lineHeight); if (change.textWidth) setTextWidth(change.textWidth); if (change.theme) setTheme(change.theme);
    localStorage.setItem("nook-reader-prefs", JSON.stringify(next));
  }
  function setView(next: Mode) { modeRef.current = next; setMode(next); setSettingsOpen(false); void save(); }

  if (loading) return <><Nav back/><main className="reader-status">Abrindo sua leitura…</main></>;
  if (error && !book) return <><Nav back/><main className="reader-status"><BookOpen size={34}/><h1>Não foi possível abrir</h1><p>{error}</p><Link href="/" className="primary-button">Voltar à biblioteca</Link></main></>;

  const pageCaption = book?.content_type === "volume" ? `Volume completo${book.chapter_number ? ` ${book.chapter_number}` : ""}${book.chapter_title ? ` · ${book.chapter_title}` : ""}` : book?.chapter_number ? `Capítulo ${book.chapter_number}${book.chapter_title ? ` · ${book.chapter_title}` : ""}` : book?.chapter_title || book?.title;
  return <div className={`reader-app reader-theme-${theme}`}><header className="reader-topbar"><button className="reader-back" aria-label="Voltar à biblioteca" onClick={() => router.push(series ? `/series/${series.id}` : "/")}><ArrowLeft size={18}/><span>Biblioteca</span></button><div className="reader-heading"><strong>{series?.title || book?.title}</strong><span>{volume ? (volume.volume_number ? `Volume ${volume.volume_number}` : volume.title) : ""}{volume ? " · " : ""}{pageCaption}</span></div><span className="save-state" aria-live="polite">{saveState}</span></header>
    <div className="reader-toolbar"><div className="mode-toggle" role="group" aria-label="Modo de leitura"><button className={mode === "text" ? "selected" : ""} aria-pressed={mode === "text"} title="Leitura limpa, apenas texto" onClick={() => setView("text")}><Type size={15}/> Texto</button><button className={mode === "page" ? "selected" : ""} aria-pressed={mode === "page"} title="Visualização fiel às páginas do PDF" onClick={() => setView("page")}><BookOpen size={15}/> PDF</button></div><div className="reader-toolbar-end"><span className="reader-page-count">p. {currentPage} / {pages}</span><button className={`reader-settings-button ${settingsOpen ? "active" : ""}`} aria-label="Ajustes de leitura" aria-expanded={settingsOpen} aria-controls="reader-settings" onClick={() => setSettingsOpen(value => !value)}><Settings2 size={17}/><span>Ajustes</span></button></div>
      {settingsOpen && <div className="reader-settings" id="reader-settings"><div className="reader-settings-title">Ajustes de leitura</div><div className="reader-controls"><div className="font-tools"><span>Fonte</span><div><button aria-label="Diminuir fonte" onClick={() => updatePrefs({ fontSize: Math.max(15, fontSize - 1) })}><Minus size={15}/></button><span>{fontSize}px</span><button aria-label="Aumentar fonte" onClick={() => updatePrefs({ fontSize: Math.min(30, fontSize + 1) })}><Plus size={15}/></button></div></div><label className="reader-select">Linha<select aria-label="Altura da linha" value={lineHeight} onChange={e => updatePrefs({ lineHeight: Number(e.target.value) })}><option value={1.65}>Compacta</option><option value={1.85}>Confortável</option><option value={2.05}>Ampla</option></select></label><label className="reader-select">Largura<select aria-label="Largura do texto" value={textWidth} onChange={e => updatePrefs({ textWidth: Number(e.target.value) })}><option value={700}>Estreita</option><option value={760}>Padrão</option><option value={820}>Ampla</option></select></label><label className="reader-select">Tema<select aria-label="Tema do leitor" value={theme} onChange={e => updatePrefs({ theme: e.target.value as Theme })}><option value="dark">Escuro</option><option value="sepia">Sépia</option><option value="light">Claro</option></select></label></div></div>}</div>
    <div className="reader-scroll" ref={scrollRef} onScroll={onScroll}><div className={`continuous-document ${mode === "text" ? "text-document" : "pdf-document"}`} style={{ "--reader-font-size": `${fontSize}px`, "--reader-line-height": lineHeight, "--reader-width": `${textWidth}px` } as React.CSSProperties}>
      {orderedPages.map(pageNo => <section className={`document-segment ${mode === "text" ? "text-segment" : "pdf-segment"}`} key={pageNo} data-page-segment={pageNo}>
        {mode === "text" ? textByPage[pageNo] !== undefined ? textByPage[pageNo].length ? <article className="reflow-text">{textByPage[pageNo].map((block, index) => block.kind === "heading" ? <h2 data-line={index} key={index}>{block.text}</h2> : <p data-line={index} key={index}>{block.text}</p>)}</article> : <div className="text-only-note">Página {pageNo} sem texto extraível. <button onClick={() => setView("page")}>Ver no PDF</button></div> : <div className="text-placeholder">{loadingPages.has(pageNo) ? "Preparando leitura…" : ""}</div> : <LazyPdfPage pdf={pdf!} page={pageNo} active={activePages.has(pageNo)}/>}
      </section>)}
      {error && <div className="error">{error}</div>}
      <div className="chapter-navigation">{previousId ? <Link href={`/read/${previousId}`}><ChevronLeft size={17}/> Capítulo anterior</Link> : <span/>}{nextId ? <Link href={`/read/${nextId}`}>Próximo capítulo <ChevronRight size={17}/></Link> : <span/>}</div>
    </div></div>
  </div>;
}

function LazyPdfPage({ pdf, page, active }: { pdf: PDFDocumentProxy; page: number; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active || !hostRef.current || !canvasRef.current) return;
    let cancelled = false; let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    async function render() {
      const pdfPage = await pdf.getPage(page); if (cancelled || !hostRef.current || !canvasRef.current) return;
      const base = pdfPage.getViewport({ scale: 1 }); const scale = Math.min(hostRef.current.clientWidth, 940) / base.width; const ratio = Math.min(window.devicePixelRatio || 1, 2); const viewport = pdfPage.getViewport({ scale: scale * ratio }); const canvas = canvasRef.current;
      if (!canvas) return; canvas.width = viewport.width; canvas.height = viewport.height; canvas.style.width = `${viewport.width / ratio}px`; canvas.style.height = `${viewport.height / ratio}px`;
      task = pdfPage.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }); try { await task.promise; } catch { /* Canvas is discarded when outside the lazy window. */ }
    }
    void render(); return () => { cancelled = true; task?.cancel(); };
  }, [pdf, page, active]);
  return <div className="pdf-page" ref={hostRef}>{active ? <canvas ref={canvasRef} aria-label={`Página ${page} do PDF`}/> : <div className="pdf-placeholder"/>}</div>;
}
