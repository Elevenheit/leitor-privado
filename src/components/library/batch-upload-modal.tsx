"use client";

import { useRef, useState } from "react";
import { Check, RotateCcw, UploadCloud, X } from "lucide-react";
import { suggestDraft, uploadBatchFile, type BatchDraft } from "@/lib/batch-upload";
import { BUCKET, supabase } from "@/lib/supabase";
import type { Series, Volume } from "@/lib/types";

export function BatchUploadModal({ ownerId, series, volumes, onClose, onComplete }: { ownerId: string; series: Series[]; volumes: Volume[]; onClose: () => void; onComplete: () => Promise<void> }) {
  const [drafts, setDrafts] = useState<BatchDraft[]>([]);
  const [seriesId, setSeriesId] = useState("");
  const [volumeId, setVolumeId] = useState("");
  const [newVolume, setNewVolume] = useState("");
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedSeries = series.find(item => item.id === seriesId);
  const availableVolumes = volumes.filter(item => item.series_id === seriesId);
  const completed = drafts.filter(item => item.status === "done").length;
  const failures = drafts.filter(item => item.status === "error").length;
  const overallPercent = drafts.length ? Math.round(drafts.reduce((total, item) => total + (item.status === "done" ? 100 : item.status === "uploading" ? item.percent : 0), 0) / drafts.length) : 0;

  function addFiles(files: FileList | File[]) {
    const accepted = Array.from(files).filter(file => /\.(pdf|cbz|mp4)$/i.test(file.name));
    if (accepted.length !== files.length) setError("Alguns arquivos foram ignorados. São aceitos PDF, CBZ e MP4."); else setError("");
    setDrafts(previous => [...previous, ...accepted.map(file => suggestDraft(file, series))].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: "base" })));
    if (inputRef.current) inputRef.current.value = "";
  }
  function change(id: string, update: Partial<BatchDraft>) { setDrafts(previous => previous.map(item => item.id === id ? { ...item, ...update } : item)); }

  async function process(items: BatchDraft[]) {
    if (running) return;
    setRunning(true); setError("");
    let anySuccess = false;
    for (const draft of items) {
      if (draft.status === "done") continue;
      const number = draft.chapterNumber.trim() ? Number(draft.chapterNumber) : null;
      if (!seriesId || !selectedSeries || (volumeId && !availableVolumes.some(item => item.id === volumeId)) || (volumeId === "new" && (!newVolume.trim() || !Number.isFinite(Number(newVolume)) || Number(newVolume) < 0)) || (number !== null && (!Number.isFinite(number) || number < 0))) {
        change(draft.id, { status: "error", error: "Revise a obra, o volume e o número de capítulo." }); continue;
      }
      const path = `${ownerId}/${seriesId}/${draft.id}.${draft.file.name.split(".").pop()?.toLowerCase()}`;
      change(draft.id, { status: "uploading", percent: 0, error: "" });
      let uploaded = false;
      try {
        const duplicate = await supabase().from("books").select("id").eq("series_id", seriesId).eq("original_filename", draft.file.name).limit(1);
        if (duplicate.error) throw duplicate.error;
        if (duplicate.data?.length) throw new Error("Já existe um arquivo com este nome nesta obra.");
        const media = await uploadBatchFile(draft.file, path, percent => change(draft.id, { percent })); uploaded = true;
        let targetVolume = volumeId && volumeId !== "new" ? volumeId : null;
        if (volumeId === "new") {
          const existing = availableVolumes.find(item => item.volume_number === Number(newVolume));
          targetVolume = existing?.id || null;
          if (!targetVolume) {
            const { data, error: volumeError } = await supabase().from("volumes").insert({ owner_id: ownerId, series_id: seriesId, volume_number: Number(newVolume), sort_order: Number(newVolume) * 1000 }).select("id").single();
            if (volumeError || !data) throw volumeError || new Error("Não foi possível criar o volume.");
            targetVolume = data.id;
          }
        }
        const title = draft.title.trim() || draft.file.name;
        const { error: insertError } = await supabase().from("books").insert({ owner_id: ownerId, series_id: seriesId, volume_id: targetVolume, title, chapter_title: title, chapter_number: number, sort_order: number === null ? 0 : Number(number) * 1000, original_filename: draft.file.name, file_path: path, size_bytes: draft.file.size, media_type: media.mediaType, content_type: "chapter", skip_intro: false, intro_end: 90 });
        if (insertError) throw insertError;
        change(draft.id, { status: "done", percent: 100 }); anySuccess = true;
      } catch (cause) {
        if (uploaded) await supabase().storage.from(BUCKET).remove([path]);
        change(draft.id, { status: "error", error: cause instanceof Error ? cause.message : "Falha no envio." });
      }
    }
    if (anySuccess) await onComplete();
    setRunning(false);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !running) onClose(); }}><section className="form-modal batch-upload-modal" role="dialog" aria-modal="true" aria-labelledby="batch-upload-title">
    <button className="modal-close" onClick={onClose} disabled={running} aria-label="Fechar"><X size={19}/></button><span className="eyebrow">Acrescentar ao acervo</span><h2 id="batch-upload-title">Adicionar arquivos em lote</h2><p>Selecione uma obra e um volume, depois confira a ordem de cada arquivo antes do envio.</p>
    <div className="batch-destination"><label>Obra<select required value={seriesId} onChange={event => { setSeriesId(event.target.value); setVolumeId(""); }} disabled={running}><option value="">Escolha uma obra</option>{series.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Volume<select value={volumeId} onChange={event => setVolumeId(event.target.value)} disabled={!seriesId || running}><option value="">Sem volume</option>{availableVolumes.map(item => <option key={item.id} value={item.id}>{item.volume_number !== null ? `Volume ${item.volume_number}` : item.title || "Volume"}</option>)}<option value="new">Criar volume…</option></select></label>{volumeId === "new" && <label>Número do novo volume<input type="number" min="0" step="any" value={newVolume} onChange={event => setNewVolume(event.target.value)} disabled={running}/></label>}</div>
    <div className={`batch-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}><UploadCloud size={25}/><strong>Arraste os arquivos aqui</strong><span>PDF, CBZ e MP4 · você pode misturar formatos</span><button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={running}>Selecionar arquivos</button><input ref={inputRef} type="file" multiple accept=".pdf,.cbz,.mp4,application/pdf,application/zip,video/mp4" onChange={event => { if (event.target.files) addFiles(event.target.files); }} disabled={running}/></div>
    {error && <p className="error" role="alert">{error}</p>}
    {drafts.length > 0 && <><div className="batch-summary"><span>{completed === drafts.length ? `${completed} de ${drafts.length} arquivos adicionados com sucesso` : failures && !running ? `${completed} enviados · ${failures} com erro · ${overallPercent}%` : `${completed} de ${drafts.length} enviados · ${overallPercent}%`}</span><div className="upload-track"><div style={{ width: `${overallPercent}%` }}/></div></div><div className="batch-list">{drafts.map((draft, index) => <article key={draft.id} className="batch-item"><header><strong>{index + 1}. {draft.file.name}</strong><span className={`batch-status status-${draft.status}`}>{draft.status === "done" ? <><Check size={14}/> Enviado</> : draft.status === "uploading" ? `Enviando ${draft.percent}%` : draft.status === "error" ? "Falhou" : "Aguardando"}</span></header><div className="batch-file-meta"><span>{draft.file.name.split(".").pop()?.toUpperCase()}</span><span>{(draft.file.size / 1024 / 1024).toFixed(1)} MB</span></div><div className="batch-fields"><label>Ordem / capítulo<input type="number" min="0" step="any" value={draft.chapterNumber} onChange={event => change(draft.id, { chapterNumber: event.target.value })} disabled={running || draft.status === "done"}/></label><label>Título<input value={draft.title} onChange={event => change(draft.id, { title: event.target.value })} disabled={running || draft.status === "done"}/></label></div>{draft.status === "uploading" && <div className="upload-track"><div style={{ width: `${draft.percent}%` }}/></div>}{draft.error && <p className="batch-error" role="alert">{draft.error}</p>}<div className="batch-item-actions">{draft.status === "error" && <button onClick={() => void process([draft])} disabled={running}><RotateCcw size={14}/> Tentar novamente</button>}{draft.status !== "done" && !running && <button onClick={() => setDrafts(previous => previous.filter(item => item.id !== draft.id))}>Remover</button>}</div></article>)}</div><div className="batch-actions"><button className="secondary-button" onClick={onClose} disabled={running}>Fechar</button><button className="primary-button" onClick={() => void process(drafts.filter(item => item.status !== "done"))} disabled={running || !seriesId || !drafts.some(item => item.status !== "done")}>{running ? "Enviando…" : `Adicionar ${drafts.filter(item => item.status !== "done").length} arquivos`}</button></div></>}
  </section></div>;
}
