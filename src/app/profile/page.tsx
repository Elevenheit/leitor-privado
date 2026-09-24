/* eslint-disable @next/next/no-img-element -- Private profile images use signed URLs directly. */
"use client";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { supabase } from "@/lib/supabase";
export default function Page() {
  return <AuthGate>{(u) => <Profile id={u.id} />}</AuthGate>;
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
  useEffect(() => {
    void supabase()
      .from("profiles")
      .select(
        "nickname,display_name,bio,avatar,avatar_path,banner_path,preferences",
      )
      .eq("id", id)
      .single()
      .then(async ({ data, error }) => {
        if (error) setMessage("Não foi possível abrir seu perfil.");
        if (data) {
          setNickname(data.nickname);
          setName(data.display_name);
          setBio(data.bio);
          setAvatar(data.avatar);
          setTheme(data.preferences?.theme || "dark");
          setFontSize(data.preferences?.fontSize || 22);
          setFontFamily(data.preferences?.fontFamily || "serif");
          if (data.avatar_path)
            setAvatarUrl(
              (
                await supabase()
                  .storage.from("profiles")
                  .createSignedUrl(data.avatar_path, 3600)
              ).data?.signedUrl || "",
            );
          if (data.banner_path)
            setBannerUrl(
              (
                await supabase()
                  .storage.from("profiles")
                  .createSignedUrl(data.banner_path, 3600)
              ).data?.signedUrl || "",
            );
        }
      });
  }, [id]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase()
        .from("profiles")
        .update({
          nickname,
          display_name: name,
          bio,
          avatar,
          preferences: { theme, fontSize, fontFamily },
        })
        .eq("id", id);
      setMessage(
        error
          ? "Não foi possível salvar. O nickname precisa ser único."
          : "Perfil salvo.",
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
    let path = "";
    try {
      const bitmap = await createImageBitmap(file);
      const valid =
        bitmap.width <= 4096 &&
        bitmap.height <= 4096 &&
        bitmap.width * bitmap.height <= 8000000;
      bitmap.close();
      if (!valid)
        throw Error(
          "Use uma imagem de até 4096 pixels por lado e 8 megapixels.",
        );
      path = `${id}/${crypto.randomUUID()}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`;
      const api = supabase();
      const uploaded = await api.storage
        .from("profiles")
        .upload(path, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      const result = await api
        .from("profiles")
        .update({ [field]: path })
        .eq("id", id);
      if (result.error) {
        await api.storage.from("profiles").remove([path]);
        throw result.error;
      }
      const signed = await api.storage
        .from("profiles")
        .createSignedUrl(path, 3600);
      if (signed.error) throw signed.error;
      (field === "avatar_path" ? setAvatarUrl : setBannerUrl)(
        signed.data.signedUrl,
      );
      setMessage("Imagem salva.");
    } catch {
      setMessage(
        "Não foi possível salvar a imagem. Confira o formato, tamanho e conexão.",
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
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Nav />
      <main className="dashboard profile-page">
        <span className="eyebrow">Seu cantinho</span>
        <h1>Meu perfil</h1>
        <div className="profile-banner">
          {bannerUrl && <img src={bannerUrl} alt="Seu banner" />}
          <span className="profile-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="Seu avatar" /> : avatar}
          </span>
        </div>
        <div className="profile-form">
          <label>
            Avatar (até 2 MB)
            <input
              disabled={busy}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void upload(e.target.files?.[0], "avatar_path")}
            />
          </label>
          <label>
            Banner (até 2 MB)
            <input
              disabled={busy}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void upload(e.target.files?.[0], "banner_path")}
            />
          </label>
        </div>
        <form className="profile-form" onSubmit={save}>
          <label>
            Nickname
            <input
              required
              pattern="[a-z0-9_]{3,40}"
              maxLength={40}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <label>
            Nome exibido
            <input
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Bio
            <textarea
              maxLength={300}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          <label>
            Ícone
            <select value={avatar} onChange={(e) => setAvatar(e.target.value)}>
              {["✦", "☾", "❀", "◈"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Tema de leitura
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">Escuro</option>
              <option value="sepia">Sépia</option>
              <option value="light">Claro</option>
            </select>
          </label>
          <label>
            Fonte
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            >
              <option value="serif">Literária</option>
              <option value="sans">Sem serifa</option>
            </select>
          </label>
          <label>
            Tamanho da fonte
            <input
              type="range"
              min="16"
              max="32"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </label>
          <button className="primary-button" disabled={busy}>
            Salvar perfil
          </button>
        </form>
        <p className="muted">
          Favoritos, progresso e marcadores são privados. Seu nickname e ícone
          aparecem na conversa das obras.
        </p>
        <h2>Trocar senha</h2>
        <form className="profile-form" onSubmit={change}>
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
          <button className="primary-button" disabled={busy}>
            Atualizar senha
          </button>
        </form>
        {message && <p role="status">{message}</p>}
      </main>
    </>
  );
}
