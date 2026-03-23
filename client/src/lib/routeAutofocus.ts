const ROUTE_AUTOFOCUS_ROOT_ID = "route-autofocus-root";

const DIALOG_OPEN_SELECTOR = '[role="dialog"][data-state="open"]';

const SKIP_ATTR = "data-skip-route-autofocus";

const INPUT_TYPES_TO_EXCLUDE = new Set([
  // Not text entry
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "file",
  "image",
  "hidden",
  // Range-like / non-cursor inputs tend to surprise focus/keyboard
  "range",
]);

function getFocusableRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.getElementById(ROUTE_AUTOFOCUS_ROOT_ID) ??
    document.getElementById("root")
  );
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el) return false;

  // Skip elements explicitly hidden from AT
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.closest('[aria-hidden="true"]')) return false;

  // If any ancestor is inert or display-none, focus should be avoided.
  // `inert` is handled by the browser for focusability, but this is an extra safety net.
  if (el.closest("[inert]")) return false;

  // `hidden` attribute
  if (el.hasAttribute("hidden")) return false;

  const style = window.getComputedStyle(el);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (style.opacity === "0") return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}

function isInsideOpenDialog(el: Element): boolean {
  if (typeof document === "undefined") return false;
  return !!el.closest(DIALOG_OPEN_SELECTOR);
}

function isSkippedByOptOut(el: Element): boolean {
  return !!el.closest(`[${SKIP_ATTR}]`);
}

function isTextLikeInput(input: HTMLInputElement): boolean {
  const typeAttr = (input.getAttribute("type") || "text").toLowerCase();
  if (INPUT_TYPES_TO_EXCLUDE.has(typeAttr)) return false;

  // `input[type="search"]`, `email`, `tel`, `password`, etc are expected to bring up keyboard.
  return true;
}

function isEligibleCandidate(el: Element): el is
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLSelectElement)) {
    return false;
  }

  const skipped = isSkippedByOptOut(el);
  if (skipped) return false;

  if (isInsideOpenDialog(el)) return false;

  // Native disabled controls are not eligible.
  // (Radix-style custom selects are usually buttons; we intentionally focus native inputs/selects.)
  if ("disabled" in el && el.disabled) return false;
  if ("readOnly" in el && el.readOnly) return false;

  // If tabindex is explicitly -1, avoid stealing focus.
  const tabIndexAttr = el.getAttribute("tabindex");
  if (tabIndexAttr === "-1") return false;

  if (!isElementVisible(el)) return false;

  if (el instanceof HTMLInputElement) {
    return isTextLikeInput(el);
  }

  // textarea + select
  return true;
}

export function getRouteAutofocusRoot(): HTMLElement | null {
  return getFocusableRoot();
}

export function isRouteAutofocusBlockedByOpenDialog(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(DIALOG_OPEN_SELECTOR);
}

export function focusFirstEligibleField(root: HTMLElement): boolean {
  if (typeof document === "undefined") return false;

  const candidates = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"),
  );

  // Respect per-page focus (`autoFocus`, browser restoration) if it already landed on
  // an eligible field within the route root.
  const active = document.activeElement;
  if (active && root.contains(active) && isEligibleCandidate(active)) return true;

  for (const el of candidates) {
    if (!isEligibleCandidate(el)) continue;

    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }

    return true;
  }

  return false;
}

export function getEligibleAutofocusCandidates(
  root: HTMLElement,
): Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
  if (typeof document === "undefined") return [];

  const candidates = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"),
  );

  return candidates.filter((el) => isEligibleCandidate(el));
}

