import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  getEligibleAutofocusCandidates,
  getRouteAutofocusRoot,
  isRouteAutofocusBlockedByOpenDialog,
} from "@/lib/routeAutofocus";

const RETRY_DELAYS_MS = [0, 50, 120, 250, 500];

function focusElement(el: HTMLElement) {
  try {
    // `preventScroll` avoids jank when focusing newly inserted nodes.
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

const ClickToFocusNewFields = () => {
  const location = useLocation();
  const locationKeyRef = useRef(location.key);

  useEffect(() => {
    locationKeyRef.current = location.key;
  }, [location.key]);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const clickedButton = target?.closest?.("button");
      if (!clickedButton) return;

      if (isRouteAutofocusBlockedByOpenDialog()) return;

      const root = getRouteAutofocusRoot();
      if (!root) return;

      const startLocationKey = locationKeyRef.current;
      const beforeCandidates = getEligibleAutofocusCandidates(root);
      const beforeSet = new Set(beforeCandidates);

      let cancelled = false;
      const attemptFocus = (attemptIndex: number) => {
        if (cancelled) return;
        if (locationKeyRef.current !== startLocationKey) return; // route changed
        if (isRouteAutofocusBlockedByOpenDialog()) return; // dialog opened

        // If focus already moved somewhere meaningful, don't fight it.
        const active = document.activeElement;
        if (active && root.contains(active) && active instanceof HTMLElement) {
          // If the active element is already an eligible candidate, stop.
          const afterNow = getEligibleAutofocusCandidates(root);
        if (afterNow.some((el) => el === active)) return;
        }

        const afterCandidates = getEligibleAutofocusCandidates(root);
        const newCandidates = afterCandidates.filter((el) => !beforeSet.has(el));
        if (newCandidates.length > 0) {
          focusElement(newCandidates[0]);
          return;
        }

        if (attemptIndex >= RETRY_DELAYS_MS.length - 1) return;
        const nextDelay = RETRY_DELAYS_MS[attemptIndex + 1];
        window.setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => attemptFocus(attemptIndex + 1));
          });
        }, nextDelay);
      };

      // Defer slightly to let state updates + Framer Motion enter their DOM nodes.
      window.setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => attemptFocus(0));
        });
      }, RETRY_DELAYS_MS[0]);

      // Best-effort cancellation: if the user clicks again quickly, the later click supersedes naturally.
      // (We don't cancel previous timers because they run short and are guarded by route key.)
    };

    document.addEventListener("click", onClickCapture, true);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default ClickToFocusNewFields;

