"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Search, Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Nav } from "@/components/nav";
import { SeriesPicker, VolumePicker } from "@/components/admin/library-picker";
import type { Book, Series, Volume } from "@/lib/types";
import { listAdminCatalog, updateOwnedBooks } from "@/lib/data/admin";
import { deleteBookAndFile } from "@/lib/data/uploads";
import { toDataError } from "@/lib/data/errors";
import { LibraryBookRow } from "./library-book-row";

type Action = "move" | "type" | "order" | "delete";
const PAGE_SIZE = 50;

export function LibraryManager({ user }: { user: User }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedBooks, setSelectedBooks] = useState<Record<string, Book>>({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [action, setAction] = useState<Action>("move");
  const [targetSeries, setTargetSeries] = useState("");
  const [targetVolume, setTargetVolume] = useState("");
  const [destinationSeries, setDestinationSeries] = useState<Series | null>(
    null,
  );
  const [destinationVolume, setDestinationVolume] = useState<Volume | null>(
    null,
  );
  const [targetType, setTargetType] = useState<"chapter" | "volume">("chapter");
  const [orderStart, setOrderStart] = useState("1000");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const generation = useRef(0);
  const operation = useRef(false);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const data = await listAdminCatalog(user.id, page, query);
      if (request !== generation.current) return;
      setBooks(data.books);
      setSeries(data.series);
      setVolumes(data.volumes);
      setTotalCount(data.totalCount);
    } catch (cause) {
      if (request === generation.current)
        setError(
          toDataError(cause, "Não foi possível carregar o acervo.").message,
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [page, query, user.id]);

  useEffect(() => {
    const requests = generation;
    const timer = setTimeout(() => {
      setError("");
      void load();
    }, 250);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);

  const visible = books;
  const chosen = Object.values(selectedBooks).filter((book) =>
    selected.has(book.id),
  );

  function toggle(book: Book) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(book.id)) next.delete(book.id);
      else next.add(book.id);
      return next;
    });
    setSelectedBooks((previous) => {
      const next = { ...previous };
      if (selected.has(book.id)) delete next[book.id];
      else next[book.id] = book;
      return next;
    });
  }

  function selectVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const book of visible) next.add(book.id);
      return next;
    });
    setSelectedBooks((previous) => ({
      ...previous,
      ...Object.fromEntries(visible.map((book) => [book.id, book])),
    }));
  }

  async function apply() {
    if (!chosen.length || operation.current || action === "delete") return;
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "move") {
        if (
          targetVolume &&
          (destinationVolume?.id !== targetVolume ||
            destinationVolume.series_id !== targetSeries)
        )
          throw new Error("O volume não pertence à obra selecionada.");
        const destination = destinationSeries;
        if (targetSeries && destination?.id !== targetSeries)
          throw new Error("Escolha uma obra válida.");
        if (
          destination &&
          chosen.some((book) =>
            destination.format === "novel"
              ? book.media_type !== "pdf"
              : book.media_type !== "cbz",
          )
        ) {
          setError("Escolha uma obra compatível com os arquivos selecionados.");
          setBusy(false);
          return;
        }
        await updateOwnedBooks(
          user.id,
          chosen.map((book) => book.id),
          { series_id: targetSeries || null, volume_id: targetVolume || null },
        );
        setMessage(
          `${chosen.length} arquivo(s) reorganizados sem mover a leitura.`,
        );
      } else if (action === "type") {
        await updateOwnedBooks(
          user.id,
          chosen.map((book) => book.id),
          { content_type: targetType },
        );
        setMessage(`${chosen.length} tipo(s) atualizados.`);
      } else {
        const start = Number(orderStart);
        if (
          !Number.isInteger(start) ||
          start < 0 ||
          start + (chosen.length - 1) * 1000 > 2147483647
        ) {
          setError(
            "Informe uma ordem inicial inteira e não negativa, até o limite de 2147483647.",
          );
          return;
        }
        const failures: string[] = [];
        for (const [index, book] of chosen.entries()) {
          try {
            await updateOwnedBooks(user.id, [book.id], {
              sort_order: start + index * 1000,
            });
          } catch {
            failures.push(
              `${book.title}: não foi possível confirmar a atualização.`,
            );
          }
        }
        if (failures.length) {
          await load();
          throw new Error(failures.join(" · "));
        } else setMessage(`Ordem ajustada para ${chosen.length} arquivo(s).`);
      }
      await load();
      setSelected(new Set());
      setSelectedBooks({});
      if (page) setPage(0);
    } catch (cause) {
      setError(
        toDataError(
          cause,
          cause instanceof Error
            ? cause.message
            : "Não foi possível aplicar a ação. Tente novamente.",
        ).message,
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const failures: string[] = [];
      for (const book of chosen) {
        try {
          await deleteBookAndFile(user.id, book);
        } catch (cause) {
          failures.push(
            `${book.title}: ${toDataError(cause, "Delete failed.").message}`,
          );
        }
      }
      if (failures.length) setError(failures.join(" | "));
      else setMessage(`${chosen.length} arquivo(s) excluídos.`);
      setDeleteOpen(false);
      setSelected(new Set());
      setSelectedBooks({});
      if (page) setPage(0);
      else await load();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Nav back />
      <main id="main-content" tabIndex={-1} className="manager-page">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> Biblioteca
        </Link>
        <header className="manager-heading">
          <div>
            <span className="eyebrow">Organização do acervo</span>
            <h1>Gerenciar biblioteca</h1>
            <p>Selecione arquivos para alterar a organização, tipo ou ordem.</p>
          </div>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button
              onClick={() => {
                setError("");
                void load();
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}
        {message && (
          <div className="manager-message" role="status">
            <Check size={15} />
            {message}
          </div>
        )}
        <div className="manager-tools">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Buscar arquivos"
              placeholder="Buscar arquivos, capítulos, volumes ou obras…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <span>{totalCount} arquivos</span>
        </div>
        <div className="manager-layout">
          <section className="manager-list">
            <div className="manager-list-head">
              <button
                onClick={selectVisible}
                disabled={!visible.length || loading || busy}
              >
                Selecionar página
              </button>
              <button
                onClick={() => {
                  setSelected(new Set());
                  setSelectedBooks({});
                }}
                disabled={!selected.size}
              >
                Limpar seleção
              </button>
              <span>{selected.size} selecionados</span>
            </div>
            {loading ? (
              <p className="manager-empty">Carregando biblioteca…</p>
            ) : visible.length ? (
              visible.map((book) => (
                <LibraryBookRow
                  key={book.id}
                  book={book}
                  selected={selected.has(book.id)}
                  seriesTitle={
                    series.find((item) => item.id === book.series_id)?.title ||
                    "Sem coleção"
                  }
                  volumeLabel={
                    volumes.find((item) => item.id === book.volume_id)?.title ||
                    (book.volume_id
                      ? `Volume ${volumes.find((item) => item.id === book.volume_id)?.volume_number ?? ""}`
                      : "Sem volume")
                  }
                  onToggle={() => {
                    if (!busy) toggle(book);
                  }}
                />
              ))
            ) : (
              <p className="manager-empty">Nenhum arquivo encontrado.</p>
            )}
            {totalCount > PAGE_SIZE && (
              <div className="manager-pagination">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </button>
                <span>
                  {page + 1} / {Math.ceil(totalCount / PAGE_SIZE)}
                </span>
                <button
                  disabled={(page + 1) * PAGE_SIZE >= totalCount}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </section>
          <aside className="manager-actions">
            <h2>Ação em massa</h2>
            <label>
              Ação
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as Action)}
              >
                <option value="move">Mover para obra / volume</option>
                <option value="type">Alterar tipo</option>
                <option value="order">Alterar ordem</option>
                <option value="delete">Excluir arquivos</option>
              </select>
            </label>
            {action === "move" && (
              <>
                <SeriesPicker
                  ownerId={user.id}
                  value={destinationSeries}
                  emptyLabel="Sem coleção"
                  disabled={busy}
                  onChange={(item) => {
                    setDestinationSeries(item);
                    setTargetSeries(item?.id || "");
                    setTargetVolume("");
                    setDestinationVolume(null);
                  }}
                />
                <VolumePicker
                  ownerId={user.id}
                  seriesId={targetSeries}
                  value={destinationVolume}
                  disabled={!targetSeries || busy}
                  onChange={(item) => {
                    setDestinationVolume(item);
                    setTargetVolume(item?.id || "");
                  }}
                />
                <p>O arquivo e o progresso de leitura permanecem no lugar.</p>
              </>
            )}
            {action === "type" && (
              <label>
                Tipo
                <select
                  value={targetType}
                  onChange={(event) =>
                    setTargetType(event.target.value as "chapter" | "volume")
                  }
                >
                  <option value="chapter">Capítulo</option>
                  <option value="volume">Volume completo</option>
                </select>
              </label>
            )}
            {action === "order" && (
              <>
                <label>
                  Ordem inicial
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={orderStart}
                    onChange={(event) => setOrderStart(event.target.value)}
                  />
                </label>
                <p>
                  Os arquivos selecionados recebem ordens sequenciais, com
                  intervalo de 1000, na ordem da seleção.
                </p>
              </>
            )}
            {action === "delete" && (
              <p>
                Os arquivos selecionados e seus registros serão excluídos
                permanentemente.
              </p>
            )}
            <button
              className={
                action === "delete" ? "danger-button" : "primary-button"
              }
              disabled={!selected.size || busy}
              onClick={() =>
                action === "delete" ? setDeleteOpen(true) : void apply()
              }
            >
              {busy ? (
                "Aplicando…"
              ) : action === "delete" ? (
                <>
                  <Trash2 size={15} /> Excluir selecionados
                </>
              ) : (
                `Aplicar a ${selected.size} arquivo${selected.size === 1 ? "" : "s"}`
              )}
            </button>
          </aside>
        </div>
        {deleteOpen && (
          <ConfirmDialog
            title={`Excluir ${chosen.length} arquivo${chosen.length === 1 ? "" : "s"}?`}
            message="Esta ação remove os arquivos e seus registros, incluindo o progresso. Não é possível desfazer."
            confirmLabel="Excluir arquivos"
            busy={busy}
            onCancel={() => setDeleteOpen(false)}
            onConfirm={() => void removeSelected()}
          />
        )}
      </main>
    </>
  );
}
