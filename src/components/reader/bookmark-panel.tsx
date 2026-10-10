"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Pencil, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  renameBookmark,
} from "@/lib/data/bookmarks";
import { toDataError } from "@/lib/data/errors";
import type { ReadingBookmark } from "@/lib/types";

type Position = Pick<
  ReadingBookmark,
  "page_number" | "line_index" | "scroll_ratio" | "page_offset" | "text_offset"
>;

export function BookmarkPanel({
  bookId,
  ownerId,
  position,
  onJump,
  onClose,
}: {
  bookId: string;
  ownerId: string;
  position: () => Position;
  onJump: (bookmark: ReadingBookmark) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ReadingBookmark[]>([]);
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReadingBookmark | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await listBookmarks(ownerId, bookId));
      setError("");
    } catch (cause) {
      setError(
        toDataError(cause, "Não foi possível carregar os marcadores.").message,
      );
    } finally {
      setLoading(false);
    }
  }, [bookId, ownerId]);

  // Fetch this chapter's markers only when the panel opens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      await createBookmark(ownerId, bookId, position(), label.trim() || null);
      setLabel("");
      await load();
    } catch (cause) {
      setError(
        toDataError(cause, "Não foi possível salvar o marcador.").message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function rename(item: ReadingBookmark) {
    setBusy(true);
    setError("");
    try {
      await renameBookmark(ownerId, bookId, item.id, label.trim() || null);
      setEditing(null);
      setLabel("");
      await load();
    } catch (cause) {
      setError(
        toDataError(cause, "Não foi possível renomear o marcador.").message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ReadingBookmark) {
    setBusy(true);
    setError("");
    try {
      await deleteBookmark(ownerId, bookId, item.id);
      setDeleteTarget(null);
      await load();
    } catch (cause) {
      setError(
        toDataError(cause, "Não foi possível excluir o marcador.").message,
      );
    } finally {
      setBusy(false);
    }
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
        className="reader-index bookmark-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Marcadores deste capítulo"
      >
        <header>
          <div>
            <small>Leitura</small>
            <strong>Marcadores deste capítulo</strong>
          </div>
          <button aria-label="Fechar marcadores" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="reader-index-list">
          <div className="bookmark-create">
            <label>
              Nome opcional
              <input
                value={editing ? "" : label}
                onChange={(event) => setLabel(event.target.value)}
                disabled={Boolean(editing) || busy}
                maxLength={120}
                placeholder="Ex.: Antes da batalha"
              />
            </label>
            <button
              className="secondary-button"
              onClick={() => void create()}
              disabled={busy || Boolean(editing)}
            >
              <Bookmark size={15} /> Salvar posição atual
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p>Carregando marcadores…</p>
          ) : items.length ? (
            <ol className="bookmark-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    className="bookmark-jump"
                    onClick={() => onJump(item)}
                  >
                    <strong>
                      {item.label || `Página ${item.page_number}`}
                    </strong>
                    <small>
                      p. {item.page_number} ·{" "}
                      {Math.round(item.scroll_ratio * 100)}%
                    </small>
                  </button>
                  <button
                    aria-label={`Renomear ${item.label || "marcador"}`}
                    onClick={() => {
                      setEditing(item.id);
                      setLabel(item.label || "");
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label={`Excluir ${item.label || "marcador"}`}
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 size={15} />
                  </button>
                  {editing === item.id && (
                    <div className="bookmark-edit">
                      <input
                        aria-label="Novo nome do marcador"
                        autoFocus
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        maxLength={120}
                      />
                      <button onClick={() => void rename(item)} disabled={busy}>
                        Salvar
                      </button>
                      <button
                        onClick={() => {
                          setEditing(null);
                          setLabel("");
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="bookmark-empty">Nenhum marcador neste capítulo.</p>
          )}
        </div>
      </aside>
      {deleteTarget && (
        <ConfirmDialog
          title="Excluir marcador?"
          message={`O marcador “${deleteTarget.label || `Página ${deleteTarget.page_number}`}” será removido.`}
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void remove(deleteTarget)}
        />
      )}
    </div>
  );
}
