import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';

/** Extra gap (px) between the field's bottom edge and the keyboard top. */
const PADDING = 16;

/**
 * Tracks overflow containers that had paddingBottom injected so they can be
 * scrolled when their content doesn't naturally exceed the viewport height.
 * Keyed by element; value is the original inline paddingBottom (to restore).
 */
const injectedPaddingContainers = new Map<HTMLElement, string>();

function cleanupInjectedPaddings(): void {
  for (const [el, origPadding] of injectedPaddingContainers) {
    el.style.paddingBottom = origPadding;
  }
  injectedPaddingContainers.clear();
}

/** Return the height of any fixed bottom-nav overlay that is currently visible. */
function getFixedBottomOverlayHeight(): number {
  const vpHeight = window.visualViewport?.height ?? window.innerHeight;
  const viewportBottomY = vpHeight;

  // 1) Bottom nav (known fixed element in this app)
  const bottomNav = document.querySelector('nav.bottom-nav') as HTMLElement | null;
  let sum = 0;
  if (bottomNav) {
    const style = window.getComputedStyle(bottomNav);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      sum += bottomNav.getBoundingClientRect().height || 0;
    }
  }

  // 2) Other fixed bottom bars (e.g. ArrivalsPage submit bar) that can visually
  // cover inputs once the keyboard opens. We approximate by finding elements
  // with `position: fixed` whose bottom edge is near the viewport bottom.
  // This is intentionally heuristic; we keep the threshold tight to avoid
  // counting unrelated fixed UI.
  const fixedCandidates = Array.from(document.querySelectorAll<HTMLElement>('[class*="fixed"]'));
  for (const el of fixedCandidates) {
    if (el === bottomNav) continue;
    const style = window.getComputedStyle(el);
    if (style.position !== 'fixed') continue;
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) continue;

    // Near bottom of viewport.
    const distanceToBottom = viewportBottomY - rect.bottom;
    if (distanceToBottom < 0 || distanceToBottom > 130) continue;

    // Don't count overlays that are taller than half the viewport.
    if (rect.height > vpHeight * 0.6) continue;

    sum += rect.height;
  }

  // Cap to avoid extreme over-subtraction.
  return Math.min(sum, vpHeight * 0.45);
}

function getEffectiveKeyboardHeight(storedKb: number): number {
  const vp = window.visualViewport;
  if (!vp) return storedKb;
  return Math.max(storedKb, Math.max(0, window.innerHeight - vp.height));
}

/**
 * Compute the Y pixel limit below which content is hidden by the keyboard.
 * Uses visual viewport shrinkage when available (most reliable), otherwise
 * subtracts the stored keyboard height from the full layout height.
 */
function getAvailableBottom(effectiveKb: number): number {
  const vp = window.visualViewport;
  const vpH = vp?.height ?? window.innerHeight;
  const bottomNav = getFixedBottomOverlayHeight();
  const hasVpShrink = !!vp && (window.innerHeight - vpH) > 50;
  // When visual viewport already shrank, it already represents usable height.
  return hasVpShrink
    ? vpH - bottomNav - PADDING
    : vpH - effectiveKb - bottomNav - PADDING;
}

/**
 * Walk ALL scroll ancestors of `el` from innermost to outermost and scroll
 * each one so that `el` moves above the keyboard.
 *
 * If the element is still covered after the ancestor walk (e.g. because the
 * outermost scroll container's content fits the full viewport so it cannot
 * scroll naturally), we inject a temporary paddingBottom on it to force
 * overflow, enabling the scroll. The padding is cleaned up on keyboard hide.
 *
 * This handles nested scroll containers like ArrivalsPage's LotsScrollPanel
 * (inner, fixed-height) inside the form's full-screen fixed panel whose
 * overflow container often has content shorter than the viewport.
 */
