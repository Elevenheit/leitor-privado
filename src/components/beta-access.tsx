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
    supabase()
      .rpc(admin ? "beta_admin" : "beta_member")
      .then(({ data, error }) => {
        if (live) {
          setStatus(error ? "error" : data ? "ok" : "denied");
          try {
            setIntro(!localStorage.getItem("nook-intro-v1"));
          } catch {
            setIntro(false);
          }
        }
      });
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
