"use client";

import { BookOpen, LockKeyhole, LogIn } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { isConfigured, supabase } from "@/lib/supabase";

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  if (!isConfigured) return (
    <div className="center-screen"><div className="auth-card">
      <div className="brand-mark"><BookOpen size={24} /></div>
      <h1>Configure o Supabase</h1>
      <p>Preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no arquivo <code>.env.local</code>. Depois reinicie o servidor.</p>
    </div></div>
  );

  if (loading) return <div className="center-screen muted">Abrindo sua biblioteca…</div>;
  if (user) return <>{children(user)}</>;

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError("Não foi possível entrar. Confira o e-mail e a senha.");
    setSubmitting(false);
  }

  return <main className="center-screen">
    <div className="auth-card">
      <div className="brand-mark"><BookOpen size={24} /></div>
      <span className="eyebrow">Sua biblioteca particular</span>
      <h1>Um lugar só seu<br />para ler.</h1>
      <p>Entre para continuar exatamente de onde parou.</p>
      <form onSubmit={signIn} className="auth-form">
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@exemplo.com" /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Sua senha" /></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary-button" type="submit" disabled={submitting}><LogIn size={17} />{submitting ? "Entrando…" : "Entrar na biblioteca"}</button>
      </form>
      <div className="private-note"><LockKeyhole size={14} /> Acesso privado</div>
    </div>
  </main>;
}
