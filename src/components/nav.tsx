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
  Library,
  History,
  Search,
  Plus,
  Info,
  Layers,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { loadLibraryAccess, hasLibraryAccess } from "@/lib/data/access";
import { catalogContextKey, clearCatalogContexts } from "@/lib/catalog-context";
import { syncPendingProgress } from "@/lib/data/progress";
import { Button } from "@/components/ui/button";
import { invalidateCatalogSnapshot } from "@/lib/data/catalog-cache";
import { publishAppPreferences } from "@/lib/app-experience";

const links = [
  { href: "/", label: "Início", icon: Home },
  { href: "/library", label: "Biblioteca", icon: Library },
  { href: "/continue", label: "Continuar lendo", icon: History },
  { href: "/search", label: "Buscar", icon: Search },
  { href: "/category/novel", label: "Light Novels", icon: BookOpen },
  { href: "/category/manga", label: "Mangás", icon: BookImage },
  { href: "/category/manhwa", label: "Manhwas", icon: Layers },
  { href: "/list", label: "Minha lista", icon: Bookmark },
];

export function Nav({
  back = false,
  onProfileLoad,
}: {
  back?: boolean;
  onProfileLoad?: (name: string) => void;
}) {
  const path = usePathname();
  const immersive = path.startsWith("/media/") || path.startsWith("/read/");
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [backHref, setBackHref] = useState("/");
  const [profile, setProfile] = useState({ name: "Meu espaço", avatar: "" });
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wide = expanded && !immersive;

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

  function expandRail() {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setExpanded(true);
  }
  function scheduleCollapse() {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => {
      const node = rail.current;
      if (
        node &&
        !node.matches(":hover") &&
        !node.contains(document.activeElement) &&
        !node.querySelector("details[open]")
      )
        setExpanded(false);
    }, 200);
  }

  useEffect(() => {
    let live = true;
    let pendingOwner: string | null = null;
    const synchronize = () => {
      if (pendingOwner)
        void syncPendingProgress(pendingOwner)
          .then((count) => {
            if (live && count)
              window.dispatchEvent(new Event("nook-progress-synced"));
          })
          .catch(() => {
            /* Pending positions remain on this device. */
          });
    };
    async function checkAdmin() {
      try {
        const api = supabase();
        const { data: session } = await api.auth.getSession();
        const userId = session.session?.user.id;
        if (!userId) return;
        pendingOwner = userId;
        synchronize();
        try {
          const route = sessionStorage.getItem(
            catalogContextKey(userId, "last-route"),
          );
          if (
            live &&
            route &&
            /^(\/|\/list|\/library|\/search|\/continue|\/category\/(novel|manga|manhwa))$/.test(
              route,
            )
          )
            setBackHref(route);
        } catch {
          /* The home route remains available without session storage. */
        }
        const access = await loadLibraryAccess(userId);
        if (live) setAdmin(hasLibraryAccess(access, true));
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
          .select("nickname,display_name,avatar_path,preferences")
          .eq("id", userId)
          .maybeSingle();
        if (!data) return;
        if (live) publishAppPreferences(userId, data.preferences);
        const avatar = data.avatar_path
          ? (
              await api.storage
                .from("profiles")
                .createSignedUrl(data.avatar_path, 3600)
            ).data?.signedUrl || ""
          : "";
        if (live) {
          setProfile({
            name: data.display_name || data.nickname || "Meu espaço",
            avatar,
          });
          onProfileLoad?.(data.display_name || data.nickname || "");
        }
      } catch {
        /* Keep the account menu fallback if the profile is unavailable. */
      }
    }
    void checkAdmin();
    void loadProfile();
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (desktop.matches) drawer.current?.close();
      setExpanded(false);
    };
    const closeOutside = (event: PointerEvent) => {
      root.current
        ?.querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((details) => {
          if (!details.contains(event.target as Node)) details.open = false;
        });
    };
    const onStorage = (event: StorageEvent) => {
      if (
        pendingOwner &&
        event.key?.startsWith(
          `nook-progress:v1:${encodeURIComponent(pendingOwner)}:`,
        )
      ) {
        invalidateCatalogSnapshot();
        window.dispatchEvent(new Event("nook-progress-changed"));
      }
    };
    desktop.addEventListener("change", closeOnDesktop);
    window.addEventListener("online", synchronize);
    window.addEventListener("storage", onStorage);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      live = false;
      desktop.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("online", synchronize);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [onProfileLoad]);

  function closeMenus() {
    root.current
      ?.querySelectorAll<HTMLDetailsElement>("details[open]")
      .forEach((details) => {
        details.open = false;
      });
    drawer.current?.close();
  }
  function openDrawer() {
    returnFocus.current = document.activeElement as HTMLElement | null;
    drawer.current?.showModal();
    setMobileOpen(true);
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
        onToggle={scheduleCollapse}
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
              clearCatalogContexts();
              invalidateCatalogSnapshot();
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
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <aside
        className="navigation-rail"
        aria-label="Navegação do Nook"
        ref={rail}
        onPointerEnter={(event) => {
          if (
            event.pointerType === "mouse" &&
            window.matchMedia("(hover: hover) and (pointer: fine)").matches
          )
            expandRail();
        }}
        onPointerLeave={scheduleCollapse}
        onFocusCapture={(event) => {
          // Touch buttons receive native focus before click; don't toggle twice.
          if (
            event.target.closest(".rail-toggle") &&
            window.matchMedia("(hover: none), (pointer: coarse)").matches
          )
            return;
          expandRail();
        }}
        onBlurCapture={scheduleCollapse}
      >
        <Link
          href={back ? backHref : "/"}
          className="rail-brand"
          aria-label={back ? "Nook, voltar à biblioteca" : "Nook, início"}
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
            onClick={() => {
              setExpanded(!wide);
            }}
            title={wide ? "Recolher navegação" : "Expandir navegação"}
          >
            {wide ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            <span className="rail-label">Recolher</span>
          </button>
        )}
        <div className="rail-content" id="desktop-rail-content">
          {navigation(wide)}
          {admin && (
            <Link
              href="/admin"
              className="rail-link rail-add"
              title={wide ? undefined : "Adicionar conteúdo"}
            >
              <Plus size={21} aria-hidden="true" />
              <span className="rail-label">Adicionar conteúdo</span>
              {!wide && (
                <span className="rail-tooltip" aria-hidden="true">
                  Adicionar conteúdo
                </span>
              )}
            </Link>
          )}
        </div>
        {account()}
      </aside>
      <header className="mobile-navigation">
        <Link href="/" className="logo" aria-label="Nook, início">
          nook<span className="logo-dot">.</span>
        </Link>
        {immersive && (
          <Button
            className="icon-button"
            ref={trigger}
            aria-label="Abrir navegação"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation-drawer"
            variant="icon"
            onClick={openDrawer}
          >
            <Menu size={22} />
          </Button>
        )}
      </header>
      {!immersive && (
        <nav className="bottom-navigation" aria-label="Navegação inferior">
          {[
            { href: "/", label: "Início", icon: Home },
            { href: "/library", label: "Biblioteca", icon: Library },
            { href: "/continue", label: "Continuar", icon: History },
            { href: "/search", label: "Buscar", icon: Search },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          <button
            ref={trigger}
            aria-label="Abrir navegação"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation-drawer"
            onClick={openDrawer}
          >
            <Menu size={21} aria-hidden="true" />
            <span>Mais</span>
          </button>
        </nav>
      )}
      <dialog
        className="navigation-drawer"
        id="mobile-navigation-drawer"
        ref={drawer}
        aria-label="Menu do Nook"
        onClose={() => {
          setMobileOpen(false);
          (returnFocus.current || trigger.current)?.focus();
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
