import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';

/** Extra gap (px) between the field's bottom edge and the keyboard top. */
const PADDING = 16;

/** Return the height of any fixed bottom-nav overlay that is currently visible. */
function getFixedBottomOverlayHeight(): number {
  const nav = document.querySelector('nav.bottom-nav') as HTMLElement | null;
  if (!nav) return 0;
  const style = window.getComputedStyle(nav);
  if (style.display === 'none' || style.visibility === 'hidden') return 0;
  return nav.getBoundingClientRect().height || 0;
}

/** Walk up the DOM to find the nearest vertically-scrollable ancestor. */
function findScrollableParent(el: Element): Element | null {
  let node: Element | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Given an editable element and the current keyboard height, scroll the
 * element into the visible region above the keyboard.
 *
 * Uses the nearest scrollable ancestor when possible, falls back to window.
 */
function ensureVisible(el: Element, keyboardHeight: number): void {
  if (keyboardHeight <= 0) return;

  const rect = el.getBoundingClientRect();

  // Visual viewport height already shrinks on iOS after keyboard opens (Body resize mode).
  // On Android with Capacitor's default "native" resize the webview also shrinks, but we
  // can't rely on that in all configs, so we subtract keyboardHeight from window.innerHeight.
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const bottomNavHeight = getFixedBottomOverlayHeight();
  const availableBottom = viewportHeight - keyboardHeight - bottomNavHeight - PADDING;

  if (rect.bottom <= availableBottom) return; // already fully visible

  const delta = rect.bottom - availableBottom;

  const scrollParent = findScrollableParent(el);
  if (scrollParent) {
    scrollParent.scrollTop += delta;
  } else {
    window.scrollBy({ top: delta, behavior: 'smooth' });
  }
}

/** Return true if the element is a focusable text-entry input/textarea. */
function isEditableField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if ((el as HTMLInputElement).disabled) return false;
  // inputMode="none" means we are suppressing the native keyboard ourselves (e.g. numpad screens)
  if (el.getAttribute('inputmode') === 'none') return false;
  // Non-text input types that don't open a keyboard
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform();

    // ── iOS setup ──────────────────────────────────────────────────────────────
    // Enable WebView scroll and "Body" resize so the page compresses above the
    // keyboard (the most reliable iOS resize mode for plain web apps).
    if (platform === 'ios') {
      Keyboard.setScroll({ isDisabled: false }).catch(() => {});
      Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {});
    }

    // ── Track focused element ──────────────────────────────────────────────────
    // We need this because by the time keyboardDidShow fires the document may
    // have lost the reference to the original focused element (e.g. on Android).
    const handleFocusIn = (e: FocusEvent) => {
      if (!isEditableField(e.target)) return;
      lastFocusedRef.current = e.target;

      // Key fix: if keyboard is ALREADY open (user moved from one field to
      // another), keyboardWillShow / keyboardDidShow will NOT fire again.
      // Scroll immediately using the stored keyboard height.
      if (keyboardHeightRef.current > 0) {
        // Two rAFs: first lets the browser update layout after focus move,
        // second ensures getBoundingClientRect is accurate.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (lastFocusedRef.current) {
              ensureVisible(lastFocusedRef.current, keyboardHeightRef.current);
            }
          });
        });
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);

    // ── Capacitor keyboard event listeners ────────────────────────────────────
    const listenerHandles: PluginListenerHandle[] = [];

    const registerListeners = async () => {
      const willShow = await Keyboard.addListener('keyboardWillShow', (info) => {
        keyboardHeightRef.current = info.keyboardHeight;
      });

      const didShow = await Keyboard.addListener('keyboardDidShow', (info) => {
        keyboardHeightRef.current = info.keyboardHeight;

        // Use the element we tracked on focus (most reliable), then activeElement.
        const el = lastFocusedRef.current
          ?? (isEditableField(document.activeElement) ? document.activeElement : null);

        if (!el) return;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            ensureVisible(el, keyboardHeightRef.current);
          });
        });
      });

      const didHide = await Keyboard.addListener('keyboardDidHide', () => {
        keyboardHeightRef.current = 0;
      });

      listenerHandles.push(willShow, didShow, didHide);
    };

    registerListeners();

    // ── Visual Viewport fallback (web / Android without native resize) ────────
    // Some Android configs don't reliably fire keyboardDidShow. Listening to the
    // visualViewport resize catches the keyboard appearing as a viewport shrink.
    const handleViewportResize = () => {
      if (!window.visualViewport) return;
      // The keyboard has appeared if the visual viewport is noticeably shorter
      // than the layout viewport.
      const shrinkage = window.innerHeight - window.visualViewport.height;
      if (shrinkage > 50) {
        // Update keyboard height from viewport shrinkage (best estimate on Android)
        const estimatedKbHeight = shrinkage;
        if (keyboardHeightRef.current === 0) {
          keyboardHeightRef.current = estimatedKbHeight;
        }
        const el = lastFocusedRef.current
          ?? (isEditableField(document.activeElement) ? document.activeElement : null);
        if (!el) return;
        requestAnimationFrame(() => {
          ensureVisible(el, keyboardHeightRef.current);
        });
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewportResize);

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      for (const handle of listenerHandles) {
        handle.remove();
      }
    };
  }, []);

  return null;
};

export default KeyboardAvoidance;
