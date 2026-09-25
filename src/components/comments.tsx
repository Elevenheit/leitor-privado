/* eslint-disable @next/next/no-img-element -- Private signed avatars avoid proxying through Render. */
"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { deleteComment, listComments, reportComment, saveComment } from "@/lib/data/comments";
import { toDataError } from "@/lib/data/errors";
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
    try {
      const comments = await listComments(seriesId, page);
      const identities = await supabase().from("profile_identities").select("id,nickname,avatar,avatar_path").in("id", [...new Set(comments.map((comment) => comment.owner_id))]);
      if (identities.error) throw identities.error;
      const profiles = await Promise.all((identities.data || []).map(async (profile) => ({
        ...profile,
        avatar_url: profile.avatar_path ? (await supabase().storage.from("profiles").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl : undefined,
      })));
      setRows(comments.map((comment) => ({ ...comment, profiles: profiles.find((profile) => profile.id === comment.owner_id) || null })));
      setError("");
    } catch (cause) {
      setError(toDataError(cause, "Conversation could not be loaded.").message);
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
      await saveComment({ series_id: seriesId, owner_id: userId, body: body.trim(), spoiler, parent_id: reply }, editing || undefined);
      setBody("");
      setEditing(null);
      setReply(null);
      await load();
    } catch (cause) {
      setError(toDataError(cause, "Could not publish comment. Wait 15 seconds and retry.").message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!confirm("Excluir este comentario?")) return;
    try { await deleteComment(id); await load(); }
    catch (cause) { setError(toDataError(cause, "Nao foi possivel excluir.").message); }
  }
  async function report(id: string) {
    const reason = prompt("Por que deseja denunciar? (3 a 500 caracteres)");
    if (!reason || reason.trim().length < 3) return;
    try {
      await reportComment(id, userId, reason.trim().slice(0, 500));
      setError("Denuncia enviada para a administracao.");
    } catch (cause) {
      setError(toDataError(cause, "Denuncia ja enviada ou falha de conexao.").message);
    }
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
