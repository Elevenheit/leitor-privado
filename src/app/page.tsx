"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, FilePlus2, FileText, Pencil, Plus, Search, Trash2, UploadCloud, X } from "lucide-react";
import { Upload } from "tus-js-client";
import type { User } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { BUCKET, supabase } from "@/lib/supabase";
import { formatSize, type Book, type ReadingProgress } from "@/lib/types";

export default function Home() { return <AuthGate>{user => <Dashboard user={user} />}</AuthGate>; }

function Dashboard({ user }: { user: User }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const api = supabase();
    const [bookResult, progressResult] = await Promise.all([
      api.from("books").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
      api.from("reading_progress").select("*").eq("owner_id", user.id),
    ]);
    if (bookResult.error || progressResult.error) setError(bookResult.error?.message || progressResult.error?.message || "Erro ao carregar biblioteca.");
    else {
      setBooks((bookResult.data || []) as Book[]);
      setProgress(Object.fromEntries(((progressResult.data || []) as ReadingProgress[]).map(item => [item.book_id, item])));
      setError("");
    }
    setLoading(false);
  }, [user.id]);

  // Fetching the private library when the authenticated user changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function uploadFile(file: File) {
    if (uploading) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".pdf")) { setError("Escolha um arquivo PDF."); return; }
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== "%PDF-") { setError("Este arquivo não parece ser um PDF válido."); return; }
    const api = supabase();
    const { data: { session } } = await api.auth.getSession();
    if (!session) { setError("Sua sessão expirou. Entre novamente."); return; }
    const path = `${user.id}/${crypto.randomUUID()}.pdf`;
    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/upload/resumable`;
    setUploading(true);
    setUploadPercent(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint,
          headers: { authorization: `Bearer ${session.access_token}` },
          retryDelays: [0, 3000, 5000, 10000, 20000],
          chunkSize: 6 * 1024 * 1024,
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: { bucketName: BUCKET, objectName: path, contentType: "application/pdf", cacheControl: "3600" },
          onError: reject,
          onSuccess: () => resolve(),
          onProgress: (sent, total) => setUploadPercent(Math.round(sent / total * 100)),
        });
        upload.findPreviousUploads().then(previous => {
          if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        }).catch(reject);
      });
      const { error: insertError } = await api.from("books").insert({
        owner_id: user.id,
        title: file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim(),
        original_filename: file.name,
        file_path: path,
        size_bytes: file.size,
      });
      if (insertError) {
        await api.storage.from(BUCKET).remove([path]);
        throw insertError;
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha no upload.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deleteBook(book: Book) {
    if (!window.confirm(`Excluir “${book.title}” e seu progresso de leitura?`)) return;
    setBusyId(book.id);
    setError("");
    const api = supabase();
    const { error: storageError } = await api.storage.from(BUCKET).remove([book.file_path]);
    if (storageError) { setError(storageError.message); setBusyId(null); return; }
    const { error: dbError } = await api.from("books").delete().eq("id", book.id).eq("owner_id", user.id);
    if (dbError) setError(`PDF excluído, mas o registro não foi removido: ${dbError.message}`);
    await load();
    setBusyId(null);
  }

  async function renameBook(book: Book) {
    const title = window.prompt("Novo título", book.title)?.trim();
    if (!title || title === book.title) return;
    setBusyId(book.id);
    const { error } = await supabase().from("books").update({ title }).eq("id", book.id).eq("owner_id", user.id);
    if (error) setError(error.message);
    await load();
    setBusyId(null);
  }

  const filtered = books.filter(book => book.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const recent = books.find(book => progress[book.id]);

  return <><Nav /><main className="dashboard">
    <section className="hero">
      <div><span className="eyebrow"><span className="tiny-star">✦</span> Biblioteca privada</span><h1>Suas histórias,<br /><em>no seu ritmo.</em></h1><p>Uma pausa na rotina. Um universo inteiro à sua espera.</p></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><BookOpen size={86} strokeWidth={1} /></div>
    </section>

    {recent && <section className="continue-card"><div className="continue-icon"><BookOpen size={24}/></div><div className="continue-copy"><span className="eyebrow">Continue lendo</span><strong>{recent.title}</strong><small>Página {progress[recent.id].page_number}{recent.total_pages ? ` de ${recent.total_pages}` : ""}</small></div><Link className="continue-link" href={`/read/${recent.id}`}>Retomar <ChevronRight size={18}/></Link></section>}

    <section className="library-section"><div className="section-head"><div><span className="eyebrow">Seu acervo</span><h2>Biblioteca <span className="count">{books.length}</span></h2></div><button className="primary-button add-button" onClick={() => inputRef.current?.click()} disabled={uploading}><Plus size={18}/> Adicionar PDF</button></div>
      <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void uploadFile(file); }} />
      {error && <div className="error dashboard-error" role="alert">{error}<button aria-label="Fechar erro" onClick={() => setError("")}><X size={16}/></button></div>}
      <div className="toolbar"><div className="search"><Search size={18}/><input aria-label="Buscar livros" placeholder="Buscar por título..." value={query} onChange={e => setQuery(e.target.value)} /></div><span className="muted">{books.length} {books.length === 1 ? "livro" : "livros"}</span></div>
      <div className={`upload-zone ${dragging ? "dragging" : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) void uploadFile(file); }} onClick={() => !uploading && inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") inputRef.current?.click(); }}><UploadCloud size={22}/><span>{uploading ? `Enviando PDF… ${uploadPercent}%` : "Arraste um PDF aqui ou clique para escolher"}</span>{uploading && <div className="upload-track"><div style={{ width: `${uploadPercent}%` }}/></div>}</div>
      {loading ? <p className="empty-state">Carregando biblioteca…</p> : filtered.length === 0 ? <div className="empty-state"><FilePlus2 size={32}/><h3>{query ? "Nenhum título encontrado" : "Sua biblioteca começa aqui"}</h3><p>{query ? "Tente outro termo de busca." : "Adicione seu primeiro PDF para começar a leitura."}</p></div> : <div className="book-grid">{filtered.map((book, index) => { const current = progress[book.id]; const percent = current && book.total_pages ? Math.min(100, Math.round(current.page_number / book.total_pages * 100)) : 0; return <article className="book-card" key={book.id}><Link href={`/read/${book.id}`} className={`book-cover cover-${index % 5}`}><div className="cover-lines"><i/><i/><i/></div><FileText size={42} strokeWidth={1.2}/><span>LIGHT NOVEL</span></Link><div className="book-info"><span className="book-type">PDF · {formatSize(book.size_bytes)}</span><Link href={`/read/${book.id}`} className="book-title">{book.title}</Link><span className="book-meta">{current ? `Página ${current.page_number}${book.total_pages ? ` de ${book.total_pages}` : ""}` : "Ainda não iniciado"}</span><div className="book-progress"><div style={{width: `${percent}%`}}/></div><div className="book-actions"><Link href={`/read/${book.id}`}>{current ? "Continuar leitura" : "Começar leitura"} <ChevronRight size={15}/></Link><button title="Renomear" aria-label={`Renomear ${book.title}`} disabled={busyId === book.id} onClick={() => void renameBook(book)}><Pencil size={15}/></button><button title="Excluir" aria-label={`Excluir ${book.title}`} disabled={busyId === book.id} onClick={() => void deleteBook(book)}><Trash2 size={15}/></button></div></div></article>; })}</div>}
    </section>
    <footer className="site-footer">nook. <span>Um capítulo de cada vez.</span></footer>
  </main></>;
}
