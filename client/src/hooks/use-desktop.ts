import { useState, useEffect } from 'react';

const DESKTOP_BREAKPOINT = 1024;
/** Tailwind `md` — tablet+; used for Vehicle Operations split layout (with `useDesktopMode` still at `lg`). */
const MD_BREAKPOINT = 768;

export function useDesktopMode() {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= DESKTOP_BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export function useMdUp() {
  const [matches, setMatches] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= MD_BREAKPOINT : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return matches;
}
