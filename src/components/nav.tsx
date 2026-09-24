"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
const links = [
  ["/", "Início"],
  ["/category/novel", "Light Novels"],
  ["/category/manga", "Mangás"],
  ["/category/manhwa", "Manhwas"],
  ["/category/anime", "Animes"],
  ["/list", "Minha lista"],
  ["/profile", "Meu perfil"],
  ["/about", "Sobre o Nook"],
];
export function Nav({ back = false }: { back?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    void supabase()
      .rpc("beta_admin")
      .then(({ data }) => setAdmin(Boolean(data)));
  }, []);
  return (
    <>
      <header className="site-nav">
        <div className="nav-inner">
          <Link className="logo" href="/">
            <BookOpen size={20} />
            nook<span className="logo-dot">.</span>
          </Link>
          <div className="nav-actions">
            {back && <Link href="/">Biblioteca</Link>}
            <button
              className="icon-button menu-toggle"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              aria-controls="main-nav"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
            <button
              className="icon-button"
              aria-label="Sair"
              onClick={() => void supabase().auth.signOut()}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <nav
        id="main-nav"
        aria-label="Principal"
        className={`side-nav ${open ? "is-open" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span className="eyebrow">Entre histórias</span>
        {links.map(([url, label]) => (
          <Link
            key={url}
            href={url}
            aria-current={path === url ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {label}
          </Link>
        ))}
        {admin && <Link href="/admin">Administrar acervo</Link>}
        <small>Um capítulo de cada vez.</small>
      </nav>
    </>
  );
}
