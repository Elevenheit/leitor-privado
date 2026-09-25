"use client";

import { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { suggestDraft, uploadBatchFile, type BatchDraft } from "@/lib/batch-upload";
import type { Series, Volume } from "@/lib/types";
import { findDuplicateBook, findOrCreateVolume, registerUploadedBook } from "@/lib/data/uploads";
import { toDataError } from "@/lib/data/errors";
import { BatchUploadItem } from "./batch-upload-item";

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
      try {
        await findDuplicateBook(seriesId, draft.file.name);
        let targetVolume = volumeId && volumeId !== "new" ? volumeId : null;
        if (volumeId === "new") {
          const existing = availableVolumes.find(item => item.volume_number === Number(newVolume));
          targetVolume = existing?.id || null;
          if (!targetVolume) {
            targetVolume = await findOrCreateVolume(ownerId, seriesId, Number(newVolume));
          }
        }
        const media = await uploadBatchFile(draft.file, path, percent => change(draft.id, { percent }));
        const title = draft.title.trim() || draft.file.name;
        await registerUploadedBook({ owner_id: ownerId, series_id: seriesId, volume_id: targetVolume, title, chapter_title: title, chapter_number: number, sort_order: number === null ? 0 : Number(number) * 1000, original_filename: draft.file.name, file_path: path, size_bytes: draft.file.size, media_type: media.mediaType, content_type: "chapter", skip_intro: false, intro_end: 90 });
        change(draft.id, { status: "done", percent: 100 }); anySuccess = true;
      } catch (cause) {
        const reported = toDataError(cause, "Falha no envio.");
        change(draft.id, { status: "error", error: reported.message });
      }
    }
    if (anySuccess) {
      try { await onComplete(); }
      catch (cause) { setError(toDataError(cause, "Os arquivos foram enviados, mas a lista não atualizou.").message); }
    }
    setRunning(false);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !running) onClose(); }}><section className="form-modal batch-upload-modal" role="dialog" aria-modal="true" aria-labelledby="batch-upload-title">
    <button className="modal-close" onClick={onClose} disabled={running} aria-label="Fechar"><X size={19}/></button><span className="eyebrow">Acrescentar ao acervo</span><h2 id="batch-upload-title">Adicionar arquivos em lote</h2><p>Selecione uma obra e um volume, depois confira a ordem de cada arquivo antes do envio.</p>
    <div className="batch-destination"><label>Obra<select required value={seriesId} onChange={event => { setSeriesId(event.target.value); setVolumeId(""); }} disabled={running}><option value="">Escolha uma obra</option>{series.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Volume<select value={volumeId} onChange={event => setVolumeId(event.target.value)} disabled={!seriesId || running}><option value="">Sem volume</option>{availableVolumes.map(item => <option key={item.id} value={item.id}>{item.volume_number !== null ? `Volume ${item.volume_number}` : item.title || "Volume"}</option>)}<option value="new">Criar volume…</option></select></label>{volumeId === "new" && <label>Número do novo volume<input type="number" min="0" step="any" value={newVolume} onChange={event => setNewVolume(event.target.value)} disabled={running}/></label>}</div>
    <div className={`batch-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}><UploadCloud size={25}/><strong>Arraste os arquivos aqui</strong><span>PDF, CBZ e MP4 · você pode misturar formatos</span><button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={running}>Selecionar arquivos</button><input ref={inputRef} type="file" multiple accept=".pdf,.cbz,.mp4,application/pdf,application/zip,video/mp4" onChange={event => { if (event.target.files) addFiles(event.target.files); }} disabled={running}/></div>
    {error && <p className="error" role="alert">{error}</p>}
    {drafts.length > 0 && <><div className="batch-summary"><span>{completed === drafts.length ? `${completed} de ${drafts.length} arquivos adicionados com sucesso` : failures && !running ? `${completed} enviados · ${failures} com erro · ${overallPercent}%` : `${completed} de ${drafts.length} enviados · ${overallPercent}%`}</span><div className="upload-track"><div style={{ width: `${overallPercent}%` }}/></div></div><div className="batch-list">{drafts.map((draft, index) => <BatchUploadItem key={draft.id} draft={draft} index={index} running={running} onChange={update => change(draft.id, update)} onRetry={() => void process([draft])} onRemove={() => setDrafts(previous => previous.filter(item => item.id !== draft.id))} />)}</div><div className="batch-actions"><button className="secondary-button" onClick={onClose} disabled={running}>Fechar</button><button className="primary-button" onClick={() => void process(drafts.filter(item => item.status !== "done"))} disabled={running || !seriesId || !drafts.some(item => item.status !== "done")}>{running ? "Enviando…" : `Adicionar ${drafts.filter(item => item.status !== "done").length} arquivos`}</button></div></>}
  </section></div>;
}
