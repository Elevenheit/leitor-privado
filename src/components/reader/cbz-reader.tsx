/* eslint-disable @next/next/no-img-element -- Pages use private blob URLs. */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Nav } from "@/components/nav";
import { supabase, BUCKET } from "@/lib/supabase";
import { getReaderNavigationNeighbors } from "@/lib/data/reader-navigation";
import {
  saveReadingProgress,
  loadReadingProgress,
  ProgressConflictError,
} from "@/lib/data/progress";
import { patchProfileSettings } from "@/lib/data/preferences";
import { normalizeReaderPreferences } from "@/lib/reader-preferences";
import { createPrivateMediaUrl } from "@/lib/private-media-url";
import { CBZ_LIMITS, calculateReadingProgress } from "@/lib/media-rules";
import { toDataError } from "@/lib/data/errors";
import { mediaHref } from "@/lib/catalog";
import type { Book } from "@/lib/types";
import { useProgressPersistence } from "@/hooks/use-progress-persistence";
import { consumeReaderRestart } from "@/lib/reader-restart";

type Position = { page_number: number; scroll_ratio: number };
type Neighbor = Pick<Book, "id" | "media_type">;
const KEEP_PAGES = 5;

export function CbzReader({ id, user }: { id: string; user: User }) {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [images, setImages] = useState<Record<number, string>>({});
  const [status, setStatus] = useState("Abrindo capítulo…");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [comicMode, setComicMode] = useState<"vertical" | "page">("vertical");
  const [preferenceError, setPreferenceError] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const navigating = useRef(false);
  const [next, setNext] = useState<Neighbor | null>(null);
  const [previous, setPrevious] = useState<Neighbor | null>(null);
  const worker = useRef<Worker | null>(null);
  const urls = useRef<Record<number, string>>({});
  const requested = useRef(new Set<number>());
  const pages = useRef<Array<HTMLDivElement | null>>([]);
  const controlsRef = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const active = useRef(0);
  const restore = useRef<Position | null>(null);
  const restoring = useRef(false);
  const lastSaved = useRef({ page: -1, ratio: -1 });
  const restart = useRef<boolean | null>(null);

  const position = useCallback(() => {
    const index = active.current;
    const rect = pages.current[index]?.getBoundingClientRect();
    return {
      page: index,
      ratio:
        comicMode === "page"
          ? 0
          : rect
            ? Math.min(
                1,
                Math.max(0, (76 - rect.top) / Math.max(1, rect.height)),
              )
            : 0,
    };
  }, [comicMode]);

  const save = useCallback(
    async (force = false) => {
      if (!ready.current || restoring.current) return false;
      const current = position();
      const atEnd =
        current.page === count - 1 &&
        Boolean(urls.current[current.page]) &&
        (comicMode === "page" ||
          window.innerHeight + window.scrollY >=
            document.documentElement.scrollHeight - 12);
      if (atEnd) current.ratio = 1;
      if (
        !force &&
        current.page === lastSaved.current.page &&
        Math.abs(current.ratio - lastSaved.current.ratio) < 0.05
      )
        return true;
      setStatus("Salvando…");
      try {
        const result = await saveReadingProgress(user.id, id, {
          page_number: current.page + 1,
          scroll_ratio: current.ratio,
          reading_mode: "page",
          page_count: count,
          completed:
            atEnd ||
            calculateReadingProgress({
              mediaType: "cbz",
              pageNumber: current.page + 1,
              totalPages: count,
              scrollRatio: current.ratio,
            }).completed,
        });
        lastSaved.current = current;
        setStatus(
          result.synced
            ? "Progresso salvo"
            : "Salvo neste dispositivo · sincronização pendente",
        );
        setSaveError("");
        setConflict(false);
        return true;
      } catch (cause) {
        lastSaved.current = { page: -1, ratio: -1 };
        setStatus("Não foi possível salvar o progresso.");
        setSaveError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível salvar o progresso.",
        );
        setConflict(cause instanceof ProgressConflictError);
        return false;
      }
    },
    [comicMode, count, id, position, user.id],
  );
  const scheduleSave = useProgressPersistence(() => save(true), count > 0);

  const requestNear = useCallback(
    (index: number) => {
      for (
        let i = Math.max(0, index - 2);
        i <= Math.min(count - 1, index + 2);
        i++
      ) {
        if (urls.current[i] || requested.current.has(i)) continue;
        requested.current.add(i);
        worker.current?.postMessage({ index: i });
      }
      let changed = false;
      for (const key of Object.keys(urls.current)) {
        const i = Number(key);
        if (Math.abs(i - index) <= KEEP_PAGES) continue;
        URL.revokeObjectURL(urls.current[i]);
        delete urls.current[i];
        changed = true;
      }
      if (changed) setImages({ ...urls.current });
    },
    [count],
  );

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const ownedUrls = urls.current;
    const pending = requested.current;
    async function load() {
      try {
        if (restart.current === null) restart.current = consumeReaderRestart();
        const api = supabase();
        const [b, p, profile] = await Promise.all([
          api
            .from("books")
            .select(
              "id,title,file_path,size_bytes,series_id,media_type,total_pages",
            )
            .eq("id", id)
            .single(),
          loadReadingProgress(user.id, id),
          api
            .from("profiles")
            .select("preferences")
            .eq("id", user.id)
            .maybeSingle(),
        ]);
        if (!live) return;
        if (b.error || !b.data)
          throw new Error("Capítulo indisponível ou sem acesso.");
        const item = b.data as Book;
        if (item.media_type !== "cbz") {
          router.replace(`/read/${id}`);
          return;
        }
        if (item.size_bytes > CBZ_LIMITS.archive)
          throw new Error("CBZ maior que 40 MB.");
        if (!live) return;
        if (!profile.error)
          setComicMode(
            normalizeReaderPreferences(profile.data?.preferences).comicMode,
          );
        else
          setPreferenceError(
            "Não foi possível carregar o modo de leitura da conta.",
          );
        setBook(item);
        restore.current = restart.current ? null : (p as Position | null);
        restoring.current = Boolean(restore.current);
        void getReaderNavigationNeighbors(item)
          .then(async (neighbors) => {
            const ids = [neighbors.previousId, neighbors.nextId].filter(
              (value): value is string => Boolean(value),
            );
            if (!ids.length) return;
            const result = await api
              .from("books")
              .select("id,media_type")
              .in("id", ids);
            if (!live || result.error) return;
            setPrevious(
              ((result.data || []).find(
                (row) => row.id === neighbors.previousId,
              ) as Neighbor) || null,
            );
            setNext(
              ((result.data || []).find(
                (row) => row.id === neighbors.nextId,
              ) as Neighbor) || null,
            );
          })
          .catch(() => {
            if (live)
              setError(
                "Não foi possível carregar os capítulos vizinhos. Recarregue para tentar novamente.",
              );
          });
        let signed = await createPrivateMediaUrl(BUCKET, item.file_path);
        let response = await fetch(signed.url, { signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
          signed = await createPrivateMediaUrl(BUCKET, item.file_path);
          response = await fetch(signed.url, { signal: controller.signal });
        }
        if (!response.ok)
          throw new Error("Arquivo indisponível ou conexão interrompida.");
        const archive = await response.arrayBuffer();
        if (archive.byteLength > CBZ_LIMITS.archive)
          throw new Error("CBZ maior que 40 MB.");
        if (!live) return;
        const instance = new Worker(
          new URL("../../lib/cbz.worker.ts", import.meta.url),
        );
        worker.current = instance;
        instance.onerror = () => {
          if (live) setError("Não foi possível processar o CBZ.");
        };
        instance.onmessage = (event) => {
          if (!live) return;
          const message = event.data;
          if (message.error) {
            requested.current.delete(message.index);
            setError(
              toDataError(
                message.error,
                "Não foi possível abrir uma página do CBZ.",
                "cbz",
              ).message,
            );
          } else if (message.names) {
            const total = message.names.length as number;
            if (!total) {
              setError("O CBZ não contém páginas suportadas.");
              return;
            }
            setCount(total);
            const start = Math.min(
              total - 1,
              Math.max(0, (restore.current?.page_number || 1) - 1),
            );
            active.current = start;
            setPage(start);
            ready.current = true;
            setStatus("Capítulo aberto.");
          } else {
            const index = message.index as number;
            requested.current.delete(index);
            if (Math.abs(index - active.current) > KEEP_PAGES) return;
            const objectUrl = URL.createObjectURL(
              new Blob([message.data], { type: message.mime }),
            );
            if (urls.current[index]) URL.revokeObjectURL(urls.current[index]);
            urls.current[index] = objectUrl;
            setImages({ ...urls.current });
          }
        };
        instance.postMessage({ archive }, [archive]);
      } catch (cause) {
        if (live && !controller.signal.aborted)
          setError(
            toDataError(cause, "Não foi possível abrir o capítulo.", "storage")
              .message,
          );
      }
    }
    void load();
    return () => {
      live = false;
      ready.current = false;
      controller.abort();
      worker.current?.terminate();
      worker.current = null;
      pending.clear();
      Object.values(ownedUrls).forEach(URL.revokeObjectURL);
    };
  }, [id, router, user.id]);

  useEffect(() => {
    if (!count) return;
    requestNear(active.current);
    if (comicMode === "page") return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (entry.isIntersecting) visible.add(index);
          else visible.delete(index);
        }
        if (restoring.current || !visible.size) return;
        const center = 76;
        const inViewport = [...visible].filter((index) => {
          const rect = pages.current[index]?.getBoundingClientRect();
          return rect && rect.bottom > 76 && rect.top < window.innerHeight;
        });
        const containsCenter = inViewport.find((index) => {
          const rect = pages.current[index]!.getBoundingClientRect();
          return rect.top <= center && rect.bottom > center;
        });
        const current =
          containsCenter ??
          inViewport.sort(
            (a, b) =>
              Math.abs(
                (pages.current[a]?.getBoundingClientRect().top || 0) - center,
              ) -
              Math.abs(
                (pages.current[b]?.getBoundingClientRect().top || 0) - center,
              ),
          )[0];
        if (current === undefined) return;
        if (current !== active.current) {
          active.current = current;
          setPage(current);
          requestNear(current);
        }
      },
      { rootMargin: "600px 0px", threshold: 0 },
    );
    pages.current.forEach((node) => {
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [count, requestNear, comicMode]);

  useEffect(() => {
    if (!count) return;
    let frame = 0;
    const onScroll = () => {
      if (restoring.current) return;
      scheduleSave();
      if (frame || comicMode === "page") return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Binary search stays cheap even for hundreds of very tall pages.
        let low = 0,
          high = count - 1;
        const anchor = 76;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (
            (pages.current[mid]?.getBoundingClientRect().bottom || 0) <= anchor
          )
            low = mid + 1;
          else high = mid;
        }
        if (active.current !== low) {
          active.current = low;
          setPage(low);
          requestNear(low);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [comicMode, count, requestNear, scheduleSave]);

  function scrollToPage(
    index: number,
    layout: "vertical" | "page",
    behavior: ScrollBehavior = "instant",
  ) {
    const target = pages.current[index];
    if (!target) return;
    const navigationHeight =
      document.querySelector<HTMLElement>(".mobile-navigation")?.offsetHeight ||
      12;
    const offset =
      layout === "page"
        ? navigationHeight + (controlsRef.current?.offsetHeight || 0) + 12
        : 76;
    window.scrollTo({
      top: window.scrollY + target.getBoundingClientRect().top - offset,
      behavior,
    });
  }

  function goTo(index: number) {
    const target = Math.max(0, Math.min(count - 1, index));
    active.current = target;
    restore.current = { page_number: target + 1, scroll_ratio: 0 };
    restoring.current = !urls.current[target];
    setPage(target);
    requestNear(target);
    requestAnimationFrame(() =>
      scrollToPage(
        target,
        comicMode,
        comicMode === "page" ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      ),
    );
    scheduleSave();
  }

  async function navigate(href: string) {
    if (navigating.current) return;
    navigating.current = true;
    setDestination(href);
    try {
      if (await save(true)) router.push(href);
    } finally {
      navigating.current = false;
    }
  }
  function changeMode(value: "vertical" | "page") {
    setComicMode(value);
    void patchProfileSettings(user.id, { comicMode: value })
      .then(() => setPreferenceError(""))
      .catch(() =>
        setPreferenceError("Não foi possível guardar o modo na conta."),
      );
    requestAnimationFrame(() => scrollToPage(active.current, value));
  }

  return (
    <>
      <Nav back />
      <main
        id="main-content"
        tabIndex={-1}
        className={`media-page cbz-reader${comicMode === "page" ? " is-page-mode" : ""}`}
      >
        <Link
          className="back-link"
          href={book?.series_id ? `/series/${book.series_id}` : "/"}
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              !count
            )
              return;
            event.preventDefault();
            void navigate(book?.series_id ? `/series/${book.series_id}` : "/");
          }}
        >
          ← Voltar à obra
        </Link>
        <h1>{book?.title || "Sua próxima história"}</h1>
        {!count && !error && (
          <div className="comic-loading" aria-busy="true">
            <span className="reader-loading-mark" />
            <p>Abrindo capítulo…</p>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}{" "}
            <button onClick={() => location.reload()}>Tentar novamente</button>
          </p>
        )}
        {count > 0 && (
          <>
            <div
              className="comic-mode-choice"
              role="group"
              aria-label="Disposição das páginas"
            >
              <button
                aria-pressed={comicMode === "vertical"}
                onClick={() => changeMode("vertical")}
              >
                Rolagem vertical
              </button>
              <button
                aria-pressed={comicMode === "page"}
                onClick={() => changeMode("page")}
              >
                Uma página por vez
              </button>
            </div>
            {preferenceError && (
              <p role="status">
                {preferenceError}{" "}
                <button onClick={() => changeMode(comicMode)}>
                  Tentar novamente
                </button>
              </p>
            )}
            {saveError && (
              <div className="reader-save-feedback" role="alert">
                <p>{saveError}</p>
                <button
                  onClick={() =>
                    conflict
                      ? location.reload()
                      : destination
                        ? void navigate(destination)
                        : void save(true)
                  }
                >
                  {conflict
                    ? "Carregar posição recente"
                    : "Tentar salvar novamente"}
                </button>
                {destination && (
                  <button onClick={() => router.push(destination)}>
                    Sair sem salvar esta posição
                  </button>
                )}
              </div>
            )}
            <div className="media-controls cbz-controls" ref={controlsRef}>
              <button
                className="secondary-button"
                onClick={() => goTo(page - 1)}
                disabled={page === 0}
              >
                ← Anterior
              </button>
              <label>
                Página{" "}
                <select
                  value={page}
                  onChange={(event) => goTo(Number(event.target.value))}
                >
                  {Array.from({ length: count }, (_, index) => (
                    <option key={index} value={index}>
                      {index + 1} / {count}
                    </option>
                  ))}
                </select>{" "}
                <span>
                  {
                    calculateReadingProgress({
                      mediaType: "cbz",
                      pageNumber: page + 1,
                      totalPages: count,
                      scrollRatio: 0,
                    }).percent
                  }
                  %
                </span>
              </label>
              <button
                className="secondary-button"
                onClick={() => goTo(page + 1)}
                disabled={page === count - 1}
              >
                Próxima →
              </button>
            </div>
            <div
              className={`comic-pages webtoon-pages${comicMode === "page" ? " comic-single-page" : ""}`}
              aria-label="Páginas do capítulo"
            >
              {Array.from({ length: count }, (_, index) => (
                <div
                  key={index}
                  hidden={comicMode === "page" && index !== page}
                  ref={(node) => {
                    pages.current[index] = node;
                  }}
                  data-page-index={index}
                  className="webtoon-page cbz-page"
                >
                  {images[index] ? (
                    <img
                      src={images[index]}
                      alt={`Página ${index + 1}`}
                      loading={Math.abs(index - page) <= 2 ? "eager" : "lazy"}
                      decoding="async"
                      onError={() =>
                        setError(
                          `Não foi possível carregar a página ${index + 1}. Tente novamente.`,
                        )
                      }
                      onLoad={(event) => {
                        const image = event.currentTarget;
                        image.parentElement?.style.setProperty(
                          "aspect-ratio",
                          `${image.naturalWidth} / ${image.naturalHeight}`,
                        );
                        if (restoring.current && index === active.current)
                          requestAnimationFrame(() => {
                            const target = pages.current[index];
                            scrollToPage(index, comicMode);
                            if (comicMode === "vertical")
                              window.scrollBy({
                                top:
                                  (target?.getBoundingClientRect().height ||
                                    0) * (restore.current?.scroll_ratio || 0),
                                behavior: "instant",
                              });
                            restoring.current = false;
                            scheduleSave();
                          });
                      }}
                    />
                  ) : (
                    <span aria-label={`Carregando página ${index + 1}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="chapter-navigation">
              <div>
                {previous ? (
                  <Link
                    href={mediaHref(previous)}
                    onClick={(event) => {
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      void navigate(mediaHref(previous));
                    }}
                  >
                    ← Capítulo anterior
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link
                    href={mediaHref(next)}
                    onClick={(event) => {
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      void navigate(mediaHref(next));
                    }}
                  >
                    Próximo capítulo →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </div>
          </>
        )}
        <p role="status" className="muted">
          {status}
        </p>
      </main>
    </>
  );
}
