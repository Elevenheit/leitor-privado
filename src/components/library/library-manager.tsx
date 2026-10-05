"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Search, Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Nav } from "@/components/nav";
import { sortBooks } from "@/lib/reader-navigation";
import { supabase } from "@/lib/supabase";
import type { Book, Series, Volume } from "@/lib/types";
import { listAdminCatalog } from "@/lib/data/admin";
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
  const [targetType, setTargetType] = useState<"chapter" | "volume">("chapter");
  const [orderStart, setOrderStart] = useState("1000");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminCatalog(user.id, page, query);
      setBooks(data.books as Book[]); setSeries(data.series as Series[]); setVolumes(data.volumes as Volume[]); setTotalCount(data.totalCount); setError("");
    } catch (cause) { setError(toDataError(cause, "Não foi possível carregar o acervo.").message); }
    finally { setLoading(false); }
  }, [page, query, user.id]);

  // Load once for this management view; mutations refresh the local list.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const ordered = useMemo(() => {
    const bySeries = new Map(series.map((item, index) => [item.id, index]));
    return sortBooks(books, volumes).sort((a, b) => (a.series_id ? bySeries.get(a.series_id) ?? 0 : -1) - (b.series_id ? bySeries.get(b.series_id) ?? 0 : -1));
  }, [books, volumes, series]);
  const visible = ordered;
  const chosen = Object.values(selectedBooks).filter((book) => selected.has(book.id));
  const volumeOptions = volumes.filter(item => item.series_id === targetSeries);

  function toggle(book: Book) {
    setSelected(previous => { const next = new Set(previous); if (next.has(book.id)) next.delete(book.id); else next.add(book.id); return next; });
    setSelectedBooks((previous) => {
      const next = { ...previous };
      if (selected.has(book.id)) delete next[book.id];
      else next[book.id] = book;
      return next;
    });
  }

  function selectVisible() {
    setSelected(previous => { const next = new Set(previous); for (const book of visible) next.add(book.id); return next; });
    setSelectedBooks((previous) => ({ ...previous, ...Object.fromEntries(visible.map((book) => [book.id, book])) }));
  }

  async function apply() {
    if (!chosen.length || busy || action === "delete") return;
    setBusy(true); setError(""); setMessage("");
    const api = supabase();
    if (action === "move") {
      if (targetVolume && !volumeOptions.some(volume => volume.id === targetVolume)) { setError("O volume não pertence à obra selecionada."); setBusy(false); return; }
      const destination = series.find(item => item.id === targetSeries);
      if (destination && chosen.some(book => destination.format === "novel" ? book.media_type !== "pdf" : book.media_type !== "cbz")) { setError("Escolha uma obra compatível com os arquivos selecionados."); setBusy(false); return; }
      const { error: updateError } = await api.from("books").update({ series_id: targetSeries || null, volume_id: targetVolume || null }).eq("owner_id", user.id).in("id", chosen.map(book => book.id));
      if (updateError) setError("Não foi possível reorganizar os arquivos."); else setMessage(`${chosen.length} arquivo(s) reorganizados sem mover a leitura.`);
    } else if (action === "type") {
      const { error: updateError } = await api.from("books").update({ content_type: targetType }).eq("owner_id", user.id).in("id", chosen.map(book => book.id));
      if (updateError) setError(updateError.message); else setMessage(`${chosen.length} tipo(s) atualizados.`);
    } else {
      const start = Number(orderStart);
      if (!Number.isInteger(start) || start < 0) { setError("Informe uma ordem inicial inteira e não negativa."); setBusy(false); return; }
      const failures: string[] = [];
      for (const [index, book] of chosen.entries()) {
        const { error: updateError } = await api.from("books").update({ sort_order: start + index * 1000 }).eq("owner_id", user.id).eq("id", book.id);
        if (updateError) failures.push(`${book.title}: ${updateError.message}`);
      }
      if (failures.length) setError(failures.join(" · ")); else setMessage(`Ordem ajustada para ${chosen.length} arquivo(s).`);
    }
    await load(); setSelected(new Set()); setSelectedBooks({}); setPage(0); setBusy(false);
  }

  async function removeSelected() {
    setBusy(true); setError(""); setMessage("");
    const failures: string[] = [];
    for (const book of chosen) {
      try { await deleteBookAndFile(user.id, book); }
      catch (cause) { failures.push(`${book.title}: ${toDataError(cause, "Delete failed.").message}`); }
    }
    if (failures.length) setError(failures.join(" | "));
    else setMessage(`${chosen.length} arquivo(s) excluídos.`);
    setDeleteOpen(false); setSelected(new Set()); setSelectedBooks({}); setPage(0); await load(); setBusy(false);
  }

  return <><Nav back/><main className="manager-page"><Link href="/" className="back-link"><ArrowLeft size={16}/> Biblioteca</Link><header className="manager-heading"><div><span className="eyebrow">Organização do acervo</span><h1>Gerenciar biblioteca</h1><p>Selecione arquivos para alterar a organização, tipo ou ordem.</p></div></header>
    {error && <div className="error" role="alert">{error}</div>}{message && <div className="manager-message" role="status"><Check size={15}/>{message}</div>}
    <div className="manager-tools"><div className="search"><Search size={17}/><input aria-label="Buscar arquivos" placeholder="Buscar arquivos, arquivos ou obras…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}/></div><span>{totalCount} arquivos</span></div>
    <div className="manager-layout"><section className="manager-list"><div className="manager-list-head"><button onClick={selectVisible} disabled={!visible.length}>Selecionar página</button><button onClick={() => { setSelected(new Set()); setSelectedBooks({}); }} disabled={!selected.size}>Limpar seleção</button><span>{selected.size} selecionados</span></div>{loading ? <p className="manager-empty">Carregando biblioteca…</p> : visible.length ? visible.map(book => <LibraryBookRow key={book.id} book={book} selected={selected.has(book.id)} seriesTitle={series.find(item => item.id === book.series_id)?.title || "Sem colecao"} volumeLabel={volumes.find(item => item.id === book.volume_id)?.title || (book.volume_id ? `Volume ${volumes.find(item => item.id === book.volume_id)?.volume_number ?? ""}` : "Sem volume")} onToggle={() => toggle(book)} />) : <p className="manager-empty">Nenhum arquivo encontrado.</p>}{totalCount > PAGE_SIZE && <div className="manager-pagination"><button disabled={page === 0} onClick={() => setPage(value => value - 1)}>Anterior</button><span>{page + 1} / {Math.ceil(totalCount / PAGE_SIZE)}</span><button disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(value => value + 1)}>Próxima</button></div>}</section>
      <aside className="manager-actions"><h2>Ação em massa</h2><label>Ação<select value={action} onChange={event => setAction(event.target.value as Action)}><option value="move">Mover para obra / volume</option><option value="type">Alterar tipo</option><option value="order">Alterar ordem</option><option value="delete">Excluir arquivos</option></select></label>{action === "move" && <><label>Obra<select value={targetSeries} onChange={event => { setTargetSeries(event.target.value); setTargetVolume(""); }}><option value="">Sem coleção</option>{series.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Volume<select value={targetVolume} onChange={event => setTargetVolume(event.target.value)} disabled={!targetSeries}><option value="">Sem volume</option>{volumeOptions.map(item => <option key={item.id} value={item.id}>{item.volume_number !== null ? `Volume ${item.volume_number}` : item.title || "Volume"}</option>)}</select></label><p>O arquivo e o progresso de leitura permanecem no lugar.</p></>}{action === "type" && <label>Tipo<select value={targetType} onChange={event => setTargetType(event.target.value as "chapter" | "volume")}><option value="chapter">Capítulo</option><option value="volume">Volume completo</option></select></label>}{action === "order" && <><label>Ordem inicial<input type="number" min="0" step="1" value={orderStart} onChange={event => setOrderStart(event.target.value)}/></label><p>Os arquivos selecionados recebem ordens sequenciais, com intervalo de 1000, na ordem exibida.</p></>}{action === "delete" && <p>Os arquivos selecionados e seus registros serão excluídos permanentemente.</p>}<button className={action === "delete" ? "danger-button" : "primary-button"} disabled={!selected.size || busy} onClick={() => action === "delete" ? setDeleteOpen(true) : void apply()}>{busy ? "Aplicando…" : action === "delete" ? <><Trash2 size={15}/> Excluir selecionados</> : `Aplicar a ${selected.size} arquivo${selected.size === 1 ? "" : "s"}`}</button></aside></div>
    {deleteOpen && <ConfirmDialog title={`Excluir ${chosen.length} arquivo${chosen.length === 1 ? "" : "s"}?`} message="Esta ação remove os arquivos e seus registros, incluindo o progresso. Não é possível desfazer." confirmLabel="Excluir arquivos" busy={busy} onCancel={() => setDeleteOpen(false)} onConfirm={() => void removeSelected()}/>}
  </main></>;
}