function ensureVisible(el: Element, keyboardHeight: number): void {
  const effectiveKb = getEffectiveKeyboardHeight(keyboardHeight);
  if (effectiveKb <= 0) return;

  const initialRect = el.getBoundingClientRect();
  if (initialRect.width <= 0 || initialRect.height <= 0) return;

  const availableBottom = getAvailableBottom(effectiveKb);
  if (initialRect.bottom <= availableBottom) return; // already visible

  // Walk up ALL scroll-overflow ancestors and scroll each one as needed.
  // NOTE: No `canScroll` gate — even if the container appears non-scrollable
  // right now, layout may have settled by a later retry; always attempt.
  let outerScrollAncestor: HTMLElement | null = null;
  let node: Element | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      // Re-read element position after each ancestor scroll so the deltas are fresh.
      const elRect = el.getBoundingClientRect();
      if (elRect.bottom > availableBottom) {
        (node as HTMLElement).scrollTop += elRect.bottom - availableBottom;
      }
      outerScrollAncestor = node as HTMLElement; // keep updating → ends up as outermost
    }
    node = node.parentElement;
  }

  // After ancestor scrolling, check if the element is still covered.
  // On mobile, the form sits inside a `position:fixed; inset-0` panel whose
  // overflow container height equals the full screen. When the keyboard is open
  // and the form content is shorter than the screen, the container cannot scroll
  // naturally. To fix this, inject a temporary paddingBottom that forces content
  // to overflow — making scrollTop work — then scroll the container.
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const covered = rect.bottom - availableBottom;
    if (covered <= 1) return; // already visible after ancestor scrolling

    if (outerScrollAncestor) {
      // Save original inline padding once (restored on keyboardDidHide).
      if (!injectedPaddingContainers.has(outerScrollAncestor)) {
        injectedPaddingContainers.set(outerScrollAncestor, outerScrollAncestor.style.paddingBottom);
      }
      // Ensure scrollHeight - clientHeight >= covered + PADDING so that
      // scrollTop can move far enough to bring the element above the keyboard.
      const needed = outerScrollAncestor.clientHeight + covered + PADDING;
      const current = outerScrollAncestor.scrollHeight;
      if (needed > current) {
        const extra = needed - current;
        const existingPb = parseFloat(window.getComputedStyle(outerScrollAncestor).paddingBottom) || 0;
        outerScrollAncestor.style.paddingBottom = `${existingPb + extra}px`;
      }

      requestAnimationFrame(() => {
        const elRect = el.getBoundingClientRect();
        const delta = elRect.bottom - availableBottom;
        if (delta > 1) {
          outerScrollAncestor!.scrollTop += delta;
        }
        // If the element is STILL covered (most often when a new field is inserted
        // and auto-focused, like "+ Add Lot"), fall back to scrollIntoView as a
        // last resort. This tends to handle edge timing/layout cases more reliably.
        requestAnimationFrame(() => {
          const after = el.getBoundingClientRect();
          const stillCovered = after.bottom - availableBottom;
          if (stillCovered > 1 && el instanceof HTMLElement) {
            try {
              el.scrollIntoView({ block: 'center', inline: 'nearest' });
            } catch {
              el.scrollIntoView();
            }
          }
        });
      });
    } else {
      // No scroll ancestor found (e.g. plain window-scrolled page): fall back
      // to scrolling the window directly.
      window.scrollBy({ top: covered, behavior: 'smooth' });
    }
  });
}

/** Return true if the element is a text-entry input/textarea that opens a keyboard. */
function isEditableField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if ((el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('inputmode') === 'none') return false;
  const nonTextTypes = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden', 'range', 'color']);
  if (el instanceof HTMLInputElement) {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (nonTextTypes.has(type)) return false;
  }
  return true;
}

