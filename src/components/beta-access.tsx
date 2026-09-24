"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { About } from "@/components/about";
export function BetaAccess({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const [status, setStatus] = useState("loading");
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    let live = true;
    async function checkAccess() {
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
        const hasNoExpiry = expiresAt === "infinity";
        const expiryTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
        const validExpiry =
          hasNoExpiry || (Number.isFinite(expiryTime) && expiryTime > Date.now());
        const allowed =
          access?.revoked === false &&
          validExpiry &&
          (!admin || access.role === "admin");

        if (live) {
          setStatus(allowed ? "ok" : "denied");
          if (allowed) {
            try {
              setIntro(!localStorage.getItem("nook-intro-v1"));
            } catch {
              setIntro(false);
            }
          }
        }
      } catch {
        if (live) setStatus("error");
      }
    }
    void checkAccess();
    return () => {
      live = false;
    };
  }, [admin]);
  if (status !== "ok")
    return (
      <main className="center-screen">
        <div className="auth-card">
          <h1>
            {status === "loading"
              ? "Abrindo seu Nook…"
              : status === "error"
                ? "Não foi possível validar o acesso"
                : "Acesso restrito"}
          </h1>
          <p>
            {status === "denied"
              ? "Seu convite expirou ou esta área é exclusiva da administração. Fale com quem organizou o beta."
              : status === "error"
                ? "Confira sua conexão. O projeto de teste também precisa da migração do beta."
                : ""}
          </p>
          <Link href="/">Voltar</Link>
          <button
            className="secondary-button"
            onClick={() => void supabase().auth.signOut()}
          >
            Sair
          </button>
        </div>
      </main>
    );
  if (intro && !admin)
    return (
      <About
        onClose={() => {
          try {
            localStorage.setItem("nook-intro-v1", "1");
          } catch {}
          setIntro(false);
        }}
      />
    );
  return children;
}
