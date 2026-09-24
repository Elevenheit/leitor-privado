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
      <header
        className="site-nav"
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <div className="nav-inner">
          <Link className="logo" href="/">
            <BookOpen size={20} />
            nook<span className="logo-dot">.</span>
          </Link>
          <nav
            id="primary-navigation"
            className={`primary-nav ${open ? "is-open" : ""}`}
            aria-label="Principal"
          >
            {links.slice(0, 6).map(([url, label]) => (
              <Link
                key={url}
                href={url}
                aria-current={path === url ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            {back && (
              <Link className="nav-back-link" href="/">
                Biblioteca
              </Link>
            )}
            <button
              className="icon-button menu-toggle"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              aria-controls="primary-navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
            <details className="profile-menu">
              <summary aria-label="Abrir menu do perfil">
                <span className="profile-menu-avatar">
                  <BookOpen size={15} />
                </span>
                <span>Perfil</span>
              </summary>
              <div className="profile-menu-panel">
                {links.slice(6).map(([url, label]) => (
                  <Link
                    key={url}
                    href={url}
                    aria-current={path === url ? "page" : undefined}
                  >
                    {label}
                  </Link>
                ))}
                {admin && <Link href="/admin">Administrar acervo</Link>}
                <button onClick={() => void supabase().auth.signOut()}>
                  <LogOut size={15} /> Sair
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}
