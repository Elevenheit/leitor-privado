"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** A pause saves promptly; sustained reading still saves at least every five seconds. */
export function useProgressPersistence(save: () => unknown, enabled = true) {
  const latest = useRef(save);
  const pending = useRef(false);
  const pause = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    latest.current = save;
  });
  const flush = useCallback(() => {
    if (pause.current) clearTimeout(pause.current);
    if (deadline.current) clearTimeout(deadline.current);
    pause.current = deadline.current = null;
    if (!pending.current) return;
    pending.current = false;
    void latest.current();
  }, []);
  const schedule = useCallback(() => {
    if (!enabled) return;
    pending.current = true;
    if (pause.current) clearTimeout(pause.current);
    pause.current = setTimeout(flush, 1000);
    if (!deadline.current) deadline.current = setTimeout(flush, 5000);
  }, [enabled, flush]);
  useEffect(() => {
    if (!enabled) return;
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const online = () => {
      pending.current = true;
      flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [enabled, flush]);
  // Run before DOM removal and the readers' passive worker/document cleanup.
  useLayoutEffect(() => () => flush(), [flush]);
  return schedule;
}
