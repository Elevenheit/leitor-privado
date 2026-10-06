"use client";

import {
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
import Link from "next/link";
import { READER_FONT_MIN, READER_FONT_MAX } from "@/lib/reader-preferences";

type Theme = "dark" | "sepia" | "light";
type Mode = "text" | "page";
type Preferences = Partial<{
  fontSize: number;
  lineHeight: number;
  textWidth: number;
  theme: Theme;
  showIllustrations: boolean;
}>;

type Props = {
  mode: Mode;
  setView: (mode: Mode) => void;
  previousId: string | null;
  nextId: string | null;
  setIndexOpen: (open: boolean) => void;
  currentPage: number;
  pages: number;
  setBookmarksOpen: (open: boolean) => void;
  focusMode: boolean;
  toggleFocusMode: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean | ((previous: boolean) => boolean)) => void;
  fontSize: number;
  lineHeight: number;
  textWidth: number;
  theme: Theme;
  showIllustrations: boolean;
  updatePrefs: (change: Preferences) => void;
  onNavigate?: (bookId: string) => void;
};

export function ReaderToolbar(props: Props) {
  const {
    mode,
    setView,
    previousId,
    nextId,
    setIndexOpen,
    currentPage,
    pages,
    setBookmarksOpen,
    focusMode,
    toggleFocusMode,
    settingsOpen,
    setSettingsOpen,
    fontSize,
    lineHeight,
    textWidth,
    theme,
    showIllustrations,
    updatePrefs,
  } = props;
  return (
    <div
      className="reader-toolbar"
      onKeyDown={(event) => {
        if (settingsOpen && event.key === "Escape") {
          event.stopPropagation();
          setSettingsOpen(false);
          event.currentTarget
            .querySelector<HTMLButtonElement>(
              '[aria-controls="reader-settings"]',
            )
            ?.focus();
        }
      }}
    >
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
          tabIndex={previousId ? undefined : -1}
          onClick={(event) => {
            if (!previousId) event.preventDefault();
            else if (
              props.onNavigate &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              props.onNavigate(previousId);
            }
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
          tabIndex={nextId ? undefined : -1}
          onClick={(event) => {
            if (!nextId) event.preventDefault();
            else if (
              props.onNavigate &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              props.onNavigate(nextId);
            }
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
                  disabled={fontSize <= READER_FONT_MIN}
                  onClick={() =>
                    updatePrefs({
                      fontSize: Math.max(READER_FONT_MIN, fontSize - 1),
                    })
                  }
                >
                  <Minus size={15} />
                </button>
                <span>{fontSize}px</span>
                <button
                  aria-label="Aumentar fonte"
                  disabled={fontSize >= READER_FONT_MAX}
                  onClick={() =>
                    updatePrefs({
                      fontSize: Math.min(READER_FONT_MAX, fontSize + 1),
                    })
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
  );
}
