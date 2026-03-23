import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { focusFirstEligibleField, getRouteAutofocusRoot, isRouteAutofocusBlockedByOpenDialog } from "@/lib/routeAutofocus";

const RETRY_DELAYS_MS = [0, 50, 120, 250, 500];

const RouteAutofocus = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const hasMountedRef = useRef(false);

  useEffect(() => {
    // Match the behavior of `ScrollToTop`: do not mess with focus on back/forward.
    if (navType === "POP" && hasMountedRef.current) return;

    let cancelled = false;
    const timers: number[] = [];

    const attemptFocus = (attemptIndex: number) => {
      if (cancelled) return;

      // If a modal/dialog is already open, focus should remain inside it.
      if (isRouteAutofocusBlockedByOpenDialog()) return;

      const root = getRouteAutofocusRoot();
      if (root && focusFirstEligibleField(root)) return;

      if (attemptIndex >= RETRY_DELAYS_MS.length - 1) return;

      const nextDelay = RETRY_DELAYS_MS[attemptIndex + 1];
      const t = window.setTimeout(() => {
        // Defer focus until layout settles.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => attemptFocus(attemptIndex + 1));
        });
      }, nextDelay);

      timers.push(t);
    };

    const firstDelay = RETRY_DELAYS_MS[0];
    const t0 = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => attemptFocus(0));
      });
    }, firstDelay);
    timers.push(t0);

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [location.key, navType]);

  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  return null;
};

export default RouteAutofocus;

