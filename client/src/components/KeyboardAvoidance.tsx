import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';

/** Extra gap (px) between the field's bottom edge and the keyboard top. */
const PADDING = 16;

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
 * After that, also scroll the window for any remaining uncovered amount.
 *
 * This handles nested scroll containers like ArrivalsPage's LotsScrollPanel
 * (inner, fixed-height) inside a tall page-level scroll (outer, window).
 */
function ensureVisible(el: Element, keyboardHeight: number): void {
  const effectiveKb = getEffectiveKeyboardHeight(keyboardHeight);
  if (effectiveKb <= 0) return;

  const initialRect = el.getBoundingClientRect();
  if (initialRect.width <= 0 || initialRect.height <= 0) return;

  const availableBottom = getAvailableBottom(effectiveKb);
  if (initialRect.bottom <= availableBottom) return; // already visible

  // Walk up ALL scroll-overflow ancestors and scroll each one as needed.
  let node: Element | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const canScroll = node.scrollHeight - node.clientHeight > 2;
      if (canScroll) {
        // Re-read element position after each ancestor scroll so the deltas are fresh.
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom > availableBottom) {
          node.scrollTop += elRect.bottom - availableBottom;
        }
      }
    }
    node = node.parentElement;
  }

  // Finally, scroll the window for whatever's left. Use rAF so the ancestor
  // scroll positions settle (and ArrivalsPage's own scroll-to-bottom effect
  // has had a chance to run).
  requestAnimationFrame(() => {
    const finalRect = el.getBoundingClientRect();
    const stillCovered = finalRect.bottom - availableBottom;
    if (stillCovered > 1) {
      window.scrollBy({ top: stillCovered, behavior: 'smooth' });
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
    // Always read the *latest* keyboard height at execution time.
    // This prevents races where focus moves before keyboardHeightRef updates.
    const scheduleEnsureVisible = (el: Element | null, delays = [0, 80, 180, 320, 520, 900, 1300]) => {
      if (!el) return;
      for (const d of delays) {
        if (d === 0) {
          requestAnimationFrame(() => ensureVisible(el, keyboardHeightRef.current));
        } else {
          window.setTimeout(() => ensureVisible(el, keyboardHeightRef.current), d);
        }
      }
    };

    // ── Focus tracking ────────────────────────────────────────────────────────
    const handleFocusIn = (e: FocusEvent) => {
      if (!isEditableField(e.target)) return;
      lastFocusedRef.current = e.target;

      // Always schedule checks. For dynamic UIs, the keyboard may open *after*
      // focus is applied (or after layout changes), so later checks catch it.
      scheduleEnsureVisible(e.target, [0, 80, 180, 320, 520, 900, 1300]);
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
        scheduleEnsureVisible(el, [0, 80, 180, 320, 520, 900, 1300]);
      });

      const didHide = await Keyboard.addListener('keyboardDidHide', () => {
        keyboardHeightRef.current = 0;
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

      const tryScroll = () => {
        const active = document.activeElement;
        const target = isEditableField(active) ? active : candidateInput;
        ensureVisible(target, keyboardHeightRef.current);
      };

      // Use longer delays here: ArrivalsPage has a useEffect([sellers]) that
      // scrolls the LotsScrollPanel after React renders. We wait for that to
      // complete and also re-check after the next paints.
      requestAnimationFrame(tryScroll);
      window.setTimeout(tryScroll, 120);
      window.setTimeout(tryScroll, 280);
      window.setTimeout(tryScroll, 520);
      window.setTimeout(tryScroll, 780);
      window.setTimeout(tryScroll, 1050);
      window.setTimeout(tryScroll, 1400);
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      for (const h of listenerHandles) h.remove();
      mutationObserver.disconnect();
    };
  }, []);

  return null;
};

export default KeyboardAvoidance;
