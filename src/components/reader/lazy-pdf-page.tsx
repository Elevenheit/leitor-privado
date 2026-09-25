"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export function LazyPdfPage({
  pdf,
  page,
  active,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  active: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active || !hostRef.current || !canvasRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    async function render() {
      const pdfPage = await pdf.getPage(page);
      if (cancelled || !hostRef.current || !canvasRef.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(hostRef.current.clientWidth, 940) / base.width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: scale * ratio });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      task = pdfPage.render({
        canvas,
        canvasContext: canvas.getContext("2d")!,
        viewport,
      });
      try {
        await task.promise;
      } catch {
        /* Canvas is discarded when outside the lazy window. */
      }
    }
    void render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, active]);
  return (
    <div className="pdf-page" ref={hostRef}>
      {active ? (
        <canvas ref={canvasRef} aria-label={`Página ${page} do PDF`} />
      ) : (
        <div className="pdf-placeholder" />
      )}
    </div>
  );
}
