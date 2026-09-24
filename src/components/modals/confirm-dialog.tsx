"use client";

import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Excluir",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="form-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <button className="modal-close" type="button" onClick={onCancel} disabled={busy} aria-label="Fechar"><X size={18}/></button>
      <div className="confirm-icon"><AlertTriangle size={20}/></div>
      <span className="eyebrow">Confirmação necessária</span>
      <h2 id="confirm-dialog-title">{title}</h2>
      <p id="confirm-dialog-message">{message}</p>
      <div className="confirm-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="danger-button" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Excluindo…" : confirmLabel}</button></div>
    </section>
  </div>;
}
