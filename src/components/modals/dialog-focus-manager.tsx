"use client";

import { useEffect } from "react";

const FOCUSABLE = `a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])`;

export function DialogFocusManager() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let previousFocus = document.activeElement as HTMLElement | null;
    const origins = new Map<HTMLElement, HTMLElement | null>();

    const focusInitial = (dialog: HTMLElement) => {
      const target = dialog.querySelector<HTMLElement>("[autofocus], [data-dialog-initial-focus], input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])") || dialog;
      if (target === dialog && !dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      target.focus({ preventScroll: true });
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const modal = target.closest('[aria-modal="true"]');
      if (activeDialog?.isConnected && !modal) { focusInitial(activeDialog); return; }
      if (!modal || modal === activeDialog) previousFocus = target;
    };
    document.addEventListener("focusin", onFocusIn, true);

    const sync = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).at(-1) || null;
      if (next === activeDialog) return;
      const previous = activeDialog;
      if (previous && (!previous.isConnected || !next || origins.has(next))) {
        const target = origins.get(previous);
        origins.delete(previous);
        activeDialog = next;
        if (target?.isConnected && (!next || next.contains(target))) target.focus({ preventScroll: true });
        else if (next) focusInitial(next);
        return;
      }
      if (next) {
        origins.set(next, previousFocus);
        activeDialog = next;
        if (!next.contains(document.activeElement)) focusInitial(next);
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
    sync();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeDialog?.isConnected) {
        sync();
        return;
      }
      if (event.key === "Escape") {
        const close = activeDialog.querySelector<HTMLElement>(".modal-close, [aria-label^='Fechar'], [data-dialog-close]");
        if (close && !close.hasAttribute("disabled")) {
          event.preventDefault();
          event.stopPropagation();
          close.click();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => item.getClientRects().length > 0);
      if (!elements.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}
