"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Columns2, Maximize2, Minus, Plus, Type } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { User } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { BUCKET, supabase } from "@/lib/supabase";
import type { Book, ReadingProgress } from "@/lib/types";

type Mode = "text" | "page";

export default function ReadPage() {
  const params = useParams<{ id: string }>();
  return <AuthGate>{user => <Reader key={params.id} user={user} id={params.id} />}</AuthGate>;
}

function Reader({ user, id }: { user: User; id: string }) {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [mode, setMode] = useState<Mode>("text");
  const [fontSize, setFontSize] = useState(19);
  const [lines, setLines] = useState<string[]>([]);
  const [isScanned, setIsScanned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("Salvo na nuvem");
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageCanvasRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef(1);
  const modeRef = useRef<Mode>("text");
  const progressReady = useRef(false);
  const initialPosition = useRef<{ page: number; line: number; ratio: number } | null>(null);

  const save = useCallback(async () => {
    if (!progressReady.current || initialPosition.current) return;
    const container = scrollRef.current;
    const ratio = container ? Math.min(1, Math.max(0, container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight))) : 0;
    let lineIndex = 0;
    if (modeRef.current === "text" && container) {
      const lineEls = container.querySelectorAll<HTMLElement>("[data-line]");
      const top = container.getBoundingClientRect().top + 24;
      for (const el of lineEls) {
        if (el.getBoundingClientRect().bottom >= top) { lineIndex = Number(el.dataset.line); break; }
      }
    }
    setSaveState("Salvando…");
    const { error } = await supabase().from("reading_progress").upsert({
      book_id: id, owner_id: user.id, page_number: pageRef.current,
      line_index: lineIndex, scroll_ratio: ratio, reading_mode: modeRef.current,
      updated_at: new Date().toISOString(),
    }, { onConflict: "book_id" });
    setSaveState(error ? "Falha ao salvar" : "Salvo na nuvem");
  }, [id, user.id]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    async function init() {
      try {
        const api = supabase();
        const { data: bookData, error: bookError } = await api.from("books").select("*").eq("id", id).eq("owner_id", user.id).single();
        if (bookError || !bookData) throw new Error("Livro não encontrado ou sem acesso.");
        const { data: progressData } = await api.from("reading_progress").select("*").eq("book_id", id).maybeSingle();
        const saved = progressData as ReadingProgress | null;
        const { data: blob, error: downloadError } = await api.storage.from(BUCKET).download(bookData.file_path);
        if (downloadError || !blob) throw new Error(downloadError?.message || "Não foi possível baixar o PDF.");
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const loadedPdf = await loadingTask.promise;
        if (cancelled) return;
        setBook(bookData as Book);
        setPdf(loadedPdf);
        setPages(loadedPdf.numPages);
        const startPage = Math.min(loadedPdf.numPages, Math.max(1, saved?.page_number || 1));
        initialPosition.current = saved ? { page: startPage, line: saved.line_index || 0, ratio: saved.scroll_ratio || 0 } : null;
        pageRef.current = startPage;
        modeRef.current = saved?.reading_mode || "text";
        setPage(startPage);
        setMode(modeRef.current);
        progressReady.current = true;
        setLoading(false);
        if (bookData.total_pages !== loadedPdf.numPages) void api.from("books").update({ total_pages: loadedPdf.numPages }).eq("id", id);
      } catch (cause) {
        if (!cancelled) { setError(cause instanceof Error ? cause.message : "Falha ao abrir PDF."); setLoading(false); }
      }
    }
    void init();
    return () => { cancelled = true; progressReady.current = false; if (loadingTask) void loadingTask.destroy(); };
  }, [id, user.id]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    // Loading state must follow the current PDF page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageLoading(true);
    setLines([]);
    async function loadPage() {
      try {
        const pdfPage = await pdf!.getPage(page);
        const content = await pdfPage.getTextContent();
        const extracted: string[] = [];
        let current = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const fragment = item.str.trim();
          if (fragment) current += (current && !/\s$/.test(current) ? " " : "") + fragment;
          if (item.hasEOL) { if (current.trim()) extracted.push(current.trim()); current = ""; }
        }
        if (current.trim()) extracted.push(current.trim());
        if (!cancelled) { setLines(extracted); setIsScanned(extracted.length === 0); setPageLoading(false); }
      } catch (cause) {
        if (!cancelled) { setError(cause instanceof Error ? cause.message : "Falha ao carregar página."); setPageLoading(false); }
      }
    }
    void loadPage();
    return () => { cancelled = true; };
  }, [pdf, page]);

  useEffect(() => {
    if (!pdf || (mode !== "page" && !isScanned) || pageLoading || !canvasRef.current || !pageCanvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    async function render() {
      const pdfPage = await pdf!.getPage(page);
      if (cancelled || !canvasRef.current || !pageCanvasRef.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const width = Math.min(pageCanvasRef.current.clientWidth, 940);
      const scale = width / base.width;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: scale * pixelRatio });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / pixelRatio}px`;
      canvas.style.height = `${viewport.height / pixelRatio}px`;
      renderTask = pdfPage.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport });
      try { await renderTask.promise; } catch { /* Cancelled during page change. */ }
    }
    void render();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pdf, page, mode, isScanned, pageLoading]);

  useEffect(() => {
    if (pageLoading || !scrollRef.current) return;
    const container = scrollRef.current;
    const saved = initialPosition.current;
    requestAnimationFrame(() => {
      if (saved?.page === page) {
        const target = mode === "text" ? container.querySelector<HTMLElement>(`[data-line="${saved.line}"]`) : null;
        if (target) container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - 24;
        else container.scrollTop = saved.ratio * Math.max(0, container.scrollHeight - container.clientHeight);
        initialPosition.current = null;
      } else container.scrollTop = 0;
    });
  }, [page, pageLoading, mode]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") void save(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [save]);

  function onScroll() {
    if (pageLoading || initialPosition.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 650);
  }
  function goToPage(next: number) {
    if (next < 1 || next > pages || next === page) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pageRef.current = next;
    setPage(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    void save();
  }
  function changeMode(next: Mode) {
    if (next === mode) return;
    modeRef.current = next;
    setMode(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    void save();
  }

  if (loading) return <><Nav back /><main className="reader-status">Abrindo sua leitura…</main></>;
  if (error && !book) return <><Nav back /><main className="reader-status"><BookOpen size={34}/><h1>Não foi possível abrir</h1><p>{error}</p><Link href="/" className="primary-button">Voltar à biblioteca</Link></main></>;

  return <div className="reader-app"><Nav back /><header className="reader-topbar"><button className="reader-back" onClick={() => router.push("/")}><ArrowLeft size={18}/><span>Biblioteca</span></button><div className="reader-heading"><strong>{book?.title}</strong><span>Página {page} de {pages}</span></div><span className="save-state">{saveState}</span></header>
    <div className="reader-toolbar"><div className="mode-toggle"><button className={mode === "text" ? "selected" : ""} onClick={() => changeMode("text")}><Type size={16}/> Texto</button><button className={mode === "page" ? "selected" : ""} onClick={() => changeMode("page")}><Columns2 size={16}/> Página</button></div><div className="font-tools"><button aria-label="Diminuir fonte" onClick={() => setFontSize(Math.max(14, fontSize - 1))}><Minus size={16}/></button><span>Aa</span><button aria-label="Aumentar fonte" onClick={() => setFontSize(Math.min(30, fontSize + 1))}><Plus size={16}/></button></div></div>
    <div className="reader-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="reader-content"><div className="chapter-marker"><span>✦</span><small>PÁGINA {String(page).padStart(2, "0")}</small><span>✦</span></div>
        {pageLoading ? <div className="reader-loading">Preparando página…</div> : mode === "text" && !isScanned ? <article className="reflow-text" style={{fontSize}}>{lines.map((line, index) => <p data-line={index} key={index}>{line}</p>)}</article> : <div className="pdf-page" ref={pageCanvasRef}><canvas ref={canvasRef} aria-label={`Página ${page} do PDF`} />{isScanned && mode === "text" && <div className="scan-note"><Maximize2 size={16}/> Esta página não contém texto selecionável. Exibindo a página original.</div>}</div>}
        {error && <div className="error">{error}</div>}
        <div className="page-end">✦</div>
      </div>
    </div>
    <footer className="reader-footer"><button onClick={() => goToPage(page - 1)} disabled={page <= 1}><ChevronLeft size={19}/> <span>Anterior</span></button><div className="page-jump"><span>{page}</span><span className="muted">/ {pages}</span><input type="range" aria-label="Ir para página" min={1} max={Math.max(1, pages)} value={page} onChange={e => goToPage(Number(e.target.value))} /></div><button onClick={() => goToPage(page + 1)} disabled={page >= pages}><span>Próxima</span> <ChevronRight size={19}/></button></footer>
  </div>;
}
