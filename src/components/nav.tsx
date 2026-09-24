/* eslint-disable @next/next/no-img-element -- Private avatars use signed URLs. */
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookImage,
  BookOpen,
  Bookmark,
  ChevronUp,
  Home,
  Info,
  Layers,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "/", label: "Início", icon: Home },
  { href: "/category/novel", label: "Light Novels", icon: BookOpen },
  { href: "/category/manga", label: "Mangás", icon: BookImage },
  { href: "/category/manhwa", label: "Manhwas", icon: Layers },
  { href: "/category/anime", label: "Animes", icon: Play },
  { href: "/list", label: "Minha lista", icon: Bookmark },
];

export function Nav({ back = false }: { back?: boolean }) {
  const path = usePathname();
  const immersive = path.startsWith("/media/") || path.startsWith("/read/");
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [profile, setProfile] = useState({ name: "Meu espaço", avatar: "" });
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const wide = expanded && !immersive;

  useEffect(() => {
    let live = true;
    async function checkAdmin() {
      try {
        const api = supabase();
        const { data: session } = await api.auth.getSession();
        const userId = session.session?.user.id;
        if (!userId) return;
        const { data: access } = await api
          .from("beta_access")
          .select("role, expires_at, revoked")
          .eq("user_id", userId)
          .maybeSingle();
        const expiry = access?.expires_at;
        const expiryTime = expiry ? Date.parse(expiry) : Number.NaN;
        const active =
          access?.revoked === false &&
          (expiry === "infinity" ||
            (Number.isFinite(expiryTime) && expiryTime > Date.now()));
        if (live) setAdmin(active && access?.role === "admin");
      } catch {
        if (live) setAdmin(false);
      }
    }
    async function loadProfile() {
      try {
        const api = supabase();
        const { data: session } = await api.auth.getSession();
        const userId = session.session?.user.id;
        if (!userId) return;
        const { data } = await api
          .from("profiles")
          .select("nickname,display_name,avatar_path")
          .eq("id", userId)
          .maybeSingle();
        if (!data) return;
        const avatar = data.avatar_path
          ? (
              await api.storage
                .from("profiles")
                .createSignedUrl(data.avatar_path, 3600)
            ).data?.signedUrl || ""
          : "";
        if (live)
          setProfile({
            name: data.display_name || data.nickname || "Meu espaço",
            avatar,
          });
      } catch {
        /* Keep the account menu fallback if the profile is unavailable. */
      }
    }
    void checkAdmin();
    void loadProfile();
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (desktop.matches) drawer.current?.close();
    };
    const closeOutside = (event: PointerEvent) => {
      root.current
        ?.querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((details) => {
          if (!details.contains(event.target as Node)) details.open = false;
        });
    };
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      live = false;
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, []);

  function closeMenus() {
    root.current
      ?.querySelectorAll<HTMLDetailsElement>("details[open]")
      .forEach((details) => {
        details.open = false;
      });
    drawer.current?.close();
  }
  function navigation(full: boolean) {
    return (
      <nav className="rail-links" aria-label="Navegação principal">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={path === href ? "page" : undefined}
            title={full ? undefined : label}
            className={`rail-link ${href === "/list" ? "rail-saved" : ""}`}
            onClick={closeMenus}
          >
            <Icon size={21} strokeWidth={1.6} aria-hidden="true" />
            <span className="rail-label">{label}</span>
            {!full && (
              <span className="rail-tooltip" aria-hidden="true">
                {label}
              </span>
            )}
          </Link>
        ))}
      </nav>
    );
  }
  function account() {
    return (
      <details
        className="rail-account"
        onKeyDown={(event) => {
          if (event.key === "Escape" && event.currentTarget.open) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          aria-label={`Menu do perfil de ${profile.name}`}
          title={profile.name}
        >
          <span className="rail-avatar">
            {profile.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              <UserRound size={19} aria-hidden="true" />
            )}
          </span>
          <span className="rail-account-name">
            {profile.name}
            <small>Sua conta</small>
          </span>
          <ChevronUp
            size={15}
            className="rail-account-chevron"
            aria-hidden="true"
          />
        </summary>
        <div className="rail-account-panel">
          <Link
            href="/profile"
            aria-current={path === "/profile" ? "page" : undefined}
            onClick={closeMenus}
          >
            <UserRound size={16} />
            Meu perfil
          </Link>
          <Link href="/list" onClick={closeMenus}>
            <Bookmark size={16} />
            Minha lista
          </Link>
          <Link
            href="/about"
            aria-current={path === "/about" ? "page" : undefined}
            onClick={closeMenus}
          >
            <Info size={16} />
            Sobre o Nook
          </Link>
          {admin && (
            <Link
              href="/admin"
              aria-current={path.startsWith("/admin") ? "page" : undefined}
              onClick={closeMenus}
            >
              <Settings2 size={16} />
              Administrar acervo
            </Link>
          )}
          <button
            onClick={() => {
              closeMenus();
              void supabase().auth.signOut();
            }}
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </details>
    );
  }
  return (
    <div
      className="navigation-shell"
      data-expanded={wide}
      data-immersive={immersive}
      ref={root}
    >
      <aside className="navigation-rail" aria-label="Navegação do Nook">
        <Link
          href="/"
          className="rail-brand"
          aria-label={back ? "Nook, voltar ao início" : "Nook, início"}
        >
          n<span className="rail-wordmark">ook</span>
          <span className="logo-dot">.</span>
        </Link>
        {!immersive && (
          <button
            className="rail-toggle"
            aria-expanded={wide}
            aria-controls="desktop-rail-content"
            aria-label={wide ? "Recolher navegação" : "Expandir navegação"}
            onClick={() => setExpanded(!wide)}
            title={wide ? "Recolher navegação" : "Expandir navegação"}
          >
            {wide ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            <span className="rail-label">Recolher</span>
          </button>
        )}
        <div className="rail-content" id="desktop-rail-content">
          {navigation(wide)}
        </div>
        {account()}
      </aside>
      <header className="mobile-navigation">
        <Link href="/" className="logo" aria-label="Nook, início">
          nook<span className="logo-dot">.</span>
        </Link>
        <button
          className="icon-button"
          ref={trigger}
          aria-label="Abrir navegação"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation-drawer"
          onClick={() => {
            drawer.current?.showModal();
            setMobileOpen(true);
          }}
        >
          <Menu size={22} />
        </button>
      </header>
      <dialog
        className="navigation-drawer"
        id="mobile-navigation-drawer"
        ref={drawer}
        aria-label="Menu do Nook"
        onClose={() => {
          setMobileOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) drawer.current?.close();
        }}
      >
        <div className="drawer-surface">
          <div className="drawer-heading">
            <Link href="/" className="logo" onClick={closeMenus}>
              nook<span className="logo-dot">.</span>
            </Link>
            <button
              className="icon-button"
              aria-label="Fechar navegação"
              onClick={() => drawer.current?.close()}
            >
              <X size={21} />
            </button>
          </div>
          {navigation(true)}
          {account()}
        </div>
      </dialog>
    </div>
  );
}
