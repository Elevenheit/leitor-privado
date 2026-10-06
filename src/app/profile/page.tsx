/* eslint-disable @next/next/no-img-element -- Private profile images use signed URLs directly. */
"use client";
import { useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { supabase } from "@/lib/supabase";
import { replaceStorageReference } from "@/lib/data/uploads";
import { toDataError } from "@/lib/data/errors";
import { patchProfileSettings } from "@/lib/data/preferences";
import {
  normalizeReaderPreferences,
  type ReaderPreferences,
} from "@/lib/reader-preferences";
export default function Page() {
  return <AuthGate>{(u) => <Profile key={u.id} id={u.id} />}</AuthGate>;
}
function Profile({ id }: { id: string }) {
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("✦");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [theme, setTheme] = useState("dark");
  const [fontSize, setFontSize] = useState(22);
  const [fontFamily, setFontFamily] = useState("serif");
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const initialPreferences = useRef(normalizeReaderPreferences(null));
  useEffect(() => {
    let live = true;
    void Promise.resolve(
      supabase()
        .from("profiles")
        .select(
          "nickname,display_name,bio,avatar,avatar_path,banner_path,preferences",
        )
        .eq("id", id)
        .single(),
    )
      .then(async ({ data, error }) => {
        if (!live) return;
        if (error) setMessage("Não foi possível abrir seu perfil.");
        if (data) {
          setNickname(data.nickname);
          setName(data.display_name);
          setBio(data.bio);
          setAvatar(data.avatar);
          const prefs = normalizeReaderPreferences(data.preferences);
          initialPreferences.current = prefs;
          setTheme(prefs.theme);
          setFontSize(prefs.fontSize);
          setFontFamily(prefs.fontFamily);
          setReady(true);
          setMessage("");
          if (data.avatar_path) {
            const url =
              (
                await supabase()
                  .storage.from("profiles")
                  .createSignedUrl(data.avatar_path, 3600)
              ).data?.signedUrl || "";
            if (live) setAvatarUrl(url);
          }
          if (data.banner_path) {
            const url =
              (
                await supabase()
                  .storage.from("profiles")
                  .createSignedUrl(data.banner_path, 3600)
              ).data?.signedUrl || "";
            if (live) setBannerUrl(url);
          }
        }
      })
      .catch(() => {
        if (live) setMessage("Não foi possível abrir seu perfil.");
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    try {
      const prefs = normalizeReaderPreferences({ theme, fontSize, fontFamily });
      const patch: Partial<ReaderPreferences> = {};
      if (prefs.theme !== initialPreferences.current.theme)
        patch.theme = prefs.theme;
      if (prefs.fontSize !== initialPreferences.current.fontSize)
        patch.fontSize = prefs.fontSize;
      if (prefs.fontFamily !== initialPreferences.current.fontFamily)
        patch.fontFamily = prefs.fontFamily;
      initialPreferences.current = await patchProfileSettings(id, patch, {
        nickname,
        display_name: name,
        bio,
        avatar,
      });
      setTheme(initialPreferences.current.theme);
      setFontSize(initialPreferences.current.fontSize);
      setFontFamily(initialPreferences.current.fontFamily);
      setMessage("Perfil salvo.");
    } catch (cause) {
      setMessage(
        toDataError(
          cause,
          "Não foi possível salvar. Confira o nickname e tente novamente.",
        ).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    file: File | undefined,
    field: "avatar_path" | "banner_path",
  ) {
    if (!file || busy) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setMessage("Use JPEG, PNG ou WebP de até 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const api = supabase();
      const current = await api
        .from("profiles")
        .select(field)
        .eq("id", id)
        .single();
      if (current.error) throw current.error;
      const oldPath = (current.data as Record<typeof field, string | null>)[
        field
      ];
      const path = `${id}/${crypto.randomUUID()}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`;
      const result = await replaceStorageReference(
        "profiles",
        path,
        file,
        file.type,
        async (newPath) => {
          const updated = await api
            .from("profiles")
            .update({ [field]: newPath })
            .eq("id", id)
            .select("id")
            .single();
          if (updated.error) throw updated.error;
        },
        async (newPath) => {
          const current = await api
            .from("profiles")
            .select(field)
            .eq("id", id)
            .maybeSingle();
          if (current.error) throw current.error;
          return Boolean(
            current.data &&
            (current.data as Record<typeof field, string | null>)[field] ===
              newPath,
          );
        },
        oldPath,
        async (previous) => {
          const refs = await api
            .from("profiles")
            .select("avatar_path,banner_path")
            .eq("id", id)
            .single();
          if (refs.error) throw refs.error;
          return (
            refs.data.avatar_path === previous ||
            refs.data.banner_path === previous
          );
        },
      );
      const signed = await api.storage
        .from("profiles")
        .createSignedUrl(path, 3600);
      if (signed.error) {
        setMessage(
          "A imagem foi salva, mas não foi possível preparar a prévia. Recarregue o perfil.",
        );
        return;
      }
      (field === "avatar_path" ? setAvatarUrl : setBannerUrl)(
        signed.data.signedUrl,
      );
      setMessage(result.cleanupWarning || "Imagem salva.");
    } catch (cause) {
      setMessage(
        toDataError(cause, "Não foi possível salvar a imagem.").message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase().auth.updateUser({
        password,
        current_password: current,
      });
      setMessage(
        error
          ? "Não foi possível trocar a senha. Confira a senha atual."
          : "Senha atualizada.",
      );
      if (!error) {
        setPassword("");
        setCurrent("");
      }
    } catch {
      setMessage(
        "Não foi possível trocar a senha. Confira a conexão e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Nav />
      <main id="main-content" tabIndex={-1} className="dashboard profile-page">
        <header className="profile-heading">
          <span className="eyebrow">Seu cantinho</span>
          <h1>Uma página com a sua cara.</h1>
          <p>
            Cuide dos detalhes do seu perfil e deixe sua leitura do seu jeito.
          </p>
        </header>
        {!ready && (
          <p role="status">
            {message || "Carregando perfil…"}{" "}
            {message && (
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Tentar novamente
              </button>
            )}
          </p>
        )}
        <fieldset className="profile-content" disabled={!ready || busy}>
          <section className="profile-identity-card">
            <div className="profile-banner">
              {bannerUrl && <img src={bannerUrl} alt="Seu banner" />}
              <span className="profile-banner-label">Seu espaço no Nook</span>
              <span className="profile-avatar">
                {avatarUrl ? <img src={avatarUrl} alt="Seu avatar" /> : avatar}
              </span>
            </div>
            <div className="profile-card-body">
              <div className="profile-card-title">
                <div>
                  <span className="eyebrow">Perfil de leitura</span>
                  <h2>{name || nickname || "Seu perfil"}</h2>
                </div>
                <div className="profile-summary">
                  <span className="profile-handle">
                    @{nickname || "nickname"}
                  </span>
                  {bio && <p>{bio}</p>}
                </div>
              </div>
              <form
                id="profile-edit"
                className="profile-form profile-fields"
                onSubmit={save}
              >
                <div className="profile-field-grid">
                  <label>
                    Nickname
                    <input
                      required
                      pattern="[a-z0-9_]{3,40}"
                      aria-describedby="nickname-hint"
                      maxLength={40}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                    />
                    <small
                      className="field-helper"
                      id="nickname-hint"
                      aria-hidden="true"
                    >
                      3–40 caracteres · letras minúsculas, números e _
                    </small>
                  </label>
                  <label>
                    Nome exibido
                    <input
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Bio{" "}
                  <span className="field-hint" aria-hidden="true">
                    {bio.length}/300
                  </span>
                  <textarea
                    maxLength={300}
                    aria-label="Bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Um pouco sobre você e suas histórias favoritas…"
                  />
                </label>
                <div className="profile-upload-grid">
                  <label className="upload-picker">
                    <span className="upload-picker-icon">＋</span>
                    <span>
                      <strong>Alterar foto de perfil</strong>
                      <small>JPEG, PNG ou WebP · até 2 MB</small>
                    </span>
                    <input
                      disabled={busy}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) =>
                        void upload(e.target.files?.[0], "avatar_path")
                      }
                    />
                  </label>
                  <label className="upload-picker">
                    <span className="upload-picker-icon">＋</span>
                    <span>
                      <strong>Alterar imagem de capa</strong>
                      <small>JPEG, PNG ou WebP · até 2 MB</small>
                    </span>
                    <input
                      disabled={busy}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) =>
                        void upload(e.target.files?.[0], "banner_path")
                      }
                    />
                  </label>
                </div>
                <div className="profile-field-block">
                  <span className="profile-label">Ícone</span>
                  <div
                    className="choice-row icon-choices"
                    role="group"
                    aria-label="Ícone do perfil"
                  >
                    {["✦", "☾", "❀", "◈"].map((icon) => (
                      <button
                        type="button"
                        key={icon}
                        aria-pressed={avatar === icon}
                        aria-label={`Ícone ${{ "✦": "estrela", "☾": "lua", "❀": "flor", "◈": "losango" }[icon as "✦" | "☾" | "❀" | "◈"]}`}
                        onClick={() => setAvatar(icon)}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="profile-save-row">
                  <p>
                    Favoritos, progresso e marcadores são privados. Seu nickname
                    e ícone aparecem na conversa das obras.
                  </p>
                  <button className="primary-button" disabled={busy}>
                    {busy ? "Salvando…" : "Salvar alterações"}
                  </button>
                </div>
              </form>
            </div>
          </section>
          <section className="profile-settings-card">
            <div className="profile-section-heading">
              <span className="eyebrow">Conforto de leitura</span>
              <h2>Do seu jeito</h2>
              <p>Estas preferências ficam guardadas no seu perfil.</p>
            </div>
            <div className="profile-settings-grid">
              <div className="profile-field-block">
                <span className="profile-label">Tema de leitura</span>
                <div
                  className="choice-row"
                  role="group"
                  aria-label="Tema de leitura"
                >
                  {[
                    ["dark", "Escuro"],
                    ["sepia", "Sépia"],
                    ["light", "Claro"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={theme === value}
                      onClick={() => setTheme(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="profile-field-block">
                <span className="profile-label">Fonte</span>
                <div className="choice-row" role="group" aria-label="Fonte">
                  {[
                    ["serif", "Literária"],
                    ["sans", "Sem serifa"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={fontFamily === value}
                      onClick={() => setFontFamily(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="font-size-control">
                Tamanho da fonte <span>{fontSize}px</span>
                <input
                  type="range"
                  min="16"
                  max="32"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
              </label>
            </div>
            <button
              type="submit"
              form="profile-edit"
              className="secondary-button"
              disabled={busy || !ready}
            >
              Salvar preferências
            </button>
          </section>
          <section className="profile-settings-card password-card">
            <div className="profile-section-heading">
              <span className="eyebrow">Segurança</span>
              <h2>Trocar senha</h2>
              <p>Escolha uma senha forte para proteger sua conta.</p>
            </div>
            <form
              className="profile-form profile-password-form"
              onSubmit={change}
            >
              <label>
                Senha atual
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </label>
              <label>
                Nova senha
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="secondary-button" disabled={busy}>
                {busy ? "Atualizando…" : "Atualizar senha"}
              </button>
            </form>
          </section>
        </fieldset>
        {message && (
          <p
            className={`profile-message ${message.includes("Não foi possível") ? "is-error" : "is-success"}`}
            role="status"
          >
            {message}
          </p>
        )}
      </main>
    </>
  );
}
