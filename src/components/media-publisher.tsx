"use client";
import { useEffect, useState } from "react";
import { supabase, BUCKET } from "@/lib/supabase";
import { formats, type Format } from "@/lib/catalog";
import type { Book, Series } from "@/lib/types";
export function MediaPublisher({ userId }: { userId: string }) {
  const [series, setSeries] = useState<Series[]>([]);
  const [seriesId, setSeriesId] = useState("");
  const [format, setFormat] = useState<Format>("novel");
  const [rights, setRights] = useState("");
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState(1);
  const [season, setSeason] = useState(1);
  const [skip, setSkip] = useState(false);
  const [end, setEnd] = useState(90);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [episodes, setEpisodes] = useState<Book[]>([]);
  const [reports, setReports] = useState<
    { comment_id: string; reason: string }[]
  >([]);
  useEffect(() => {
    void supabase()
      .from("series")
      .select("id,title,format")
      .order("title")
      .then(({ data }) => setSeries((data || []) as Series[]));
    void supabase()
      .from("comment_reports")
      .select("comment_id,reason")
      .limit(50)
      .then(({ data }) => setReports(data || []));
  }, []);
  useEffect(() => {
    if (seriesId)
      void supabase()
        .from("books")
        .select("*")
        .eq("series_id", seriesId)
        .eq("media_type", "video")
        .order("chapter_number")
        .then(({ data }) => setEpisodes(data || []));
  }, [seriesId]);
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !seriesId || !file) return;
    setBusy(true);
    setMessage("Enviando mídia…");
    let uploaded = "";
    try {
      const api = supabase();
      const type = format === "anime" ? "video" : "cbz";
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (
        type === "cbz" &&
        (extension !== "cbz" || file.size > 40 * 1024 * 1024)
      )
        throw Error("Use CBZ de até 40 MB.");
      if (
        type === "video" &&
        (!["mp4", "webm"].includes(extension || "") ||
          file.size > 500 * 1024 * 1024)
      )
        throw Error("Use MP4 ou WebM de até 500 MB.");
      const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (type === "cbz" && (bytes[0] !== 80 || bytes[1] !== 75))
        throw Error("CBZ inválido: não é um ZIP.");
      if (
        type === "video" &&
        extension === "mp4" &&
        new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp"
      )
        throw Error("MP4 inválido.");
      if (
        type === "video" &&
        extension === "webm" &&
        !(
          bytes[0] === 26 &&
          bytes[1] === 69 &&
          bytes[2] === 223 &&
          bytes[3] === 163
        )
      )
        throw Error("WebM inválido.");
      const existing = await api
        .from("books")
        .select("id")
        .eq("series_id", seriesId)
        .eq("original_filename", file.name)
        .limit(1);
      if (existing.error) throw existing.error;
      if (existing.data?.length)
        throw Error("Já existe um arquivo com este nome nesta obra.");
      let volumeId: string | null = null;
      if (type === "video") {
        const v = await api
          .from("volumes")
          .select("id")
          .eq("series_id", seriesId)
          .eq("volume_number", season)
          .maybeSingle();
        if (v.error) throw v.error;
        volumeId = v.data?.id || null;
        if (!volumeId) {
          const created = await api
            .from("volumes")
            .insert({
              owner_id: userId,
              series_id: seriesId,
              volume_number: season,
              title: `Temporada ${season}`,
              sort_order: season * 1000,
            })
            .select("id")
            .single();
          if (created.error) throw created.error;
          volumeId = created.data.id;
        }
      }
      const path = `${userId}/${seriesId}/${crypto.randomUUID()}.${extension}`;
      const r = await api.storage.from(BUCKET).upload(path, file, {
        contentType: type === "cbz" ? "application/zip" : `video/${extension}`,
      });
      if (r.error) throw r.error;
      uploaded = path;
      const row = await api.from("books").insert({
        owner_id: userId,
        series_id: seriesId,
        volume_id: volumeId,
        title: title.trim() || file.name,
        chapter_title: title.trim() || file.name,
        chapter_number: number,
        sort_order: season * 1000000 + number * 1000,
        original_filename: file.name,
        file_path: path,
        size_bytes: file.size,
        media_type: type,
        skip_intro: type === "video" && skip,
        intro_end: end,
      });
      if (row.error) throw row.error;
      uploaded = "";
      setMessage("Mídia publicada. Abra a obra para conferir a reprodução.");
      setFile(null);
    } catch (e) {
      let cleanup = "";
      if (uploaded) {
        const r = await supabase().storage.from(BUCKET).remove([uploaded]);
        if (r.error) cleanup = ` Limpeza pendente no Storage: ${uploaded}`;
      }
      setMessage(
        (e instanceof Error
          ? e.message
          : "Falha no envio; confira a conexão.") + cleanup,
      );
    } finally {
      setBusy(false);
    }
  }
  async function updateFormat() {
    const { error } = await supabase()
      .from("series")
      .update({ format })
      .eq("id", seriesId);
    setMessage(
      error ? "Não foi possível alterar o formato." : "Formato salvo.",
    );
    if (!error)
      setSeries((rows) =>
        rows.map((s) => (s.id === seriesId ? { ...s, format } : s)),
      );
  }
  return (
    <details className="publisher">
      <summary>Publicar mangá, manhwa ou anime · moderar conversa</summary>
      <form className="profile-form" onSubmit={publish}>
        <label>
          Obra
          <select
            required
            value={seriesId}
            onChange={(e) => {
              setSeriesId(e.target.value);
              setFormat(
                series.find((s) => s.id === e.target.value)?.format || "novel",
              );
            }}
          >
            <option value="">Escolha uma obra</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Formato
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
          >
            {Object.entries(formats).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={!seriesId || busy}
          onClick={() => void updateFormat()}
        >
          Salvar formato da obra
        </button>
        <label>
          Autorização de compartilhamento
          <textarea
            value={rights}
            maxLength={1000}
            placeholder="Origem da autorização ou licença da obra e da mídia"
            onChange={(e) => setRights(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={!seriesId || !rights.trim() || busy}
          onClick={async () => {
            const r = await supabase()
              .from("series")
              .update({ beta_visible: true, rights_note: rights.trim() })
              .eq("id", seriesId);
            setMessage(
              r.error
                ? "Falha ao liberar a obra."
                : "Obra liberada aos convidados.",
            );
          }}
        >
          Liberar obra autorizada aos convidados
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!seriesId || busy}
          onClick={async () => {
            const r = await supabase()
              .from("series")
              .update({ beta_visible: false })
              .eq("id", seriesId);
            setMessage(
              r.error
                ? "Falha ao restringir a obra."
                : "Obra restrita à administração. URLs já emitidas expiram em até uma hora.",
            );
          }}
        >
          Restringir obra à administração
        </button>
        <p>
          Salve o formato antes de enviar. PDFs individuais e em lote continuam
          nos controles do acervo.
        </p>
        {format !== "novel" && (
          <>
            <label>
              Título
              <input
                value={title}
                maxLength={300}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Número do capítulo ou episódio
              <input
                type="number"
                min="1"
                required
                value={number}
                onChange={(e) => setNumber(Number(e.target.value))}
              />
            </label>
            {format === "anime" && (
              <>
                <label>
                  Temporada
                  <input
                    type="number"
                    min="1"
                    required
                    value={season}
                    onChange={(e) => setSeason(Number(e.target.value))}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={skip}
                    onChange={(e) => setSkip(e.target.checked)}
                  />{" "}
                  Habilitar pular abertura
                </label>
                <label>
                  Destino em segundos (90–110)
                  <input
                    type="number"
                    min="90"
                    max="110"
                    value={end}
                    onChange={(e) => setEnd(Number(e.target.value))}
                  />
                </label>
              </>
            )}
            <label>
              Mídia autorizada
              <input
                type="file"
                required
                accept={format === "anime" ? ".mp4,.webm" : ".cbz"}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            {file && (
              <p>
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
            <button
              disabled={
                busy || series.find((s) => s.id === seriesId)?.format !== format
              }
              className="primary-button"
            >
              {busy ? "Enviando…" : "Publicar mídia"}
            </button>
          </>
        )}
      </form>
      <p role="status">{message}</p>
      {episodes.map((b) => (
        <div className="chapter-row" key={b.id}>
          <span>{b.title}</span>
          <label>
            Abertura{" "}
            <input
              type="checkbox"
              defaultChecked={b.skip_intro}
              onChange={async (e) => {
                const r = await supabase()
                  .from("books")
                  .update({ skip_intro: e.target.checked })
                  .eq("id", b.id);
                setMessage(
                  r.error
                    ? "Falha ao salvar abertura."
                    : "Abertura atualizada.",
                );
              }}
            />
          </label>
          <label>
            Destino{" "}
            <input
              aria-label={`Destino de abertura: ${b.title}`}
              type="number"
              min="90"
              max="110"
              defaultValue={b.intro_end}
              onBlur={async (e) => {
                const v = Number(e.target.value);
                if (v < 90 || v > 110) {
                  setMessage("Use 90 a 110 segundos.");
                  return;
                }
                const r = await supabase()
                  .from("books")
                  .update({ intro_end: v })
                  .eq("id", b.id);
                setMessage(
                  r.error ? "Falha ao salvar destino." : "Destino atualizado.",
                );
              }}
            />
          </label>
        </div>
      ))}
      <h3>Denúncias (até 50)</h3>
      {reports.map((r, i) => (
        <div key={`${r.comment_id}-${i}`} className="comment">
          <p>{r.reason}</p>
          <button
            className="secondary-button"
            onClick={async () => {
              if (!confirm("Excluir o comentário denunciado?")) return;
              const result = await supabase()
                .from("comments")
                .delete()
                .eq("id", r.comment_id);
              if (result.error) setMessage("Falha ao moderar.");
              else
                setReports((rows) =>
                  rows.filter((x) => x.comment_id !== r.comment_id),
                );
            }}
          >
            Excluir comentário denunciado
          </button>
        </div>
      ))}
    </details>
  );
}
