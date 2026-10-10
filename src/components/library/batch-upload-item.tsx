"use client";

import { Check, RotateCcw, X } from "lucide-react";
import type { BatchDraft } from "@/lib/batch-upload";

export function BatchUploadItem({ draft, index, running, onChange, onRetry, onRemove, onCancel }: {
  draft: BatchDraft;
  index: number;
  running: boolean;
  onChange: (update: Partial<BatchDraft>) => void;
  onRetry: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  return <article className="batch-item">
    <header>
      <strong>{index + 1}. {draft.file.name}</strong>
      <span className={`batch-status status-${draft.status}`}>
        {draft.status === "done" ? <><Check size={14}/> Enviado</> : draft.status === "uploading" ? `Enviando ${draft.percent}%` : draft.status === "registering" ? "Salvando no catálogo" : draft.status === "error" ? "Falhou" : draft.status === "cancelled" ? "Cancelado" : "Aguardando"}
      </span>
    </header>
    <div className="batch-file-meta"><span>{draft.file.name.split(".").pop()?.toUpperCase()}</span><span>{(draft.file.size / 1024 / 1024).toFixed(1)} MB</span></div>
    <div className="batch-fields">
      <label>Ordem / capitulo<input type="number" min="0" step="any" value={draft.chapterNumber} onChange={event => onChange({ chapterNumber: event.target.value })} disabled={running || draft.status === "done"}/></label>
      <label>Titulo<input value={draft.title} onChange={event => onChange({ title: event.target.value })} disabled={running || draft.status === "done"}/></label>
      <label>Tipo<select value={draft.mediaType} onChange={event => onChange({ mediaType: event.target.value as BatchDraft["mediaType"] })} disabled={running || draft.status === "done"}><option value="pdf">Light Novel</option><option value="cbz">Mangá / Manhwa</option></select></label>
    </div>
    {draft.status === "uploading" && <div className="upload-track"><div style={{ width: `${draft.percent}%` }}/></div>}
    {draft.error && <p className="batch-error" role="alert">{draft.error}</p>}
    <div className="batch-item-actions">
      {(draft.status === "error" || draft.status === "cancelled") && <button onClick={onRetry} disabled={running}><RotateCcw size={14}/> Tentar novamente</button>}
      {draft.status === "uploading" && <button onClick={onCancel} aria-label={`Cancelar envio de ${draft.file.name}`}><X size={14}/> Cancelar</button>}
      {!['done', 'uploading', 'registering'].includes(draft.status) && !running && <button onClick={onRemove}>Remover</button>}
    </div>
  </article>;
}
