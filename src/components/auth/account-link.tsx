"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isConfigured, supabase } from "@/lib/supabase";

/** Public Auth return route. Library membership must not gate password recovery. */
export function AccountLink({ recovery = false }: { recovery?: boolean }) {
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "done">(
    "loading",
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    if (!isConfigured) {
      const timer = setTimeout(() => setState("invalid"), 0);
      return () => clearTimeout(timer);
    }
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const failed = url.searchParams.has("error") || fragment.has("error");
    const api = supabase();
    const { data } = api.auth.onAuthStateChange((event, session) => {
      if (live && event === "PASSWORD_RECOVERY" && session && !failed)
        setState("ready");
    });
    async function check() {
      try {
        if (failed) throw Error("invalid link");
        // The client handles the implicit-flow fragment automatically. Also
        // support a PKCE callback if the Auth configuration is changed later.
        const code = url.searchParams.get("code");
        if (code) {
          const result = await api.auth.exchangeCodeForSession(code);
          if (result.error) throw result.error;
          window.history.replaceState(null, "", url.pathname);
        }
        const result = await api.auth.getUser();
        if (result.error || !result.data.user) throw Error("invalid session");
        if (live) setState("ready");
      } catch {
        if (live) setState("invalid");
        // Do not keep credentials or provider errors in the visible URL.
        window.history.replaceState(null, "", url.pathname);
      }
    }
    void check();
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function update(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await supabase().auth.updateUser({ password });
      if (result.error) throw result.error;
      setPassword("");
      setConfirmation("");
      setState("done");
    } catch {
      setError(
        "Não foi possível atualizar a senha. Tente outra senha ou solicite um novo link.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="center-screen">
      <section className="auth-card">
        <Link className="logo" href="/">
          nook<span className="logo-dot">.</span>
        </Link>
        <h1>{recovery ? "Sua nova senha" : "Confirmação de e-mail"}</h1>
        {state === "loading" && <p role="status">Conferindo seu link…</p>}
        {state === "invalid" && (
          <>
            <p role="alert">
              Este link está inválido ou expirou. Solicite um novo link na tela
              de acesso.
            </p>
            <Link className="primary-button" href="/">
              Voltar ao acesso
            </Link>
          </>
        )}
        {state === "ready" && !recovery && (
          <>
            <p role="status">E-mail confirmado. Sua conta está pronta.</p>
            <Link className="primary-button" href="/">
              Abrir a biblioteca
            </Link>
          </>
        )}
        {state === "ready" && recovery && (
          <form onSubmit={update} className="auth-form" aria-busy={busy}>
            <label>
              Nova senha
              <input
                type="password"
                minLength={10}
                autoComplete="new-password"
                aria-describedby="recovery-password-hint"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                type="password"
                minLength={10}
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <small id="recovery-password-hint" className="field-helper">
              Use ao menos 10 caracteres.
            </small>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              {busy ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
        {state === "done" && (
          <>
            <p role="status">Senha atualizada.</p>
            <Link className="primary-button" href="/">
              Continuar para a biblioteca
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
