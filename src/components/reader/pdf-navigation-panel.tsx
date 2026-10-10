"use client";
import { useState } from "react";
import { X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  usePdfNavigation,
  type PdfSearchResult,
} from "@/hooks/use-pdf-navigation";

export function PdfNavigationPanel({
  pdf,
  currentPage,
  query,
  setQuery,
  onJump,
  onClose,
}: {
  pdf: PDFDocumentProxy;
  currentPage: number;
  query: string;
  setQuery: (query: string) => void;
  onJump: (page: number, result?: PdfSearchResult) => void;
  onClose: () => void;
}) {
  const navigation = usePdfNavigation(pdf, true, query);
  const [page, setPage] = useState(String(currentPage));
  const [selected, setSelected] = useState(0);
  function select(index: number) {
    const result = navigation.results[index];
    if (!result) return;
    setSelected(index);
    onJump(result.page, result);
  }
  return (
    <div
      className="reader-index-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="reader-index pdf-navigation-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Navegar no PDF"
      >
        <header>
          <div>
            <small>Este documento</small>
            <strong>Sumário e busca</strong>
          </div>
          <button aria-label="Fechar navegação do PDF" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="reader-index-list">
          <form
            className="pdf-page-jump"
            onSubmit={(event) => {
              event.preventDefault();
              const target = Number(page);
              if (
                Number.isInteger(target) &&
                target >= 1 &&
                target <= pdf.numPages
              )
                onJump(target);
            }}
          >
            <label>
              Ir à página
              <input
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={pdf.numPages}
                value={page}
                onChange={(event) => setPage(event.target.value)}
              />
            </label>
            <button className="secondary-button">Ir</button>
            <small>De 1 a {pdf.numPages}</small>
          </form>
          <label className="pdf-search-label">
            Buscar no documento
            <input
              type="search"
              maxLength={200}
              value={query}
              onChange={(event) => {
                setSelected(0);
                setQuery(event.target.value);
              }}
              placeholder="Digite um trecho…"
            />
          </label>
          {query.trim() && (
            <section aria-label="Resultados da busca">
              <p role="status">
                {navigation.searching
                  ? `Pesquisando: ${navigation.searchedPages}/${pdf.numPages} páginas…`
                  : `${navigation.results.length === 200 ? "Até " : ""}${navigation.results.length} resultados`}
              </p>
              {navigation.searchError && (
                <p role="alert">{navigation.searchError}</p>
              )}
              {!navigation.searching &&
                navigation.searchedPages === pdf.numPages &&
                !navigation.textFound && (
                  <p>
                    Este PDF não tem texto pesquisável. Use as páginas originais
                    e os marcadores.
                  </p>
                )}
              <div className="pdf-search-actions">
                <button
                  type="button"
                  disabled={!navigation.results.length || selected <= 0}
                  onClick={() => select(selected - 1)}
                >
                  Resultado anterior
                </button>
                <button
                  type="button"
                  disabled={
                    !navigation.results.length ||
                    selected >= navigation.results.length - 1
                  }
                  onClick={() => select(selected + 1)}
                >
                  Próximo resultado
                </button>
              </div>
              {!!navigation.results.length && (
                <button
                  className="primary-button"
                  onClick={() => {
                    select(selected);
                    onClose();
                  }}
                >
                  Ler trecho selecionado
                </button>
              )}
              <ol>
                {navigation.results.map((result, index) => (
                  <li key={`${result.page}:${result.line}:${result.character}`}>
                    <button
                      className="pdf-result"
                      aria-pressed={selected === index}
                      onClick={() => select(index)}
                    >
                      <strong>Página {result.page}</strong>
                      <span>{result.excerpt}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section aria-label="Sumário do PDF">
            <h2>Sumário do PDF</h2>
            {navigation.outlineState === "loading" && (
              <p role="status">Carregando sumário…</p>
            )}
            {navigation.outlineState === "error" && (
              <p>
                Não foi possível carregar o sumário. Use as páginas ou os
                marcadores.
              </p>
            )}
            {navigation.outlineState === "ready" &&
              !navigation.outline.length && (
                <p>
                  Este PDF não possui sumário interno. Use a busca, as páginas
                  ou os marcadores.
                </p>
              )}
            <ol>
              {navigation.outline.map((entry, index) => (
                <li
                  key={index}
                  style={{
                    paddingInlineStart: `${Math.min(6, entry.depth) * 12}px`,
                  }}
                >
                  <button
                    className="pdf-result"
                    disabled={entry.page === null}
                    onClick={() => {
                      onJump(entry.page!);
                      onClose();
                    }}
                  >
                    <strong>{entry.title}</strong>
                    {entry.page && <small>Página {entry.page}</small>}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </aside>
    </div>
  );
}
