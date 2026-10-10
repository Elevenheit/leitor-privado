"use client";

import { useEffect } from "react";
import type { AppPreferences } from "@/lib/app-experience";

/** Optional, gesture-unlocked welcome tone. Never runs on route changes. */
export function AppExperience() {
  useEffect(() => {
    let preference: (AppPreferences & { ownerId: string }) | null = null;
    let audio: AudioContext | null = null;
    let closing: ReturnType<typeof setTimeout> | null = null;
    const played = new Set<string>();
    const stop = () => {
      if (closing) clearTimeout(closing);
      closing = null;
      if (audio) void audio.close().catch(() => {});
      audio = null;
    };
    const update = (event: Event) => {
      const next = (event as CustomEvent<AppPreferences & { ownerId: string }>)
        .detail;
      if (!next?.ownerId) return;
      if (preference?.ownerId !== next.ownerId || !next.welcomeSound) stop();
      preference = next;
      document.documentElement.dataset.reduceMotion = String(next.reduceMotion);
    };
    const clear = () => {
      stop();
      preference = null;
      delete document.documentElement.dataset.reduceMotion;
    };
    const play = (event: Event) => {
      if (
        audio ||
        !event.isTrusted ||
        !preference?.welcomeSound ||
        played.has(preference.ownerId)
      )
        return;
      if (
        event instanceof KeyboardEvent &&
        (event.ctrlKey || event.metaKey || event.altKey || event.repeat)
      )
        return;
      const owner = preference.ownerId;
      const key = `nook-welcome-played:${owner}`;
      try {
        if (sessionStorage.getItem(key)) {
          played.add(owner);
          return;
        }
      } catch {
        /* Memory also prevents repetition. */
      }
      if (!window.AudioContext) return;
      try {
        audio = new AudioContext();
        const context = audio;
        // Resume is requested synchronously inside a trusted gesture.
        void context
          .resume()
          .then(() => {
            if (
              audio !== context ||
              preference?.ownerId !== owner ||
              !preference.welcomeSound ||
              context.state !== "running"
            )
              return;
            played.add(owner);
            try {
              sessionStorage.setItem(key, "1");
            } catch {
              /* Optional storage. */
            }
            const now = context.currentTime;
            [392, 587.33].forEach((frequency, index) => {
              const oscillator = context.createOscillator();
              const gain = context.createGain();
              const start = now + index * 0.09;
              oscillator.type = "sine";
              oscillator.frequency.value = frequency;
              gain.gain.setValueAtTime(0, start);
              gain.gain.linearRampToValueAtTime(0.025, start + 0.035);
              gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
              oscillator.connect(gain);
              gain.connect(context.destination);
              oscillator.start(start);
              oscillator.stop(start + 0.65);
            });
            closing = setTimeout(stop, 900);
          })
          .catch(stop);
      } catch {
        stop();
      }
    };
    window.addEventListener("nook-app-preferences", update);
    window.addEventListener("nook-app-preferences-clear", clear);
    document.addEventListener("pointerdown", play);
    document.addEventListener("keydown", play);
    return () => {
      window.removeEventListener("nook-app-preferences", update);
      window.removeEventListener("nook-app-preferences-clear", clear);
      document.removeEventListener("pointerdown", play);
      document.removeEventListener("keydown", play);
      clear();
    };
  }, []);
  return null;
}
