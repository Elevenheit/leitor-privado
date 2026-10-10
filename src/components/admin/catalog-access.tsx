"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Series } from "@/lib/types";
import { SeriesPicker } from "./library-picker";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";

type Report = { comment_id: string; reason: string };
export function CatalogAccess({
  ownerId,
  onChanged,
}: {
  ownerId: string;
  onChanged?: () => Promise<void>;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [work, setWork] = useState<Series | null>(null);
  const [rights, setRights] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const operation = useRef(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.resolve(
      supabase()
        .from("comment_reports")
        .select("comment_id,reason")
        .order("created_at", { ascending: false })
        .limit(50),
    )
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setMessage("Não foi possível carregar as denúncias.");
        else setReports(data || []);
      })
      .catch(() => {
        if (live) setMessage("Não foi possível carregar as denúncias.");
      });
    return () => {
      live = false;
    };
  }, [ownerId, open, attempt]);
  async function setVisibility(visible: boolean) {
    if (!work || operation.current) return;
    if (visible && !rights.trim()) {
      setMessage("Informe a autorização de compartilhamento.");
      return;
    }
    operation.current = true;
    setBusy(true);
    const selected = work;
    try {
      const result = await supabase()
        .from("series")
        .update(
          visible
            ? { beta_visible: true, rights_note: rights.trim() }
            : { beta_visible: false },
        )
        .eq("id", selected.id)
        .eq("owner_id", ownerId)
        .select("id")
        .single();
      if (result.error) throw result.error;
      setWork({
        ...selected,
        beta_visible: visible,
        rights_note: visible ? rights.trim() : selected.rights_note,
      });
      setMessage(
        visible
          ? "Obra publicada para os leitores."
          : "Obra restrita à administração.",
      );
      setConfirmRelease(false);
      await onChanged?.();
    } catch {
      setMessage(
        "Não foi possível alterar o acesso à obra. Confira a conexão e tente novamente.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      className="publisher"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Autorização de compartilhamento e moderação</summary>
      {open && (
        <>
          <div className="profile-form">
            <SeriesPicker
              ownerId={ownerId}
              value={work}
              disabled={busy}
              onChange={(item) => {
                setWork(item);
                setRights(item?.rights_note || "");
                setMessage("");
              }}
            />
            {work && (
              <p className="publication-state">
                <span className="visibility-badge">
                  {work.beta_visible ? "Publicada" : "Restrita à administração"}
                </span>{" "}
                <Link href={`/series/${work.id}`}>Prévia da leitura →</Link>
              </p>
            )}
            <label>
              Autorização de compartilhamento
              <textarea
                value={rights}
                disabled={!work || busy}
                maxLength={1000}
                onChange={(event) => setRights(event.target.value)}
                placeholder="Origem da autorização ou licença"
              />
            </label>
            <div className="batch-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!work?.beta_visible || busy}
                onClick={() => void setVisibility(false)}
              >
                Restringir obra
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!work || !rights.trim() || busy}
                onClick={() => setConfirmRelease(true)}
              >
                Liberar obra autorizada
              </button>
            </div>
            <p role="status">{message}</p>
          </div>
          <h3>Denúncias recentes (até 50)</h3>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Atualizar denúncias
          </button>
          {!reports.length && (
            <p className="muted">Nenhuma denúncia carregada.</p>
          )}
          {reports.map((report) => (
            <div key={report.comment_id} className="comment">
              <p>{report.reason}</p>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={async () => {
                  if (
                    operation.current ||
                    !confirm("Excluir o comentário denunciado?")
                  )
                    return;
                  operation.current = true;
                  setBusy(true);
                  try {
                    const result = await supabase()
                      .from("comments")
                      .delete()
                      .eq("id", report.comment_id);
                    if (result.error) throw result.error;
                    setReports((rows) =>
                      rows.filter(
                        (item) => item.comment_id !== report.comment_id,
                      ),
                    );
                  } catch {
                    setMessage("Falha ao moderar. Tente novamente.");
                  } finally {
                    operation.current = false;
                    setBusy(false);
                  }
                }}
              >
                Excluir comentário denunciado
              </button>
            </div>
          ))}
          {confirmRelease && work && (
            <ConfirmDialog
              title={`Liberar ${work.title}?`}
              message="A obra e seus arquivos ficarão acessíveis aos leitores. Confirme que a autorização informada permite esse compartilhamento."
              confirmLabel="Liberar aos leitores"
              busy={busy}
              onCancel={() => setConfirmRelease(false)}
              onConfirm={() => void setVisibility(true)}
            />
          )}
        </>
      )}
    </details>
  );
}
