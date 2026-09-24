"use client";

import { BookOpen, LockKeyhole, LogIn } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { BetaAccess } from "@/components/beta-access";
import { isConfigured, supabase } from "@/lib/supabase";

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

  useEffect(() => {
    if (!isConfigured) return;
    const api = supabase();
    api.auth.getUser().then(({ data, error }) => {
      setUser(error ? null : data.user);
      setLoading(false);
    });
    const { data: listener } = api.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
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
    return <div className="center-screen muted">Abrindo sua biblioteca…</div>;
  if (user) return <BetaAccess>{children(user)}</BetaAccess>;

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (signup) {
        const readiness = await supabase().rpc("beta_signup_ready");
        if (readiness.error || !readiness.data) {
          setError(
            "O cadastro do beta ainda n?o foi configurado neste ambiente. Fale com o administrador.",
          );
          return;
        }
      }
      const credentials = { email: email.trim(), password };
      const { data, error } = signup
        ? await supabase().auth.signUp(credentials)
        : await supabase().auth.signInWithPassword(credentials);
      if (error)
        setError(
          error.code === "user_already_exists"
            ? "Esta conta já existe. Escolha Entrar."
            : error.code === "over_request_rate_limit"
              ? "Muitas tentativas. Espere um pouco."
              : signup
                ? "Não foi possível cadastrar. Confira seu convite e use uma senha com ao menos 10 caracteres."
                : "Não foi possível entrar. Confira o e-mail e a senha.",
        );
      else if (signup && !data.session) {
        setSignup(false);
        setError(
          "Conta criada, mas sem sessão. Tente entrar. Se não funcionar, peça ao administrador para revisar a configuração do beta.",
        );
      }
    } catch {
      setError("Sem conexão. Tente novamente quando a rede voltar.");
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
          Um lugar só seu
          <br />
          para ler.
        </h1>
        <p>Entre para continuar exatamente de onde parou.</p>
        <div className="access-tabs">
          <button
            aria-pressed={!signup}
            onClick={() => {
              setSignup(false);
              setError("");
            }}
          >
            Entrar
          </button>
          <button
            aria-pressed={signup}
            onClick={() => {
              setSignup(true);
              setError("");
            }}
          >
            Criar conta
          </button>
        </div>
        <form onSubmit={signIn} className="auth-form">
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
          <label>
            Senha
            <input
              type="password"
              minLength={signup ? 10 : 1}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Sua senha"
            />
          </label>
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
              : signup
                ? "Criar conta"
                : "Entrar na biblioteca"}
          </button>
        </form>
        <div className="private-note">
          <LockKeyhole size={14} /> Beta fechado · apenas convidados
        </div>
        <p className="muted">
          Precisa de ajuda com sua senha? Fale com o administrador do beta.
        </p>
      </div>
    </main>
  );
}
