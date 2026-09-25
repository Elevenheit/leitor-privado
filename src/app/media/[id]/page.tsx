/* eslint-disable @next/next/no-img-element -- Private signed and blob URLs must stay in the browser, avoiding an image proxy. */
"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { Nav } from "@/components/nav";
import { supabase, BUCKET } from "@/lib/supabase";
import { introTarget, CBZ_LIMITS } from "@/lib/media-rules";
import type { Book } from "@/lib/types";
import type { Format } from "@/lib/catalog";
import { mediaHref } from "@/lib/catalog";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <AuthGate>{(u) => <Media key={id} id={id} user={u} />}</AuthGate>;
}
function Media({ id, user }: { id: string; user: User }) {
  const [book, setBook] = useState<Book | null>(null);
  const [seriesFormat, setSeriesFormat] = useState<Format | null>(null);
  const webtoon = book?.media_type === "cbz" && (seriesFormat === "manga" || seriesFormat === "manhwa");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Abrindo mídia…");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [images, setImages] = useState<Record<number, string>>({});
  const [vertical, setVertical] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [fit, setFit] = useState("width");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [next, setNext] = useState<Book | null>(null);
  const worker = useRef<Worker | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const restore = useRef(0);
  const lastSave = useRef(0);
  const objectUrls = useRef<Record<number, string>>({});
  const requestedPages = useRef(new Set<number>());
  const webtoonRef = useRef(false);
  const pageRef = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const ready = useRef(false);
  const scrollRestore = useRef(0);
  const imageArea = useRef<HTMLDivElement | null>(null);
  const save = useCallback(
    async (seconds: number, p: number, completed = false, ratio = 0) => {
      if (!ready.current) return;
      const { error } = await supabase()
        .from("reading_progress")
        .upsert(
          {
            owner_id: user.id,
            book_id: id,
            page_number: p + 1,
            position_seconds: Math.max(0, seconds),
            scroll_ratio: Math.min(1, Math.max(0, ratio)),
            reading_mode: "page",
            completed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "owner_id,book_id" },
        );
      setStatus(
        error ? "Progresso não salvo. Confira a conexão." : "Progresso salvo",
      );
    },
    [id, user.id],
  );
  useEffect(() => {
    const urls = objectUrls.current;
    let live = true;
    const controller = new AbortController();
    async function load() {
      try {
        const api = supabase();
        const [b, p] = await Promise.all([
          api.from("books").select("*").eq("id", id).single(),
          api
            .from("reading_progress")
            .select("page_number,position_seconds,scroll_ratio")
            .eq("owner_id", user.id)
            .eq("book_id", id)
            .maybeSingle(),
        ]);
        if (b.error || p.error)
          throw Error("Mídia indisponível ou acesso encerrado.");
        if (!live) return;
        const item = b.data as Book;
        setBook(item);
        if (item.series_id) {
          const series = await api.from("series").select("format").eq("id", item.series_id).maybeSingle();
          if (series.error) throw Error("NÃ£o foi possÃ­vel carregar o formato da obra.");
          if (live) setSeriesFormat((series.data?.format as Format | null) || null);
        }
        restore.current = p.data?.position_seconds || 0;
        scrollRestore.current = p.data?.scroll_ratio || 0;
        pageRef.current = Math.max(0, (p.data?.page_number || 1) - 1);
        setPage(pageRef.current);
        const signed = await api.storage
          .from(BUCKET)
          .createSignedUrl(item.file_path, 3600);
        if (signed.error || !signed.data)
          throw Error("Não foi possível abrir o arquivo privado.");
        if (item.media_type === "video") {
          setUrl(signed.data.signedUrl);
          ready.current = true;
          setStatus("Pronto para assistir.");
        } else if (item.media_type === "cbz") {
          if (item.size_bytes > CBZ_LIMITS.archive)
            throw Error("CBZ maior que 40 MB.");
          const response = await fetch(signed.data.signedUrl, {
            signal: controller.signal,
          });
          if (!response.ok)
            throw Error("Arquivo ausente ou conexão interrompida.");
          const reader = response.body?.getReader();
          if (!reader) throw Error("Não foi possível ler o arquivo.");
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const r = await reader.read();
            if (r.done) break;
            size += r.value.length;
            if (size > CBZ_LIMITS.archive) {
              await reader.cancel();
              throw Error("CBZ maior que 40 MB.");
            }
            chunks.push(r.value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const c of chunks) {
            bytes.set(c, offset);
            offset += c.length;
          }
          if (!live) return;
          const w = new Worker(
            new URL("../../../lib/cbz.worker.ts", import.meta.url),
          );
          worker.current = w;
          w.onerror = () => setError("Falha ao processar CBZ.");
          w.onmessage = (e) => {
            if (!live) return;
            if (e.data.error) setError(e.data.error);
            else if (e.data.names) {
              setCount(e.data.names.length);
              const start = Math.min(pageRef.current, e.data.names.length - 1);
              pageRef.current = start;
              setPage(start);
              ready.current = true;
              setStatus("CBZ aberto.");
            } else {
              const mime = /\.png$/i.test(e.data.name)
                ? "image/png"
                : /\.webp$/i.test(e.data.name)
                  ? "image/webp"
                  : "image/jpeg";
              const url = URL.createObjectURL(
                new Blob([e.data.data], { type: mime }),
              );
              const index = e.data.index;
              requestedPages.current.delete(index);
              if (Math.abs(index - pageRef.current) > (webtoonRef.current ? 7 : 1)) {
                URL.revokeObjectURL(url);
                return;
              }
              if (objectUrls.current[index])
                URL.revokeObjectURL(objectUrls.current[index]);
              objectUrls.current[index] = url;
              setImages({ ...objectUrls.current });
            }
          };
          w.postMessage({ archive: bytes.buffer }, [bytes.buffer]);
        } else throw Error("Abra este arquivo no leitor de PDF.");
        if (item.series_id) {
          const r = await api
            .from("books")
            .select("*")
            .eq("series_id", item.series_id)
            .order("sort_order")
            .order("chapter_number")
            .order("id");
          const rows = (r.data || []) as Book[];
          const i = rows.findIndex((x) => x.id === id);
          if (live) setNext(rows[i + 1] || null);
        }
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Falha de conexão.");
      }
    }
    void load();
    return () => {
      live = false;
      ready.current = false;
      controller.abort();
      worker.current?.terminate();
      Object.values(urls).forEach(URL.revokeObjectURL);
    };
  }, [id, user.id]);
  useEffect(() => {
    pageRef.current = page;
    if (!count) return;
    const windowSize = webtoon ? 6 : 1;
    for (const key of Object.keys(objectUrls.current)) {
      const i = Number(key);
      if (Math.abs(i - page) > windowSize) {
        URL.revokeObjectURL(objectUrls.current[i]);
        delete objectUrls.current[i];
      }
    }
    for (let i = Math.max(0, page - windowSize); i <= Math.min(count - 1, page + windowSize); i++) {
      if (!objectUrls.current[i] && !requestedPages.current.has(i)) {
        requestedPages.current.add(i);
        worker.current?.postMessage({ index: i });
      }
    }
  }, [page, count, webtoon]);
  useEffect(() => {
    if (!count) return;
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).matches("input,select,textarea,button"))
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const direction = (e.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
        setPage((p) => {
          const n = Math.max(0, Math.min(count - 1, p + direction));
          void save(0, n, n === count - 1);
          return n;
        });
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [count, rtl, save]);
  function move(n: number) {
    const p = Math.max(0, Math.min(count - 1, n));
    setPage(p);
    scrollRestore.current = 0;
    imageArea.current?.scrollTo(0, 0);
    void save(0, p, p === count - 1);
  }
  const target = introTarget(
    Boolean(book?.skip_intro),
    book?.intro_end || 90,
    duration,
    time,
  );
  const [visiblePages, setVisiblePages] = useState<Record<number, boolean>>({});
  webtoonRef.current = webtoon;
  const pageElements = useRef<Record<number, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!webtoon || !count) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.pageIndex);
        if (entry.isIntersecting) {
          const area = imageArea.current;
          const candidates = Object.entries(pageElements.current).filter(([, node]) => node && node.getBoundingClientRect().bottom > (area?.getBoundingClientRect().top || 0) && node.getBoundingClientRect().top < (area?.getBoundingClientRect().bottom || innerHeight));
          const center = (area?.getBoundingClientRect().top || 0) + (area?.clientHeight || innerHeight) / 2;
          const current = candidates.sort((a, b) => Math.abs((a[1]?.getBoundingClientRect().top || 0) - center) - Math.abs((b[1]?.getBoundingClientRect().top || 0) - center))[0];
          const activeIndex = current ? Number(current[0]) : index;
          pageRef.current = activeIndex;
          setPage(activeIndex);
          for (let i = Math.max(0, activeIndex - 6); i <= Math.min(count - 1, activeIndex + 6); i++) {
            if (!objectUrls.current[i] && !requestedPages.current.has(i)) {
              requestedPages.current.add(i);
              worker.current?.postMessage({ index: i });
            }
          }
          if (Date.now() - lastSave.current > 1500) {
            lastSave.current = Date.now();
            const el = area;
            void save(0, index, index === count - 1, el ? el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight) : 0);
          }
        }
      }
    }, { root: imageArea.current, rootMargin: "1200px 0px", threshold: 0.01 });
    Object.values(pageElements.current).forEach((element) => { if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [webtoon, count, save]);
  useEffect(() => {
    if (!webtoon || !count || !imageArea.current || !scrollRestore.current) return;
    const el = imageArea.current;
    requestAnimationFrame(() => {
      const target = pageElements.current[pageRef.current];
      if (target) target.scrollIntoView({ block: "start" });
      else el.scrollTop = scrollRestore.current * Math.max(0, el.scrollHeight - el.clientHeight);
      scrollRestore.current = 0;
    });
  }, [webtoon, count]);
  return (
    <>
      <Nav back />
      <main className="media-page">
        <Link href={book?.series_id ? `/series/${book.series_id}` : "/"}>
          ← Voltar à obra
        </Link>
        <h1>{book?.title || "Sua próxima história"}</h1>
        {error ? (
          <div className="error" role="alert">
            {error}
            <button onClick={() => location.reload()}>Tentar novamente</button>
          </div>
        ) : book?.media_type === "video" ? (
          <>
            <video
              ref={video}
              src={url}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDuration(v.duration);
                v.currentTime = Math.min(
                  restore.current,
                  Math.max(0, v.duration - 0.25),
                );
                setStatus("Pronto para assistir.");
              }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                setTime(v.currentTime);
                if (!v.paused && Date.now() - lastSave.current > 5000) {
                  lastSave.current = Date.now();
                  void save(v.currentTime, 0, false);
                }
              }}
              onPause={(e) =>
                void save(e.currentTarget.currentTime, 0, e.currentTarget.ended)
              }
              onSeeked={(e) =>
                void save(e.currentTarget.currentTime, 0, e.currentTarget.ended)
              }
              onEnded={(e) => void save(e.currentTarget.duration, 0, true)}
              onError={() =>
                setError(
                  "Vídeo ausente, acesso expirado ou formato incompatível. Reabra para renovar o acesso.",
                )
              }
              onPlaying={() => setStatus("Reproduzindo")}
            />
            {target !== null && (
              <button
                className="primary-button skip-intro"
                onClick={() => {
                  if (video.current) {
                    video.current.currentTime = target;
                    setTime(target);
                    void save(target, 0, target === duration);
                  }
                }}
              >
                Pular abertura
              </button>
            )}
          </>
        ) : count > 0 ? (
          <>
            {!webtoon && <div className="media-controls">
              <button onClick={() => move(page - 1)} disabled={!page}>
                ← Anterior
              </button>
              <span>
                {page + 1} / {count}
              </span>
              <button
                onClick={() => move(page + 1)}
                disabled={page === count - 1}
              >
                Próxima →
              </button>
              <label>
                Modo
                <select
                  value={vertical ? "vertical" : "single"}
                  onChange={(e) => setVertical(e.target.value === "vertical")}
                >
                  <option value="single">Página única</option>
                  <option value="vertical">Rolagem vertical</option>
                </select>
              </label>
              <label>
                Direção
                <select
                  value={rtl ? "rtl" : "ltr"}
                  onChange={(e) => setRtl(e.target.value === "rtl")}
                >
                  <option value="ltr">Esquerda → direita</option>
                  <option value="rtl">Direita → esquerda</option>
                </select>
              </label>
              <label>
                Ajuste
                <select value={fit} onChange={(e) => setFit(e.target.value)}>
                  <option value="width">Largura</option>
                  <option value="screen">Tela</option>
                </select>
              </label>
              <label>
                Zoom
                <input
                  type="range"
                  min="60"
                  max="200"
                  step="10"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
            </div>}
            <div
              ref={imageArea}
              className={`comic-pages ${webtoon ? "webtoon-pages" : fit}`}
              onTouchStart={(e) => {
                if (e.touches.length === 1)
                  touchStart.current = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                  };
                else touchStart.current = null;
              }}
              onTouchEnd={(e) => {
                const start = touchStart.current;
                touchStart.current = null;
                if (
                  !start || webtoon ||
                  vertical ||
                  zoom > 100 ||
                  e.changedTouches.length !== 1
                )
                  return;
                const dx = e.changedTouches[0].clientX - start.x;
                const dy = e.changedTouches[0].clientY - start.y;
                if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2)
                  move(page + (dx < 0 ? 1 : -1) * (rtl ? -1 : 1));
              }}
              onScroll={(e) => {
                if (!webtoon && Date.now() - lastSave.current > 1500) {
                  lastSave.current = Date.now();
                  const el = e.currentTarget;
                  void save(
                    0,
                    page,
                    page === count - 1,
                    el.scrollTop /
                      Math.max(1, el.scrollHeight - el.clientHeight),
                  );
                }
              }}
            >
              {(webtoon ? Array.from({ length: count }, (_, i) => i) : vertical ? [page, Math.min(page + 1, count - 1)] : [page])
                .filter((x, i, a) => a.indexOf(x) === i)
                .map((i) => webtoon ? (
                  <div key={i} data-page-index={i} ref={(element) => { pageElements.current[i] = element; }} className="webtoon-page" style={{ aspectRatio: "0.72", maxWidth: "100%" }}>
                    {images[i] ? <img src={images[i]} alt={`PÃ¡gina ${i + 1}`} onLoad={(e) => {
                      const image = e.currentTarget;
                      const container = image.parentElement;
                      if (container) container.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
                      if (image.naturalWidth * image.naturalHeight > 24000000) setError("Imagem acima de 24 megapixels. Reexporte o capÃ­tulo em resoluÃ§Ã£o menor.");
                    }} /> : <span>Carregando pÃ¡ginaâ€¦</span>}
                  </div>
                ) : images[i] ? (
                    <img
                      key={i}
                      src={images[i]}
                      alt={`Página ${i + 1}`}
                      style={{ width: `${zoom}%` }}
                      onLoad={(e) => {
                        if (
                          e.currentTarget.naturalWidth *
                            e.currentTarget.naturalHeight >
                          24000000
                        ) {
                          setError(
                            "Imagem acima de 24 megapixels. Reexporte o capítulo em resolução menor.",
                          );
                          return;
                        }
                        if (
                          i === page &&
                          scrollRestore.current &&
                          imageArea.current
                        ) {
                          const el = imageArea.current;
                          el.scrollTop =
                            scrollRestore.current *
                            (el.scrollHeight - el.clientHeight);
                          scrollRestore.current = 0;
                        }
                      }}
                    />
                  ) : (
                    <p key={i}>Carregando página…</p>
                  ),
                )}
            </div>
            {!webtoon && <button
              className="primary-button"
              disabled={page === count - 1}
              onClick={() => move(page + 1)}
            >
              Continuar →
            </button>}
          </>
        ) : null}
        <p role="status" className="muted">
          {status}
        </p>
        {next && (
          <Link className="primary-button" href={mediaHref(next)}>
            Próximo {book?.media_type === "video" ? "episódio" : "capítulo"} →
          </Link>
        )}
      </main>
    </>
  );
}
