"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Check, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { BetaAccess } from "@/components/beta-access";
import { mediaHref } from "@/lib/catalog";
import { AuthGate } from "@/components/auth-gate";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Nav } from "@/components/nav";
import { supabase } from "@/lib/supabase";
import type { Book, ReadingProgress, Series, Volume } from "@/lib/types";

export default function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  useEffect(() => { void params.then(({ id: value }) => setId(value)); }, [params]);
  if (!id) return <main className="reader-status">Abrindo obra…</main>;
  return <AuthGate>{user => <BetaAccess admin><SeriesDetail user={user} id={id}/></BetaAccess>}</AuthGate>;
}

function SeriesDetail({ user, id }: { user: User; id: string }) {
  const [series, setSeries] = useState<Series | null>(null);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [allVolumes, setAllVolumes] = useState<Volume[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [volumeTitle, setVolumeTitle] = useState("");
  const [volumeNumber, setVolumeNumber] = useState("");
  const [editingVolume, setEditingVolume] = useState<Volume | null>(null);
  const [editVolumeNumber, setEditVolumeNumber] = useState("");
  const [editVolumeTitle, setEditVolumeTitle] = useState("");
  const [deleteVolumeTarget, setDeleteVolumeTarget] = useState<Volume | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [chapterName, setChapterName] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterSeries, setChapterSeries] = useState(id);
  const [chapterVolume, setChapterVolume] = useState("");
  const [seriesOptions, setSeriesOptions] = useState<Series[]>([]);
  const [coverUrl, setCoverUrl] = useState("");

  const load = useCallback(async () => {
    const api = supabase();
    const [s, v, b, p, allSeries, userVolumes] = await Promise.all([
      api.from("series").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
      api.from("volumes").select("*").eq("series_id", id).eq("owner_id", user.id).order("sort_order").order("volume_number"),
      api.from("books").select("*").eq("series_id", id).eq("owner_id", user.id).order("sort_order").order("chapter_number"),
      api.from("reading_progress").select("*").eq("owner_id", user.id),
      api.from("series").select("*").eq("owner_id", user.id).order("title"),
      api.from("volumes").select("*").eq("owner_id", user.id).order("sort_order").order("volume_number"),
    ]);
    const failure = s.error || v.error || b.error || p.error || allSeries.error || userVolumes.error;
    if (failure) setError(failure.message);
    else {
      const current = s.data as Series | null; setSeries(current); setVolumes((v.data || []) as Volume[]); setAllVolumes((userVolumes.data || []) as Volume[]); setBooks((b.data || []) as Book[]); setSeriesOptions((allSeries.data || []) as Series[]); setProgress(Object.fromEntries(((p.data || []) as ReadingProgress[]).map(item => [item.book_id, item])));
      if (current?.cover_path) { const { data } = await supabase().storage.from("covers").createSignedUrl(current.cover_path, 3600); setCoverUrl(data?.signedUrl || ""); }
    }
    setLoading(false);
  }, [id, user.id]);
  // Fetch the selected private work.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function createVolume() {
    if (!volumeNumber && !volumeTitle.trim()) return;
    const number = volumeNumber ? Number(volumeNumber) : null;
    const { error: saveError } = await supabase().from("volumes").insert({ owner_id: user.id, series_id: id, volume_number: number, title: volumeTitle.trim() || null, sort_order: number ? Math.round(number * 1000) : volumes.length * 1000 });
    if (saveError) setError(saveError.message); else { setVolumeNumber(""); setVolumeTitle(""); await load(); }
  }
  function editVolume(volume: Volume) {
    setEditingVolume(volume); setEditVolumeNumber(volume.volume_number?.toString() || ""); setEditVolumeTitle(volume.title || "");
  }
  async function saveVolumeEdit() {
    if (!editingVolume) return;
    const number = editVolumeNumber.trim() ? Number(editVolumeNumber) : null;
    setBusy(true);
    const { error: updateError } = await supabase().from("volumes").update({ volume_number: number, title: editVolumeTitle.trim() || null, sort_order: number ? Math.round(number * 1000) : editingVolume.sort_order, updated_at: new Date().toISOString() }).eq("id", editingVolume.id).eq("owner_id", user.id);
    if (updateError) setError(updateError.message); else setEditingVolume(null);
    await load(); setBusy(false);
  }
  function deleteVolume(volume: Volume) { setDeleteVolumeTarget(volume); }
  async function removeVolume(volume: Volume) {
    setBusy(true);
    const { error: deleteError } = await supabase().from("volumes").delete().eq("id", volume.id).eq("owner_id", user.id);
    if (deleteError) setError(deleteError.message); else setDeleteVolumeTarget(null);
    await load(); setBusy(false);
  }
  function openEdit(book: Book) {
    setEditing(book); setChapterName(book.chapter_title || book.title); setChapterNumber(book.chapter_number?.toString() || ""); setChapterSeries(book.series_id || id); setChapterVolume(book.volume_id || "");
  }
  async function saveChapter() {
    if (!editing || !chapterName.trim()) return;
    const selectedVolume = chapterVolume ? allVolumes.find(volume => volume.id === chapterVolume) : null;
    if (chapterVolume && (!selectedVolume || selectedVolume.series_id !== chapterSeries)) {
      setError("O volume selecionado não pertence à obra escolhida.");
      return;
    }
    const number = chapterNumber.trim() ? Number(chapterNumber) : null;
    const { error: updateError } = await supabase().from("books").update({ title: chapterName.trim(), chapter_title: chapterName.trim(), chapter_number: number, sort_order: number ? Math.round(number * 1000) : editing.sort_order, series_id: chapterSeries || null, volume_id: chapterVolume || null }).eq("id", editing.id).eq("owner_id", user.id);
    if (updateError) setError(updateError.message); else setEditing(null);
    await load();
  }
  const selectedVolumes = allVolumes.filter(volume => volume.series_id === chapterSeries);
  const wholeChapters = books.filter(book => !book.volume_id);
  const lastRead = [...books].filter(book => progress[book.id]).sort((a, b) => (progress[b.id]?.updated_at || "").localeCompare(progress[a.id]?.updated_at || ""))[0];
  const chapterBooks = books.filter(book => book.content_type !== "volume");
  const chapterCount = chapterBooks.length;
  const overallProgress = chapterCount
    ? Math.min(100, Math.max(0, Math.round(chapterBooks.filter(book => progress[book.id]).length / chapterCount * 100)))
    : 0;

  if (loading) return <><Nav back/><main className="reader-status">Carregando obra…</main></>;
  if (!series) return <><Nav back/><main className="reader-status"><h1>Obra não encontrada</h1><p>{error || "A obra não existe ou você não tem acesso."}</p><Link className="primary-button" href="/">Voltar</Link></main></>;
  return <><Nav back/><main className="series-page">
    <Link className="back-link" href="/"><ArrowLeft size={16}/> Biblioteca</Link>
    <section className="series-hero"><div className="series-hero-cover" style={coverUrl ? { backgroundImage: `linear-gradient(0deg,#171518e8,transparent 75%),url("${coverUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span>✦</span><strong>{series.title}</strong></div><div className="series-hero-copy"><span className="eyebrow">Na sua biblioteca</span><h1>{series.title}</h1>{series.description && <p>{series.description}</p>}<div className="series-stats"><span>{volumes.length} {volumes.length === 1 ? "volume" : "volumes"}</span><span>{chapterCount} {chapterCount === 1 ? "capítulo" : "capítulos"}</span>{overallProgress > 0 && <span>{overallProgress}% iniciados</span>}</div>{lastRead && <Link className="last-read" href={mediaHref(lastRead)}><BookOpen size={16}/> Continuar: {lastRead.chapter_number ? `Capítulo ${lastRead.chapter_number}` : lastRead.chapter_title || lastRead.title} <ChevronRight size={15}/></Link>}</div></section>
    {error && <div className="error dashboard-error">{error}<button onClick={() => setError("")}>×</button></div>}
    <section className="volumes-section"><div className="section-head"><div><span className="eyebrow">Organize sua leitura</span><h2>Volumes <span className="count">{volumes.length}</span></h2></div></div>
      <form className="new-volume-form" onSubmit={e => { e.preventDefault(); void createVolume(); }}><label>Número<input type="number" min="0" step="any" placeholder="16" value={volumeNumber} onChange={e => setVolumeNumber(e.target.value)}/></label><label>Título opcional<input placeholder="Subtítulo do volume" value={volumeTitle} onChange={e => setVolumeTitle(e.target.value)}/></label><button className="secondary-button" type="submit"><Plus size={16}/> Criar volume</button></form>
      {volumes.map(volume => {
        const chapters = books.filter(book => book.volume_id === volume.id);
        return <section className="volume-section" key={volume.id}><header className="volume-heading"><div><span className="eyebrow">{volume.volume_number ? `Volume ${volume.volume_number}` : "Volume"}</span><h3>{volume.title || `Volume ${volume.volume_number || "sem número"}`}</h3><small>{chapters.length} {chapters.length === 1 ? "capítulo" : "capítulos"}</small></div><div className="volume-actions"><button aria-label="Editar e reorganizar volume" onClick={() => void editVolume(volume)}><Pencil size={16}/></button><button aria-label="Excluir volume" onClick={() => void deleteVolume(volume)}><Trash2 size={16}/></button></div></header><ChapterList chapters={chapters} progress={progress} onEdit={openEdit}/></section>;
      })}
      {wholeChapters.length > 0 && <section className="volume-section"><header className="volume-heading"><div><span className="eyebrow">Capítulos</span><h3>Sem volume</h3></div></header><ChapterList chapters={wholeChapters} progress={progress} onEdit={openEdit}/></section>}
      {!volumes.length && !wholeChapters.length && <div className="empty-state"><BookOpen size={30}/><h3>Nenhum capítulo cadastrado</h3><p>Adicione um PDF pela biblioteca para associá-lo a esta obra.</p><Link href="/" className="primary-button">Voltar à biblioteca</Link></div>}
    </section>
    {editingVolume && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setEditingVolume(null); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="edit-volume-title"><button className="modal-close" type="button" onClick={() => setEditingVolume(null)} aria-label="Fechar"><X size={18}/></button><span className="eyebrow">Organização da obra</span><h2 id="edit-volume-title">Editar volume</h2><label>Número e ordem<input type="number" min="0" step="any" value={editVolumeNumber} onChange={event => setEditVolumeNumber(event.target.value)} autoFocus/></label><label>Título opcional<input value={editVolumeTitle} onChange={event => setEditVolumeTitle(event.target.value)}/></label><div className="confirm-actions"><button className="secondary-button" type="button" onClick={() => setEditingVolume(null)} disabled={busy}>Cancelar</button><button className="primary-button" type="button" onClick={() => void saveVolumeEdit()} disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</button></div></section></div>}
    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="edit-chapter-title"><button className="modal-close" onClick={() => setEditing(null)} aria-label="Fechar">×</button><span className="eyebrow">Metadados do PDF</span><h2 id="edit-chapter-title">Editar capítulo</h2><label>Título<input value={chapterName} onChange={e => setChapterName(e.target.value)}/></label><label>Número<input type="number" min="0" step="any" value={chapterNumber} onChange={e => setChapterNumber(e.target.value)}/></label><label>Obra<select value={chapterSeries} onChange={e => { setChapterSeries(e.target.value); setChapterVolume(""); }}><option value="">Sem coleção</option>{seriesOptions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label>Volume<select value={chapterVolume} onChange={e => setChapterVolume(e.target.value)}><option value="">Sem volume</option>{selectedVolumes.map(v => <option key={v.id} value={v.id}>{v.volume_number ? `Volume ${v.volume_number}` : v.title || "Volume"}</option>)}</select></label><button className="primary-button" onClick={() => void saveChapter()}><Check size={17}/> Salvar capítulo</button></section></div>}
    {deleteVolumeTarget && <ConfirmDialog title={`Excluir ${deleteVolumeTarget.title || `Volume ${deleteVolumeTarget.volume_number || ""}`}?`} message="A organização do volume será removida. Os PDFs e o progresso serão preservados e os capítulos passarão para Sem volume." confirmLabel="Excluir organização" busy={busy} onCancel={() => setDeleteVolumeTarget(null)} onConfirm={() => void removeVolume(deleteVolumeTarget)}/>}
    <footer className="site-footer">nook. <span>Um capítulo de cada vez.</span></footer>
  </main></>;
}

function ChapterList({ chapters, progress, onEdit }: { chapters: Book[]; progress: Record<string, ReadingProgress>; onEdit: (book: Book) => void }) {
  return <ol className="chapter-list">{chapters.map((book, index) => {
    const saved = progress[book.id]; const done = Boolean(book.total_pages && saved && saved.page_number >= book.total_pages); const percent = done ? 100 : saved && book.total_pages ? Math.min(99, Math.round(saved.page_number / book.total_pages * 100)) : 0;
    return <li className="chapter-row" key={book.id}><span className={`chapter-number ${book.content_type === "volume" ? "volume-number" : ""}`}>{book.content_type === "volume" ? `V${book.chapter_number ?? ""}` : book.chapter_number ?? index + 1}</span><div className="chapter-info"><Link href={mediaHref(book)}>{book.content_type === "volume" ? `Volume completo · ${book.chapter_title || book.title}` : book.chapter_title || book.title}</Link><small>{done ? "Concluído" : saved ? "Lendo" : "Não iniciado"}{saved && book.total_pages ? ` · ${percent}%` : ""}</small><div className="book-progress"><div style={{ width: `${percent}%` }}/></div></div><Link className="chapter-continue" href={mediaHref(book)}>{saved ? "Continuar" : "Ler"}<ChevronRight size={16}/></Link><button className="chapter-edit" onClick={() => onEdit(book)} aria-label="Editar capítulo ou mover"><Pencil size={15}/></button></li>;
  })}{!chapters.length && <li className="chapter-empty">Ainda não há capítulos neste volume.</li>}</ol>;
}
