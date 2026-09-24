"use client";

import { useRef, useState } from "react";
import { Check, RotateCcw, UploadCloud, X } from "lucide-react";
import { suggestDraft, uploadBatchPdf, type BatchDraft } from "@/lib/batch-upload";
import { BUCKET, supabase } from "@/lib/supabase";
import type { Series, Volume } from "@/lib/types";

export function BatchUploadModal({ ownerId, series, volumes, onClose, onComplete }: {
  ownerId: string;
  series: Series[];
  volumes: Volume[];
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<BatchDraft[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const createdVolumes = useRef(new Map<string, string>());
  const completed = drafts.filter(draft => draft.status === "done").length;
  const overallPercent = drafts.length ? Math.round(drafts.reduce((total, draft) => total + (draft.status === "done" ? 100 : draft.status === "uploading" ? draft.percent : 0), 0) / drafts.length) : 0;

  function addFiles(files: FileList | File[]) {
    const items = Array.from(files);
    const valid = items.filter(file => file.name.toLowerCase().endsWith(".pdf"));
    if (valid.length !== items.length) setError("Arquivos que não são PDF foram ignorados.");
    setDrafts(previous => [...previous, ...valid.map(file => suggestDraft(file, series, volumes))]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function change(id: string, update: Partial<BatchDraft>) {
    setDrafts(previous => previous.map(item => item.id === id ? { ...item, ...update } : item));
  }

  async function process(items: BatchDraft[]) {
    if (running) return;
    setRunning(true); setError("");
    let anySuccess = false;
    for (const draft of items) {
      if (draft.status === "done") continue;
      const seriesItem = series.find(item => item.id === draft.seriesId);
      const existingVolume = volumes.find(item => item.id === draft.volumeId && item.series_id === draft.seriesId);
      if (draft.seriesId && !seriesItem || draft.volumeId && draft.volumeId !== "new" && !existingVolume || draft.volumeId === "new" && (!draft.seriesId || !draft.volumeNumber || !Number.isFinite(Number(draft.volumeNumber)) || Number(draft.volumeNumber) < 0)) {
        change(draft.id, { status: "error", error: "Revise a obra e o volume selecionados." });
        continue;
      }
      if (draft.chapterNumber && (!Number.isFinite(Number(draft.chapterNumber)) || Number(draft.chapterNumber) < 0)) {
        change(draft.id, { status: "error", error: "Número do capítulo inválido." });
        continue;
      }
      const path = `${ownerId}/batch/${draft.id}.pdf`;
      change(draft.id, { status: "uploading", percent: 0, error: "" });
      try {
        await uploadBatchPdf(draft.file, path, percent => change(draft.id, { percent }));
        let volumeId: string | null = existingVolume?.id || null;
        if (draft.volumeId === "new") {
          const key = `${draft.seriesId}:${draft.volumeNumber}`;
          volumeId = createdVolumes.current.get(key) || volumes.find(item => item.series_id === draft.seriesId && item.volume_number === Number(draft.volumeNumber))?.id || null;
          if (!volumeId) {
            const number = Number(draft.volumeNumber);
            const { data, error: volumeError } = await supabase().from("volumes").insert({ owner_id: ownerId, series_id: draft.seriesId, volume_number: number, sort_order: Math.round(number * 1000) }).select("id").single();
            if (volumeError || !data) throw volumeError || new Error("Não foi possível criar o volume.");
            volumeId = data.id as string; createdVolumes.current.set(key, data.id as string);
          }
        }
        const chapterNumber = draft.chapterNumber ? Number(draft.chapterNumber) : null;
        const title = draft.title.trim() || draft.file.name.replace(/\.pdf$/i, "");
        const { error: insertError } = await supabase().from("books").insert({ owner_id: ownerId, title, original_filename: draft.file.name, file_path: path, size_bytes: draft.file.size, series_id: draft.seriesId || null, volume_id: volumeId, chapter_number: chapterNumber, chapter_title: draft.title.trim() || null, sort_order: chapterNumber !== null ? Math.round(chapterNumber * 1000) : 0, content_type: draft.contentType });
        if (insertError) throw insertError;
        change(draft.id, { status: "done", percent: 100 });
        anySuccess = true;
      } catch (cause) {
        await supabase().storage.from(BUCKET).remove([path]);
        change(draft.id, { status: "error", error: cause instanceof Error ? cause.message : "Falha no envio." });
      }
    }
    if (anySuccess) await onComplete();
    setRunning(false);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !running) onClose(); }}><section className="form-modal batch-upload-modal" role="dialog" aria-modal="true" aria-labelledby="batch-upload-title">
    <button className="modal-close" onClick={onClose} disabled={running} aria-label="Fechar"><X size={19}/></button><span className="eyebrow">Acrescentar ao acervo</span><h2 id="batch-upload-title">Adicionar vários PDFs</h2><p>Confira as sugestões de cada arquivo antes de enviar. Nenhum item é salvo automaticamente.</p>
    <label className="batch-picker"><UploadCloud size={18}/> Selecionar PDFs<input ref={inputRef} type="file" multiple accept=".pdf,application/pdf" onChange={event => { if (event.target.files) addFiles(event.target.files); }} disabled={running}/></label>
    {error && <p className="error" role="alert">{error}</p>}
    {drafts.length > 0 && <><div className="batch-summary"><span>{completed} de {drafts.length} enviados</span><div className="upload-track"><div style={{ width: `${overallPercent}%` }}/></div></div><div className="batch-list">{drafts.map((draft, index) => <article key={draft.id} className="batch-item"><header><strong>{index + 1}. {draft.file.name}</strong><span className={`batch-status status-${draft.status}`}>{draft.status === "done" ? <><Check size={14}/> Enviado</> : draft.status === "uploading" ? `Enviando ${draft.percent}%` : draft.status === "error" ? "Falhou" : "Aguardando"}</span></header><div className="batch-fields"><label>Obra<select value={draft.seriesId} onChange={event => { const seriesId = event.target.value; const matched = volumes.find(item => item.series_id === seriesId && item.volume_number === Number(draft.volumeNumber)); change(draft.id, { seriesId, volumeId: matched?.id || (seriesId && draft.volumeNumber ? "new" : "") }); }} disabled={running || draft.status === "done"}><option value="">Sem coleção</option>{series.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Volume<select value={draft.volumeId} onChange={event => change(draft.id, { volumeId: event.target.value })} disabled={!draft.seriesId || running || draft.status === "done"}><option value="">Sem volume</option>{volumes.filter(item => item.series_id === draft.seriesId).map(item => <option key={item.id} value={item.id}>{item.volume_number !== null ? `Volume ${item.volume_number}` : item.title || "Volume"}</option>)}<option value="new">Criar volume…</option></select></label>{draft.volumeId === "new" && <label>Número do volume<input type="number" min="0" step="any" value={draft.volumeNumber} onChange={event => change(draft.id, { volumeNumber: event.target.value })} disabled={running || draft.status === "done"}/></label>}<label>Capítulo<input type="number" min="0" step="any" value={draft.chapterNumber} onChange={event => change(draft.id, { chapterNumber: event.target.value })} disabled={running || draft.status === "done"}/></label><label>Título<input value={draft.title} onChange={event => change(draft.id, { title: event.target.value })} disabled={running || draft.status === "done"}/></label><label>Tipo<select value={draft.contentType} onChange={event => change(draft.id, { contentType: event.target.value as BatchDraft["contentType"] })} disabled={running || draft.status === "done"}><option value="chapter">Capítulo</option><option value="volume">Volume completo</option></select></label></div>{draft.status === "uploading" && <div className="upload-track"><div style={{ width: `${draft.percent}%` }}/></div>}{draft.error && <p className="batch-error" role="alert">{draft.error}</p>}<div className="batch-item-actions">{draft.status === "error" && <button onClick={() => void process([draft])} disabled={running}><RotateCcw size={14}/> Tentar novamente</button>}{draft.status !== "done" && !running && <button onClick={() => setDrafts(previous => previous.filter(item => item.id !== draft.id))}>Remover</button>}</div></article>)}</div><div className="batch-actions"><button className="secondary-button" onClick={onClose} disabled={running}>Fechar</button><button className="primary-button" onClick={() => void process(drafts.filter(item => item.status !== "done"))} disabled={running || completed === drafts.length}>{running ? "Enviando…" : `Enviar ${drafts.length - completed} PDF${drafts.length - completed === 1 ? "" : "s"}`}</button></div></>}
  </section></div>;
}
