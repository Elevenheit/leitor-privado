/* eslint-disable @next/next/no-img-element -- Private signed avatars avoid proxying through Render. */
"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
type Comment = {
  id: string;
  owner_id: string;
  body: string;
  spoiler: boolean;
  parent_id: string | null;
  created_at: string;
  profiles: { nickname: string; avatar: string; avatar_url?: string } | null;
};
export function Comments({
  seriesId,
  userId,
}: {
  seriesId: string;
  userId: string;
}) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(false);
  const load = useCallback(async () => {
    const r = await supabase()
      .from("comments")
      .select("id,owner_id,body,spoiler,parent_id,created_at")
      .eq("series_id", seriesId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 20, page * 20 + 19);
    if (r.error) setError("A conversa não carregou. Tente atualizar.");
    else {
      const identities = await supabase()
        .from("profile_identities")
        .select("id,nickname,avatar,avatar_path")
        .in("id", [...new Set((r.data || []).map((c) => c.owner_id))]);
      const profiles = await Promise.all(
        (identities.data || []).map(async (p) => ({
          ...p,
          avatar_url: p.avatar_path
            ? (
                await supabase()
                  .storage.from("profiles")
                  .createSignedUrl(p.avatar_path, 3600)
              ).data?.signedUrl
            : undefined,
        })),
      );
      setRows(
        (r.data || []).map((c) => ({
          ...c,
          profiles: profiles.find((p) => p.id === c.owner_id) || null,
        })),
      );
    }
  }, [seriesId, page]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => void load(), 0);
    async function checkAdmin() {
      try {
        const api = supabase();
        const { data: session } = await api.auth.getSession();
        const currentUserId = session.session?.user.id;
        if (!currentUserId) return;
        const { data: access } = await api
          .from("beta_access")
          .select("role, expires_at, revoked")
          .eq("user_id", currentUserId)
          .maybeSingle();
        const expiry = access?.expires_at;
        const expiryTime = expiry ? Date.parse(expiry) : Number.NaN;
        const active =
          access?.revoked === false &&
          (expiry === "infinity" ||
            (Number.isFinite(expiryTime) && expiryTime > Date.now()));
        if (live) setAdmin(active && access?.role === "admin");
      } catch {
        if (live) setAdmin(false);
      }
    }
    void checkAdmin();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [load]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = editing
        ? await supabase()
            .from("comments")
            .update({ body: body.trim(), spoiler })
            .eq("id", editing)
            .eq("owner_id", userId)
        : await supabase().from("comments").insert({
            series_id: seriesId,
            owner_id: userId,
            body: body.trim(),
            spoiler,
            parent_id: reply,
          });
      if (r.error) throw r.error;
      setBody("");
      setEditing(null);
      setReply(null);
      await load();
    } catch {
      setError(
        "Não foi possível publicar. Espere 15 segundos e confira sua conexão.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!confirm("Excluir este comentário?")) return;
    const { error } = await supabase().from("comments").delete().eq("id", id);
    if (error) setError("Não foi possível excluir.");
    else await load();
  }
  async function report(id: string) {
    const reason = prompt("Por que deseja denunciar? (3 a 500 caracteres)");
    if (!reason || reason.trim().length < 3) return;
    const { error } = await supabase()
      .from("comment_reports")
      .insert({
        comment_id: id,
        owner_id: userId,
        reason: reason.trim().slice(0, 500),
      });
    setError(
      error
        ? "Denúncia já enviada ou falha de conexão."
        : "Denúncia enviada para a administração.",
    );
  }
  return (
    <section className="conversation">
      <span className="eyebrow">Entre leitores</span>
      <h2>A conversa continua aqui.</h2>
      <form onSubmit={submit} className="profile-form">
        {(reply || editing) && (
          <p>
            {editing ? "Editando comentário" : "Respondendo ao comentário"}{" "}
            <button
              type="button"
              onClick={() => {
                setReply(null);
                setEditing(null);
                setBody("");
              }}
            >
              Cancelar
            </button>
          </p>
        )}
        <label>
          Seu comentário
          <textarea
            required
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={spoiler}
            onChange={(e) => setSpoiler(e.target.checked)}
          />{" "}
          Contém spoiler
        </label>
        <button className="primary-button" disabled={busy}>
          {busy ? "Salvando…" : editing ? "Salvar edição" : "Publicar"}
        </button>
      </form>
      {error && <p role="status">{error}</p>}
      <button className="secondary-button" onClick={() => void load()}>
        Atualizar conversa
      </button>
      {rows.map((c) => (
        <article className={`comment ${c.parent_id ? "reply" : ""}`} key={c.id}>
          <header>
            <span className="avatar">
              {c.profiles?.avatar_url ? (
                <img
                  src={c.profiles.avatar_url}
                  alt=""
                  width={40}
                  height={40}
                />
              ) : (
                c.profiles?.avatar || "✦"
              )}
            </span>
            <strong>{c.profiles?.nickname || "leitor"}</strong>
            <time dateTime={c.created_at}>
              {new Date(c.created_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {new Date(c.created_at).toDateString() !==
                new Date().toDateString() && (
                <small>
                  {" "}
                  · {new Date(c.created_at).toLocaleDateString("pt-BR")}
                </small>
              )}
            </time>
          </header>
          {c.parent_id && <small>Resposta a um comentário</small>}
          {c.spoiler ? (
            <details>
              <summary>Mostrar spoiler</summary>
              <p>{c.body}</p>
            </details>
          ) : (
            <p>{c.body}</p>
          )}
          <div className="comment-actions">
            {!c.parent_id && (
              <button
                onClick={() => {
                  setReply(c.id);
                  setEditing(null);
                }}
              >
                Responder
              </button>
            )}
            {c.owner_id === userId && (
              <button
                onClick={() => {
                  setEditing(c.id);
                  setBody(c.body);
                  setSpoiler(c.spoiler);
                  setReply(null);
                }}
              >
                Editar
              </button>
            )}
            {(c.owner_id === userId || admin) && (
              <button onClick={() => void remove(c.id)}>
                {admin && c.owner_id !== userId
                  ? "Moderar: excluir"
                  : "Excluir"}
              </button>
            )}
            <button onClick={() => void report(c.id)}>Denunciar</button>
          </div>
        </article>
      ))}
      {!rows.length && (
        <p className="muted">Seja a primeira pessoa a abrir a conversa.</p>
      )}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>{page + 1}</span>
        <button disabled={rows.length < 20} onClick={() => setPage(page + 1)}>
          Próxima
        </button>
      </div>
    </section>
  );
}
