"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Work = { id: string; title: string; format: "novel" | "manga" | "manhwa"; beta_visible: boolean; rights_note: string | null };
type Report = { comment_id: string; reason: string };

export function CatalogAccess({ ownerId }: { ownerId: string }) {
  const [works, setWorks] = useState<Work[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState("");
  const [rights, setRights] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const api = supabase();
    void Promise.all([
      api.from("series").select("id,title,format,beta_visible,rights_note").eq("owner_id", ownerId).order("title"),
      api.from("comment_reports").select("comment_id,reason").limit(50),
    ]).then(([series, flagged]) => {
      if (series.data) setWorks(series.data as Work[]);
      if (flagged.data) setReports(flagged.data);
    });
  }, [ownerId]);

  async function setVisibility(visible: boolean) {
    if (!selected || busy) return;
    if (visible && !rights.trim()) { setMessage("Informe a autorização de compartilhamento."); return; }
    setBusy(true);
    const result = await supabase().from("series").update(visible ? { beta_visible: true, rights_note: rights.trim() } : { beta_visible: false }).eq("id", selected).eq("owner_id", ownerId).select("id").single();
    if (result.error) setMessage("Não foi possível alterar o acesso à obra.");
    else {
      setWorks(rows => rows.map(row => row.id === selected ? { ...row, beta_visible: visible, rights_note: visible ? rights.trim() : row.rights_note } : row));
      setMessage(visible ? "Obra liberada aos convidados." : "Obra restrita à administração.");
    }
    setBusy(false);
  }

  return <details className="publisher">
    <summary>Autorização de compartilhamento e moderação</summary>
    <div className="profile-form">
      <label>Obra<select value={selected} onChange={event => {
        const work = works.find(item => item.id === event.target.value);
        setSelected(event.target.value);
        setRights(work?.rights_note || "");
      }}><option value="">Escolha uma obra</option>{works.map(work => <option key={work.id} value={work.id}>{work.title}</option>)}</select></label>
      <label>Autorização de compartilhamento<textarea value={rights} maxLength={1000} onChange={event => setRights(event.target.value)} placeholder="Origem da autorização ou licença" /></label>
      <div className="batch-actions">
        <button type="button" className="secondary-button" disabled={!selected || busy} onClick={() => void setVisibility(false)}>Restringir obra</button>
        <button type="button" className="secondary-button" disabled={!selected || !rights.trim() || busy} onClick={() => void setVisibility(true)}>Liberar obra autorizada</button>
      </div>
      <p role="status">{message}</p>
    </div>
    <h3>Denúncias (até 50)</h3>
    {reports.map(report => <div key={report.comment_id} className="comment">
      <p>{report.reason}</p>
      <button className="secondary-button" onClick={async () => {
        if (!confirm("Excluir o comentário denunciado?")) return;
        const result = await supabase().from("comments").delete().eq("id", report.comment_id);
        if (result.error) setMessage("Falha ao moderar.");
        else setReports(rows => rows.filter(item => item.comment_id !== report.comment_id));
      }}>Excluir comentário denunciado</button>
    </div>)}
  </details>;
}
