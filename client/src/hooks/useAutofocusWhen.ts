import { useEffect, type RefObject } from "react";
import { isRouteAutofocusBlockedByOpenDialog } from "@/lib/routeAutofocus";

type UseAutofocusWhenOptions = {
  /** Back-off delays (ms) before each focus attempt. */
  retryDelaysMs?: number[];
};

const DEFAULT_RETRY_DELAYS_MS = [0, 50, 120, 250, 500];

function isActuallyFocusable(el: HTMLElement): boolean {
  // Skip hidden/inert subtrees.
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  if (el.closest("[inert]")) return false;

  const style = window.getComputedStyle(el);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (style.opacity === "0") return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  // Disabled/readOnly elements should not be focused.
  if ("disabled" in el && (el as HTMLInputElement | HTMLButtonElement).disabled) return false;
  if ("readOnly" in el && (el as HTMLInputElement).readOnly) return false;

  return true;
}

/**
 * Focuses a specific target element when `enabled` becomes true.
 * Designed for inline modals/panels that render after a state change (no route change).
 */
export default function useAutofocusWhen<T extends HTMLElement>(
  enabled: boolean,
  targetRef: RefObject<T | null>,
  options: UseAutofocusWhenOptions = {},
) {
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const timers: number[] = [];

    const attemptFocus = (attemptIndex: number) => {
      if (cancelled) return;
      if (isRouteAutofocusBlockedByOpenDialog()) return;

      const el = targetRef.current;
      if (!el) {
        if (attemptIndex >= retryDelaysMs.length - 1) return;
      } else {
        if (!isActuallyFocusable(el)) return;

        const active = document.activeElement;
        if (active && (active === el || (el instanceof HTMLElement && el.contains(active)))) return;

        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
        return;
      }

      if (attemptIndex >= retryDelaysMs.length - 1) return;

      const nextDelay = retryDelaysMs[attemptIndex + 1];
      const t = window.setTimeout(() => {
        // Defer focus until animations/conditional rendering flush.
        requestAnimationFrame(() => attemptFocus(attemptIndex + 1));
      }, nextDelay);
      timers.push(t);
    };

    const t0 = window.setTimeout(() => {
      requestAnimationFrame(() => attemptFocus(0));
    }, retryDelaysMs[0]);
    timers.push(t0);

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [enabled, targetRef, retryDelaysMs]);
}

