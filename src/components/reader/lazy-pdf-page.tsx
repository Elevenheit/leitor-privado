"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export function LazyPdfPage({
  pdf,
  page,
  active,
  onReady,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  active: boolean;
  onReady?: (page: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active || !width || !canvasRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    const canvas = canvasRef.current;
    canvas.dataset.ready = "false";
    async function render() {
      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        if (hostRef.current)
          hostRef.current.style.aspectRatio = `${base.width} / ${base.height}`;
        const cssWidth = Math.min(width, 940);
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(
            8_000_000 / ((cssWidth * cssWidth * base.height) / base.width),
          ),
        );
        const viewport = pdfPage.getViewport({
          scale: (Math.min(width, 940) / base.width) * ratio,
        });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        task = pdfPage.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        await task.promise;
        if (!cancelled) {
          canvas.dataset.ready = "true";
          setError(false);
          onReady?.(page);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }
    void render();
    return () => {
      cancelled = true;
      task?.cancel();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [pdf, page, active, width, attempt, onReady]);
  return (
    <div className="pdf-page" ref={hostRef}>
      {error && active && (
        <p role="alert">
          Não foi possível renderizar a página {page}.{" "}
          <button onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {active ? (
        <canvas ref={canvasRef} aria-label={`Página ${page} do PDF`} />
      ) : (
        <div className="pdf-placeholder" />
      )}
    </div>
  );
}
