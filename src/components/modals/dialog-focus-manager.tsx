"use client";

import { useEffect } from "react";

const FOCUSABLE = `a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])`;

export function DialogFocusManager() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let returnFocus: HTMLElement | null = null;

    const focusInitial = (dialog: HTMLElement) => {
      const target = dialog.querySelector<HTMLElement>("[autofocus], [data-dialog-initial-focus], input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])") || dialog;
      if (target === dialog && !dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      target.focus({ preventScroll: true });
    };

    const sync = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
      const next = dialogs.at(-1) || null;
      if (next === activeDialog) return;
      if (!activeDialog && next) {
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        activeDialog = next;
        focusInitial(next);
        return;
      }
      if (activeDialog && next) {
        activeDialog = next;
        focusInitial(next);
        return;
      }
      activeDialog = null;
      const target = returnFocus;
      returnFocus = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
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
        const close = activeDialog.querySelector<HTMLElement>(".modal-close, [aria-label='Fechar'], [data-dialog-close]");
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
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}
