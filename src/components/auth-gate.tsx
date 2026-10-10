"use client";

import { toDataError, reportDataError } from "@/lib/data/errors";
import { BookOpen, LockKeyhole, LogIn } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { BetaAccess } from "@/components/beta-access";
import { isConfigured, supabase } from "@/lib/supabase";
import { clearCatalogContexts } from "@/lib/catalog-context";
import { clearAppPreferences } from "@/lib/app-experience";

export function AuthGate({
  children,
}: {
  children: (user: User) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signup, setSignup] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recover, setRecover] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    const api = supabase();
    let live = true;
    let authChanged = false;
    api.auth
      .getUser()
      .then(({ data, error }) => {
        if (!live || authChanged) return;
        setUser(error ? null : data.user);
        setLoading(false);
      })
      .catch((cause) => {
        if (!live || authChanged) return;
        setError(
          toDataError(
            cause,
            "Nao foi possivel conferir a sessao. Tente novamente.",
            "auth",
          ).message,
        );
        setLoading(false);
      });
    const { data: listener } = api.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      if (_event !== "INITIAL_SESSION") authChanged = true;
      if (_event === "SIGNED_OUT") {
        clearCatalogContexts();
        clearAppPreferences();
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!isConfigured)
    return (
      <div className="center-screen">
        <div className="auth-card">
          <div className="brand-mark">
            <BookOpen size={24} />
          </div>
          <h1>Configure o Supabase</h1>
          <p>
            Preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no arquivo{" "}
            <code>.env.local</code>. Depois reinicie o servidor.
          </p>
        </div>
      </div>
    );

  if (loading)
    return (
      <main className="center-screen muted">
        <p role="status">Abrindo sua biblioteca…</p>
      </main>
    );
  if (user) return <BetaAccess key={user.id}>{children(user)}</BetaAccess>;

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const credentials = { email: email.trim(), password };
      if (recover) {
        const result = await supabase().auth.resetPasswordForEmail(
          credentials.email,
          {
            redirectTo: `${window.location.origin}/auth/recovery`,
          },
        );
        if (result.error) throw result.error;
        setNotice(
          "Se houver uma conta com esse e-mail, você receberá um link para definir uma nova senha. Confira também o spam.",
        );
        return;
      }
      const { data, error } = signup
        ? await supabase().auth.signUp({
            ...credentials,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/confirm`,
            },
          })
        : await supabase().auth.signInWithPassword(credentials);
      if (error) reportDataError(error, "auth");
      if (error)
        setError(
          error.code === "over_request_rate_limit"
            ? "Muitas tentativas. Espere um pouco."
            : signup
              ? "Não foi possível cadastrar. Confira o e-mail e use uma senha com ao menos 10 caracteres."
              : "Não foi possível entrar. Confira o e-mail e a senha.",
        );
      else if (signup && !data.session) {
        setSignup(false);
        setNotice(
          "Confira seu e-mail para confirmar o cadastro antes de entrar. Se já tiver uma conta, use Entrar ou recupere sua senha.",
        );
      }
    } catch (cause) {
      setError(
        toDataError(
          cause,
          "Não foi possível concluir. Tente novamente.",
          "auth",
        ).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="center-screen">
      <div className="auth-card">
        <div className="logo">
          nook<span className="logo-dot">.</span>
        </div>
        <span className="eyebrow">Sua biblioteca particular</span>
        <h1>
          {recover
            ? "Recupere sua conta."
            : signup
              ? "Sua próxima história começa aqui."
              : "Um lugar só seu para ler."}
        </h1>
        <p>
          {recover
            ? "Informe seu e-mail para receber o link de recuperação."
            : signup
              ? "Crie sua conta para explorar a biblioteca e guardar suas leituras."
              : "Entre para continuar exatamente de onde parou."}
        </p>
        <div
          className="access-tabs"
          role="group"
          aria-label="Acesso à biblioteca"
        >
          <button
            aria-pressed={!signup}
            onClick={() => {
              setSignup(false);
              setRecover(false);
              setNotice("");
              setError("");
            }}
          >
            Entrar
          </button>
          <button
            aria-pressed={signup}
            onClick={() => {
              setSignup(true);
              setRecover(false);
              setNotice("");
              setError("");
            }}
          >
            Criar conta
          </button>
        </div>
        <form onSubmit={signIn} className="auth-form" aria-busy={submitting}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@exemplo.com"
            />
          </label>
          {!recover && (
            <label>
              Senha
              <input
                aria-label="Senha"
                type="password"
                minLength={signup ? 10 : 1}
                autoComplete={signup ? "new-password" : "current-password"}
                aria-describedby={signup ? "signup-password-hint" : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Sua senha"
              />
              {signup && (
                <small
                  className="field-helper"
                  id="signup-password-hint"
                  aria-hidden="true"
                >
                  Use ao menos 10 caracteres.
                </small>
              )}
            </label>
          )}
          {notice && <p role="status">{notice}</p>}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            <LogIn size={17} />
            {submitting
              ? "Aguarde…"
              : recover
                ? "Enviar link de recuperação"
                : signup
                  ? "Criar conta"
                  : "Entrar na biblioteca"}
          </button>
        </form>
        <div className="private-note">
          <LockKeyhole size={14} /> Sua leitura protegida por conta
        </div>
        <p className="muted">
          <button
            type="button"
            className="auth-help"
            onClick={() => {
              setRecover(!recover);
              setSignup(false);
              setError("");
              setNotice("");
            }}
          >
            {recover ? "Voltar para entrar" : "Esqueci minha senha"}
          </button>
          {!recover && (
            <button
              type="button"
              className="auth-help"
              disabled={submitting}
              onClick={async () => {
                if (!email.trim()) {
                  setError("Informe seu e-mail para reenviar a confirmação.");
                  return;
                }
                setSubmitting(true);
                setError("");
                setNotice("");
                try {
                  const result = await supabase().auth.resend({
                    type: "signup",
                    email: email.trim(),
                    options: {
                      emailRedirectTo: `${window.location.origin}/auth/confirm`,
                    },
                  });
                  if (result.error) throw result.error;
                  setNotice(
                    "Se houver um cadastro aguardando confirmação, enviaremos um novo link.",
                  );
                } catch {
                  setError(
                    "Não foi possível reenviar agora. Aguarde e tente novamente.",
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Reenviar confirmação
            </button>
          )}
        </p>
      </div>
    </main>
  );
}
