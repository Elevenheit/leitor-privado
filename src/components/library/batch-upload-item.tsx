"use client";

import { Check, RotateCcw } from "lucide-react";
import type { BatchDraft } from "@/lib/batch-upload";

export function BatchUploadItem({ draft, index, running, onChange, onRetry, onRemove }: {
  draft: BatchDraft;
  index: number;
  running: boolean;
  onChange: (update: Partial<BatchDraft>) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  return <article className="batch-item">
    <header>
      <strong>{index + 1}. {draft.file.name}</strong>
      <span className={`batch-status status-${draft.status}`}>
        {draft.status === "done" ? <><Check size={14}/> Enviado</> : draft.status === "uploading" ? `Enviando ${draft.percent}%` : draft.status === "error" ? "Falhou" : "Aguardando"}
      </span>
    </header>
    <div className="batch-file-meta"><span>{draft.file.name.split(".").pop()?.toUpperCase()}</span><span>{(draft.file.size / 1024 / 1024).toFixed(1)} MB</span></div>
    <div className="batch-fields">
      <label>Ordem / capitulo<input type="number" min="0" step="any" value={draft.chapterNumber} onChange={event => onChange({ chapterNumber: event.target.value })} disabled={running || draft.status === "done"}/></label>
      <label>Titulo<input value={draft.title} onChange={event => onChange({ title: event.target.value })} disabled={running || draft.status === "done"}/></label>
    </div>
    {draft.status === "uploading" && <div className="upload-track"><div style={{ width: `${draft.percent}%` }}/></div>}
    {draft.error && <p className="batch-error" role="alert">{draft.error}</p>}
    <div className="batch-item-actions">
      {draft.status === "error" && <button onClick={onRetry} disabled={running}><RotateCcw size={14}/> Tentar novamente</button>}
      {draft.status !== "done" && !running && <button onClick={onRemove}>Remover</button>}
    </div>
  </article>;
}
