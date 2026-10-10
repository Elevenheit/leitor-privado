/* eslint-disable @next/next/no-img-element -- Private signed URLs must stay in the browser. */
"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";

/** Decorative cover content; the containing link or adjacent heading names the work. */
export function SeriesCover({
  title,
  src,
  compact = false,
}: {
  title: string;
  src?: string;
  compact?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  const [loadedSrc, setLoadedSrc] = useState("");
  return src && src !== failedSrc ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={loadedSrc === src ? "cover-loaded" : "cover-loading"}
      onLoad={() => setLoadedSrc(src)}
      onError={() => setFailedSrc(src)}
    />
  ) : compact ? (
    <BookOpen size={23} strokeWidth={1.3} aria-hidden="true" />
  ) : (
    <>
      <span className="cover-glyph" aria-hidden="true">
        ✦
      </span>
      <strong className="cover-fallback-title" aria-hidden="true">
        {title}
      </strong>
    </>
  );
}
