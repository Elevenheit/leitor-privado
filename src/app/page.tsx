"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, FilePlus2, FileText, Pencil, Plus, Search, Star, Trash2, UploadCloud, X } from "lucide-react";
import { Upload } from "tus-js-client";
import type { User } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Nav } from "@/components/nav";
import { BUCKET, supabase } from "@/lib/supabase";
import { formatSize, type Book, type ReadingProgress, type Series, type Volume } from "@/lib/types";

export default function Home() { return <AuthGate>{user => <Dashboard user={user} />}</AuthGate>; }

function Dashboard({ user }: { user: User }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedSeries, setSelectedSeries] = useState("");
  const [selectedVolume, setSelectedVolume] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [contentType, setContentType] = useState<"chapter" | "volume">("chapter");
  const [inlineSeriesTitle, setInlineSeriesTitle] = useState("");
  const [inlineVolumeNumber, setInlineVolumeNumber] = useState("");
  const [inlineVolumeTitle, setInlineVolumeTitle] = useState("");
  const [createSeriesInline, setCreateSeriesInline] = useState(false);
  const [createVolumeInline, setCreateVolumeInline] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editChapterTitle, setEditChapterTitle] = useState("");
  const [editChapterNumber, setEditChapterNumber] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "series"; item: Series } | { type: "book"; item: Book } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const api = supabase();
    const [b, s, v, p] = await Promise.all([
      api.from("books").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
      api.from("series").select("*").eq("owner_id", user.id).order("title"),
      api.from("volumes").select("*").eq("owner_id", user.id).order("sort_order").order("volume_number"),
      api.from("reading_progress").select("*").eq("owner_id", user.id),
    ]);
    const failure = b.error || s.error || v.error || p.error;
    if (failure) setError(failure.message);
    else {
      setBooks((b.data || []) as Book[]); setSeries((s.data || []) as Series[]); setVolumes((v.data || []) as Volume[]);
      setProgress(Object.fromEntries(((p.data || []) as ReadingProgress[]).map(item => [item.book_id, item]))); setError("");
      const signedCovers = await Promise.all(((s.data || []) as Series[]).filter(item => item.cover_path).map(async item => {
        const { data } = await api.storage.from("covers").createSignedUrl(item.cover_path!, 3600); return [item.id, data?.signedUrl || ""] as const;
      }));
      setCoverUrls(Object.fromEntries(signedCovers.filter(([, url]) => url)));
    }
    setLoading(false);
  }, [user.id]);

  // Load authenticated library data once the user is available.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function createSeries() {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true); setError("");
    const { data: created, error: saveError } = await supabase().from("series").insert({ owner_id: user.id, title, description: newDescription.trim() || null }).select().single();
    if (saveError) setError(saveError.message); else {
      if (coverFile && created) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(coverFile.type)) { setError("A capa deve estar no formato JPEG, PNG ou WebP."); setBusy(false); return; }
        const ext = coverFile.type === "image/jpeg" ? "jpg" : coverFile.type.split("/")[1]; const path = `${user.id}/${created.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase().storage.from("covers").upload(path, coverFile, { contentType: coverFile.type, upsert: false });
        if (uploadError) setError(`Obra criada, mas a capa não foi enviada: ${uploadError.message}`);
        else { const { error: coverError } = await supabase().from("series").update({ cover_path: path }).eq("id", created.id); if (coverError) setError(coverError.message); }
      }
      setNewTitle(""); setNewDescription(""); setCoverFile(null); setShowCreate(false); await load();
    }
    setBusy(false);
  }

  async function createSeriesFromUpload() {
    const title = inlineSeriesTitle.trim(); if (!title) return;
    const { data, error: saveError } = await supabase().from("series").insert({ owner_id: user.id, title }).select().single();
    if (saveError) setError(saveError.message);
    else { setSeries(previous => [...previous, data as Series]); setSelectedSeries(data.id); setCreateSeriesInline(false); setInlineSeriesTitle(""); }
  }

  async function createVolumeFromUpload() {
    if (!selectedSeries || (!inlineVolumeNumber && !inlineVolumeTitle.trim())) return;
    const number = inlineVolumeNumber ? Number(inlineVolumeNumber) : null;
    const { data, error: saveError } = await supabase().from("volumes").insert({ owner_id: user.id, series_id: selectedSeries, volume_number: number, title: inlineVolumeTitle.trim() || null, sort_order: number ? Math.round(number * 1000) : volumes.length * 1000 }).select().single();
    if (saveError) setError(saveError.message);
    else { setVolumes(previous => [...previous, data as Volume]); setSelectedVolume(data.id); setCreateVolumeInline(false); setInlineVolumeNumber(""); setInlineVolumeTitle(""); }
  }

  function editSeries(item: Series) {
    setEditingSeries(item); setEditTitle(item.title); setEditDescription(item.description || "");
  }

  async function saveSeriesEdit() {
    if (!editingSeries || !editTitle.trim()) return;
    setBusy(true);
    const { error: updateError } = await supabase().from("series").update({ title: editTitle.trim(), description: editDescription.trim() || null, updated_at: new Date().toISOString() }).eq("id", editingSeries.id).eq("owner_id", user.id);
    if (updateError) setError(updateError.message); else setEditingSeries(null);
    await load(); setBusy(false);
  }

  async function toggleFavorite(item: Series) {
    setError("");
    const next = !item.is_favorite;
    const { error: updateError } = await supabase().from("series").update({ is_favorite: next }).eq("id", item.id).eq("owner_id", user.id);
    if (updateError) setError(`Não foi possível alterar o favorito. Verifique a migração 004. ${updateError.message}`);
    else setSeries(previous => previous.map(seriesItem => seriesItem.id === item.id ? { ...seriesItem, is_favorite: next } : seriesItem));
  }

  function deleteSeries(item: Series) { setDeleteTarget({ type: "series", item }); }

  async function removeSeries(item: Series) {
    setBusy(true); const { error: deleteError } = await supabase().from("series").delete().eq("id", item.id).eq("owner_id", user.id);
    if (deleteError) setError(deleteError.message); else setDeleteTarget(null); await load(); setBusy(false);
  }

  async function uploadFile() {
    if (!file || uploading) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".pdf")) { setError("Escolha um arquivo PDF."); return; }
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== "%PDF-") { setError("Este arquivo não parece ser um PDF válido."); return; }
    const api = supabase(); const { data: { session } } = await api.auth.getSession();
    if (!session) { setError("Sua sessão expirou. Entre novamente."); return; }
    const path = `${user.id}/${selectedSeries || "unfiled"}/${selectedVolume || "unassigned"}/${crypto.randomUUID()}.pdf`;
    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/upload/resumable`;
    setUploading(true); setUploadPercent(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, { endpoint, headers: { authorization: `Bearer ${session.access_token}` }, retryDelays: [0, 3000, 5000, 10000, 20000], chunkSize: 6 * 1024 * 1024, uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
          metadata: { bucketName: BUCKET, objectName: path, contentType: "application/pdf", cacheControl: "3600" }, onError: reject, onSuccess: () => resolve(), onProgress: (sent, total) => setUploadPercent(Math.round(sent / total * 100)) });
        upload.findPreviousUploads().then(previous => { if (previous.length) upload.resumeFromPreviousUpload(previous[0]); upload.start(); }).catch(reject);
      });
      const { error: insertError } = await api.from("books").insert({ owner_id: user.id, title: chapterTitle.trim() || file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim(), original_filename: file.name, file_path: path, size_bytes: file.size, series_id: selectedSeries || null, volume_id: selectedVolume || null, chapter_number: chapterNumber ? Number(chapterNumber) : null, chapter_title: chapterTitle.trim() || null, sort_order: chapterNumber ? Math.round(Number(chapterNumber) * 1000) : 0, content_type: contentType });
      if (insertError) { await api.storage.from(BUCKET).remove([path]); throw insertError; }
      setFile(null); setChapterNumber(""); setChapterTitle(""); setShowUpload(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha no upload."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  function deleteBook(book: Book) { setDeleteTarget({ type: "book", item: book }); }

  async function removeBook(book: Book) {
    setBusy(true); setError(""); const api = supabase();
    const { error: storageError } = await api.storage.from(BUCKET).remove([book.file_path]);
    if (storageError) { setError(storageError.message); setBusy(false); return; }
    const { error: dbError } = await api.from("books").delete().eq("id", book.id).eq("owner_id", user.id);
    if (dbError) setError(`PDF excluído, mas o registro não foi removido: ${dbError.message}`); else setDeleteTarget(null); await load(); setBusy(false);
  }

  function editBook(book: Book) { setEditingBook(book); setEditChapterTitle(book.chapter_title || book.title); setEditChapterNumber(book.chapter_number?.toString() || ""); }

  async function saveBookEdit() {
    if (!editingBook || !editChapterTitle.trim()) return;
    const chapter_number = editChapterNumber.trim() ? Number(editChapterNumber) : null;
    const { error: updateError } = await supabase().from("books").update({ chapter_title: editChapterTitle.trim(), title: editChapterTitle.trim(), chapter_number, sort_order: chapter_number ? Math.round(chapter_number * 1000) : editingBook.sort_order }).eq("id", editingBook.id).eq("owner_id", user.id);
    if (updateError) setError(updateError.message); else setEditingBook(null);
    await load();
  }

  const match = (value: string) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const matchesBook = (book: Book) => match(book.title) || match(book.chapter_title || "") || (book.chapter_number !== null && match(`capítulo ${book.chapter_number}`)) || match(`${book.content_type === "volume" ? "volume" : "capítulo"} ${book.chapter_number ?? ""}`);
  const groupedSeries = series.filter(item => (!favoriteOnly || item.is_favorite) && (match(item.title) || books.some(b => b.series_id === item.id && matchesBook(b)) || volumes.some(v => v.series_id === item.id && (match(`volume ${v.volume_number ?? ""}`) || match(v.title || "")))));
  const looseBooks = books.filter(book => !book.series_id && matchesBook(book));
  const recent = [...books].filter(book => progress[book.id]).sort((a, b) => (progress[b.id]?.updated_at || "").localeCompare(progress[a.id]?.updated_at || ""))[0];
  const relevantVolumes = volumes.filter(v => v.series_id === selectedSeries);

  return <><Nav /><main className="dashboard">
    <section className="hero"><div><span className="eyebrow"><span className="tiny-star">✦</span> Biblioteca privada</span><h1>Suas histórias,<br /><em>no seu ritmo.</em></h1><p>Uma pausa na rotina. Um universo inteiro à sua espera.</p></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><BookOpen size={86} strokeWidth={1} /></div></section>
    {recent && <section className="continue-card"><div className="continue-icon"><BookOpen size={24}/></div><div className="continue-copy"><span className="eyebrow">Continue lendo</span><strong>{series.find(s => s.id === recent.series_id)?.title || recent.title}</strong><small>{recent.chapter_number ? `Capítulo ${recent.chapter_number}` : `Página ${progress[recent.id].page_number}`}{recent.chapter_title ? ` · ${recent.chapter_title}` : ""}</small></div><Link className="continue-link" href={`/read/${recent.id}`}>Retomar <ChevronRight size={18}/></Link></section>}
    <section className="library-section"><div className="section-head"><div><span className="eyebrow">Seu acervo</span><h2>Obras <span className="count">{series.length}</span></h2></div><div className="library-buttons"><button className="secondary-button" onClick={() => setShowCreate(true)}><Plus size={17}/> Nova obra</button><button className="primary-button add-button" onClick={() => setShowUpload(true)} disabled={uploading}><UploadCloud size={17}/> Adicionar capítulo</button></div></div>
      {error && <div className="error dashboard-error" role="alert">{error}<button aria-label="Fechar erro" onClick={() => setError("")}><X size={16}/></button></div>}
      <div className="toolbar"><div className="search"><Search size={18}/><input aria-label="Buscar obras e capítulos" placeholder="Buscar obras, volumes ou capítulos…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="library-filters"><button className={!favoriteOnly ? "selected" : ""} aria-pressed={!favoriteOnly} onClick={() => setFavoriteOnly(false)}>Todos</button><button className={favoriteOnly ? "selected" : ""} aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly(true)}><Star size={13}/> Favoritos</button></div><span className="muted">{books.length} {books.length === 1 ? "PDF" : "PDFs"}</span></div>
      {loading ? <p className="empty-state">Carregando biblioteca…</p> : <>
        {groupedSeries.length > 0 && <div className="series-grid">{groupedSeries.map((item, index) => {
          const inSeries = books.filter(b => b.series_id === item.id); const volumeCount = volumes.filter(v => v.series_id === item.id).length;
          const lastBook = inSeries.filter(b => progress[b.id]).sort((a, b) => (progress[b.id]?.updated_at || "").localeCompare(progress[a.id]?.updated_at || ""))[0];
          return <article className="series-card" key={item.id}><Link href={`/series/${item.id}`} className={`series-cover cover-${index % 5}`} style={coverUrls[item.id] ? { backgroundImage: `linear-gradient(0deg,#171518e8,transparent 70%),url("${coverUrls[item.id]}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span className="cover-glyph">✦</span><strong>{item.title}</strong><small>NUK · BIBLIOTECA PARTICULAR</small></Link><div className="series-copy"><div><Link href={`/series/${item.id}`} className="series-title">{item.title}</Link><button className={`favorite-button ${item.is_favorite ? "active" : ""}`} aria-label={item.is_favorite ? `Desfavoritar ${item.title}` : `Favoritar ${item.title}`} aria-pressed={Boolean(item.is_favorite)} onClick={() => void toggleFavorite(item)}><Star size={16} fill={item.is_favorite ? "currentColor" : "none"}/></button><p>{volumeCount} {volumeCount === 1 ? "volume" : "volumes"} · {inSeries.length} {inSeries.length === 1 ? "capítulo" : "capítulos"}</p></div>{lastBook && <small className="series-last">Última leitura · {lastBook.chapter_number ? `Cap. ${lastBook.chapter_number}` : `p. ${progress[lastBook.id].page_number}`}</small>}<div className="series-actions"><Link href={`/series/${item.id}`}>Abrir obra <ChevronRight size={15}/></Link><button aria-label={`Editar ${item.title}`} onClick={() => void editSeries(item)} disabled={busy}><Pencil size={15}/></button><button aria-label={`Excluir organização ${item.title}`} onClick={() => void deleteSeries(item)} disabled={busy}><Trash2 size={15}/></button></div></div></article>;
        })}</div>}
        {!favoriteOnly && looseBooks.length > 0 && <section className="loose-section"><div className="section-head"><div><span className="eyebrow">PDFs antigos e não organizados</span><h2>Sem coleção <span className="count">{looseBooks.length}</span></h2></div></div><div className="loose-list">{looseBooks.map(book => { const current = progress[book.id]; return <article className="loose-row" key={book.id}><Link href={`/read/${book.id}`} className="loose-icon"><FileText size={20}/></Link><div className="loose-details"><Link href={`/read/${book.id}`}>{book.title}</Link><small>{formatSize(book.size_bytes)} · {current ? `Página ${current.page_number}` : "Ainda não iniciado"}</small></div><button onClick={() => void editBook(book)} aria-label="Editar metadados"><Pencil size={16}/></button><button onClick={() => void deleteBook(book)} aria-label="Excluir PDF"><Trash2 size={16}/></button></article>; })}</div></section>}
        {!groupedSeries.length && (favoriteOnly || (!series.length && !looseBooks.length)) && <div className="empty-state"><FilePlus2 size={32}/><h3>{favoriteOnly ? "Nenhuma obra favorita" : query ? "Nenhum resultado encontrado" : "Sua biblioteca começa aqui"}</h3><p>{favoriteOnly ? "Marque uma obra com a estrela para encontrá-la aqui." : query ? "Tente outro termo de busca." : "Crie uma obra ou envie um PDF para começar."}</p>{!favoriteOnly && <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17}/> Criar obra</button>}</div>}
      </>}
    </section><footer className="site-footer">nook. <span>Um capítulo de cada vez.</span></footer>
    {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="create-series-title"><button className="modal-close" onClick={() => setShowCreate(false)} aria-label="Fechar"><X size={19}/></button><span className="eyebrow">Nova coleção</span><h2 id="create-series-title">Criar obra</h2><label>Nome da obra<input value={newTitle} onChange={e => setNewTitle(e.target.value)} maxLength={300} autoFocus /></label><label>Descrição opcional<textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={3}/></label><label>Capa opcional (JPEG, PNG ou WebP)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setCoverFile(e.target.files?.[0] || null)}/></label><button className="primary-button" disabled={!newTitle.trim() || busy} onClick={() => void createSeries()}>{busy ? "Salvando…" : "Criar obra"}</button></section></div>}
    {showUpload && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !uploading) setShowUpload(false); }}><section className="form-modal upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><button className="modal-close" onClick={() => !uploading && setShowUpload(false)} aria-label="Fechar"><X size={19}/></button><span className="eyebrow">Acrescentar ao acervo</span><h2 id="upload-title">Enviar PDF</h2><label>Obra<select value={selectedSeries} onChange={e => { setSelectedSeries(e.target.value); setSelectedVolume(""); }}><option value="">Sem coleção</option>{series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><button type="button" className="inline-create" onClick={() => setCreateSeriesInline(!createSeriesInline)}>+ Criar nova obra</button>{createSeriesInline && <div className="inline-create-row"><input aria-label="Nome da nova obra" placeholder="Nome da obra" value={inlineSeriesTitle} onChange={e => setInlineSeriesTitle(e.target.value)}/><button type="button" className="secondary-button" onClick={() => void createSeriesFromUpload()}>Criar</button></div>}<label>Volume<select value={selectedVolume} onChange={e => setSelectedVolume(e.target.value)} disabled={!selectedSeries}><option value="">Sem volume</option>{relevantVolumes.map(v => <option key={v.id} value={v.id}>{v.volume_number ? `Volume ${v.volume_number}` : v.title || "Volume"}</option>)}</select></label>{selectedSeries && <><button type="button" className="inline-create" onClick={() => setCreateVolumeInline(!createVolumeInline)}>+ Criar novo volume</button>{createVolumeInline && <div className="inline-create-row"><input aria-label="Número do novo volume" type="number" placeholder="Número" value={inlineVolumeNumber} onChange={e => setInlineVolumeNumber(e.target.value)}/><input aria-label="Título do novo volume" placeholder="Título (opcional)" value={inlineVolumeTitle} onChange={e => setInlineVolumeTitle(e.target.value)}/><button type="button" className="secondary-button" onClick={() => void createVolumeFromUpload()}>Criar</button></div>}</>}<label>Tipo do PDF<select value={contentType} onChange={e => setContentType(e.target.value as "chapter" | "volume")}><option value="chapter">Capítulo</option><option value="volume">Volume completo</option></select></label><div className="form-row"><label>Número do capítulo/volume<input type="number" min="0" step="any" value={chapterNumber} onChange={e => setChapterNumber(e.target.value)}/></label><label>Título<input value={chapterTitle} onChange={e => setChapterTitle(e.target.value)}/></label></div><label className="file-picker">Arquivo PDF<input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}/></label><div className={`upload-drop ${dragging ? "dragging" : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); setFile(e.dataTransfer.files[0] || null); }}><UploadCloud size={19}/>{uploading ? `Enviando… ${uploadPercent}%` : file?.name || "Arraste o PDF ou escolha acima"}{uploading && <div className="upload-track"><div style={{ width: `${uploadPercent}%` }}/></div>}</div><button className="primary-button" disabled={!file || uploading} onClick={() => void uploadFile()}>{uploading ? "Enviando…" : "Enviar PDF"}</button></section></div>}
    {editingSeries && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setEditingSeries(null); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="edit-series-title"><button className="modal-close" type="button" onClick={() => setEditingSeries(null)} aria-label="Fechar"><X size={18}/></button><span className="eyebrow">Organização da biblioteca</span><h2 id="edit-series-title">Editar obra</h2><label>Nome da obra<input value={editTitle} onChange={event => setEditTitle(event.target.value)} maxLength={300} autoFocus/></label><label>Descrição opcional<textarea value={editDescription} onChange={event => setEditDescription(event.target.value)} rows={3}/></label><div className="confirm-actions"><button className="secondary-button" type="button" onClick={() => setEditingSeries(null)} disabled={busy}>Cancelar</button><button className="primary-button" type="button" onClick={() => void saveSeriesEdit()} disabled={!editTitle.trim() || busy}>{busy ? "Salvando…" : "Salvar alterações"}</button></div></section></div>}
    {editingBook && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditingBook(null); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="edit-book-title"><button className="modal-close" type="button" onClick={() => setEditingBook(null)} aria-label="Fechar"><X size={18}/></button><span className="eyebrow">Metadados do capítulo</span><h2 id="edit-book-title">Editar capítulo</h2><label>Título<input value={editChapterTitle} onChange={event => setEditChapterTitle(event.target.value)} autoFocus/></label><label>Número do capítulo<input type="number" min="0" step="any" value={editChapterNumber} onChange={event => setEditChapterNumber(event.target.value)}/></label><div className="confirm-actions"><button className="secondary-button" type="button" onClick={() => setEditingBook(null)}>Cancelar</button><button className="primary-button" type="button" onClick={() => void saveBookEdit()} disabled={!editChapterTitle.trim()}>Salvar alterações</button></div></section></div>}
    {deleteTarget && <ConfirmDialog title={deleteTarget.type === "series" ? `Excluir “${deleteTarget.item.title}”?` : `Excluir “${deleteTarget.item.title}”?`} message={deleteTarget.type === "series" ? "A organização será removida. Os PDFs e o progresso serão preservados e passarão para Sem coleção." : "O arquivo PDF e o progresso de leitura serão excluídos permanentemente."} confirmLabel={deleteTarget.type === "series" ? "Excluir organização" : "Excluir PDF e progresso"} busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget.type === "series") void removeSeries(deleteTarget.item); else void removeBook(deleteTarget.item); }}/ >}
  </main></>;
}
