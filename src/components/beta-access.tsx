"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function BetaAccess({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    async function run() {
      try {
        const api = supabase();
        const { data: sessionData, error: sessionError } =
          await api.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData.session?.user.id;
        if (!userId) {
          if (live) setStatus("denied");
          return;
        }
        const { data: access, error: accessError } = await api
          .from("beta_access")
          .select("role, expires_at, revoked")
          .eq("user_id", userId)
          .maybeSingle();
        if (accessError) throw accessError;
        const expiresAt = access?.expires_at;
        const noExpiry = expiresAt === "infinity";
        const expiryTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
        const validExpiry =
          noExpiry || (Number.isFinite(expiryTime) && expiryTime > Date.now());
        const allowed =
          access?.revoked === false &&
          validExpiry &&
          (!admin || access.role === "admin");
        if (live) setStatus(allowed ? "ok" : "denied");
      } catch {
        if (live) setStatus("error");
      }
    }
    void run();
    return () => {
      live = false;
    };
  }, [admin, attempt]);

  if (status === "ok") return children;

  const loading = status === "loading";
  const denied = status === "denied";
  return (
    <main className="access-screen">
      <section className="access-card" aria-live="polite">
        <Link className="access-brand" href="/" aria-label="Nook, início">
          nook<span>.</span>
        </Link>
        <div
          className={`access-emblem ${loading ? "is-loading" : ""}`}
          aria-hidden="true"
        >
          {loading ? <Sparkles size={23} /> : <ShieldCheck size={23} />}
        </div>
        <p className="eyebrow">Acesso ao beta</p>
        <h1>
          {loading
            ? "Abrindo seu Nook"
            : denied
              ? "Acesso indisponível"
              : "Não foi possível validar seu acesso"}
        </h1>
        <p className="access-copy">
          {loading
            ? "Estamos preparando sua biblioteca. Só um instante."
            : denied
              ? admin
                ? "Esta área é exclusiva da administração."
                : "Seu acesso ao beta expirou ou não está mais ativo."
              : "Não conseguimos confirmar sua sessão agora. Tente novamente ou saia para entrar outra vez."}
        </p>
        {loading && (
          <div className="access-progress" role="status">
            <span />
          </div>
        )}
        <div className="access-actions">
          {status === "error" && (
            <button
              className="primary-button"
              onClick={() => setAttempt((n) => n + 1)}
            >
              <RefreshCw size={16} /> Tentar novamente
            </button>
          )}
          <button
            className="access-logout"
            onClick={() => void supabase().auth.signOut()}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </section>
    </main>
  );
}
