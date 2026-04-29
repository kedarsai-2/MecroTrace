import { useEffect, useRef } from 'react';

/**
 * Login screens use `fixed inset-0` + scroll on inner `<main>`. Mobile browsers
 * scroll the document for focused inputs; that no longer moves the field above
 * the keyboard. Double rAF runs after layout; visualViewport catches keyboard open.
 */
export function scrollLoginFieldIntoView(el: Element) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    });
  });
}

type LoginMode = 'phone' | 'email';

export function useLoginScreenScrollAssist(loginMode: LoginMode, phoneInputId: string, emailInputId: string) {
  const skipFirstModeEffect = useRef(true);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVv = () => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) {
        scrollLoginFieldIntoView(a);
      }
    };
    vv.addEventListener('resize', onVv);
    vv.addEventListener('scroll', onVv);
    return () => {
      vv.removeEventListener('resize', onVv);
      vv.removeEventListener('scroll', onVv);
    };
  }, []);

  useEffect(() => {
    if (skipFirstModeEffect.current) {
      skipFirstModeEffect.current = false;
      return;
    }
    const id = loginMode === 'email' ? emailInputId : phoneInputId;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }, 320);
    return () => window.clearTimeout(t);
  }, [loginMode, phoneInputId, emailInputId]);
}