const KeyboardAvoidance: React.FC = () => {
  const keyboardHeightRef = useRef<number>(0);
  const lastFocusedRef = useRef<(HTMLInputElement | HTMLTextAreaElement) | null>(null);
  const lastPointerDownAtRef = useRef<number>(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform();

    // iOS: allow WebView scroll + "Body" resize so it compresses above the keyboard.
    if (platform === 'ios') {
      Keyboard.setScroll({ isDisabled: false }).catch(() => {});
      Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {});
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    // Always read the *latest* keyboard height AND active element at execution
    // time. This covers races where:
    //   • focus moves before keyboardHeightRef updates (stale 0 height), and
    //   • ClickToFocusNewFields focuses a newer element between scheduling and
    //     execution (auto-focus on runtime-inserted inputs like "+ Add Lot").
    const scheduleEnsureVisible = (el: Element | null, delays = [0, 80, 180, 320, 520, 900, 1300, 2000, 2500]) => {
      if (!el) return;
      for (const d of delays) {
        const run = () => {
          // Prefer the currently focused element if it's editable; otherwise fall
          // back to the element captured at scheduling time.
          const active = document.activeElement;
          const target = isEditableField(active) ? active : el;
          ensureVisible(target, keyboardHeightRef.current);
        };
        if (d === 0) {
          requestAnimationFrame(run);
        } else {
          window.setTimeout(run, d);
        }
      }
    };

    // ── Focus tracking ────────────────────────────────────────────────────────
    const handleFocusIn = (e: FocusEvent) => {
      if (!isEditableField(e.target)) return;
      lastFocusedRef.current = e.target;

      // Always schedule checks. For dynamic UIs, the keyboard may open *after*
      // focus is applied (or after layout changes), so later checks catch it.
      // Delays up to 2500 ms to cover Framer Motion animations + React re-renders.
      scheduleEnsureVisible(e.target);
    };
    document.addEventListener('focusin', handleFocusIn, true);

    // Track pointer-downs so MutationObserver knows to react after user interaction.
    const handlePointerDown = () => { lastPointerDownAtRef.current = Date.now(); };
    document.addEventListener('pointerdown', handlePointerDown, true);

    // ── Capacitor Keyboard events ─────────────────────────────────────────────
    const listenerHandles: PluginListenerHandle[] = [];

    const registerListeners = async () => {
      const willShow = await Keyboard.addListener('keyboardWillShow', (info) => {
        keyboardHeightRef.current = info.keyboardHeight;
        const el = lastFocusedRef.current
          ?? (isEditableField(document.activeElement) ? document.activeElement : null);
        scheduleEnsureVisible(el);
      });

      const didShow = await Keyboard.addListener('keyboardDidShow', (info) => {
        keyboardHeightRef.current = info.keyboardHeight;
        const el = lastFocusedRef.current
          ?? (isEditableField(document.activeElement) ? document.activeElement : null);
        scheduleEnsureVisible(el);
      });

      const didHide = await Keyboard.addListener('keyboardDidHide', () => {
        keyboardHeightRef.current = 0;
        // Delay cleanup: when the user taps a button (e.g. "+ Add Lot") while a text
        // field is focused, iOS briefly dismisses the keyboard before re-showing it for
        // the newly focused field. If we clean up injected padding immediately, the
        // outer scroll container loses its extra scrollable space before the scroll to
        // the new field completes. Waiting 350 ms lets keyboardWillShow fire first; we
        // only clean up if the keyboard is still hidden after that window.
        window.setTimeout(() => {
          if (keyboardHeightRef.current === 0) {
            cleanupInjectedPaddings();
          }
        }, 350);
      });

      listenerHandles.push(willShow, didShow, didHide);
    };

    registerListeners();

    // ── Visual Viewport fallback (Android/iOS timing variability) ─────────────
    const handleViewportResize = () => {
      if (!window.visualViewport) return;
      const shrinkage = window.innerHeight - window.visualViewport.height;
      if (shrinkage > 50) {
        if (keyboardHeightRef.current === 0) keyboardHeightRef.current = shrinkage;
        const el = lastFocusedRef.current
          ?? (isEditableField(document.activeElement) ? document.activeElement : null);
        scheduleEnsureVisible(el, [0, 150, 300]);
      }
    };
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    // ── MutationObserver: runtime-inserted inputs ─────────────────────────────
    // Handles cases like ArrivalsPage "+ Add Lot" where new input elements are
    // mounted at runtime while the keyboard is already open. Focus can shift
    // automatically shortly after insertion, so we prefer the current
    // `document.activeElement` (if it becomes an editable text field),
    // otherwise fall back to the newly inserted input candidate.
    const mutationObserver = new MutationObserver((mutations) => {
      if (getEffectiveKeyboardHeight(keyboardHeightRef.current) <= 0) return;
      // Only react within 1.5 s of a user tap.
      if (Date.now() - lastPointerDownAtRef.current > 1500) return;

      // Collect a candidate newly added input (best-effort; focus might shift).
      let candidateInput: Element | null = null;
      outer: for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof Element)) continue;
          const candidates = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
            ? [node]
            : Array.from(node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea'));
          for (const c of candidates) {
            if ((c as HTMLInputElement).disabled) continue;
            if (c.getAttribute('inputmode') === 'none') continue;
            const r = c.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            candidateInput = c;
            break outer;
          }
        }
      }

      if (!candidateInput) return;

      // Re-read activeElement at every retry: focus may shift slightly after
      // DOM insertion (ClickToFocusNewFields focuses the new input a few frames
      // after the mutation, and the active element changes again when the user
      // taps a different field). Always target the CURRENTLY focused editable
      // field; fall back to the candidateInput from the mutation if none.
      const tryScroll = () => {
        const active = document.activeElement;
        const target = isEditableField(active) ? active : candidateInput;
        ensureVisible(target!, keyboardHeightRef.current);
      };

      // Use longer delays: ArrivalsPage's useLayoutEffect([sellers]) scrolls the
      // LotsScrollPanel to the bottom after React renders, then
      // ClickToFocusNewFields focuses the new input ~2 frames later.
      // We continue retrying through 2500 ms to cover Framer Motion animations
      // and any layout/state settling after that.
      requestAnimationFrame(tryScroll);
      window.setTimeout(tryScroll, 120);
      window.setTimeout(tryScroll, 280);
      window.setTimeout(tryScroll, 520);
      window.setTimeout(tryScroll, 780);
      window.setTimeout(tryScroll, 1050);
      window.setTimeout(tryScroll, 1400);
      window.setTimeout(tryScroll, 2000);
      window.setTimeout(tryScroll, 2500);
      window.setTimeout(tryScroll, 3200);
      window.setTimeout(tryScroll, 4000);
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      for (const h of listenerHandles) h.remove();
      mutationObserver.disconnect();
      cleanupInjectedPaddings();
    };
  }, []);

  return null;
};

export default KeyboardAvoidance;
