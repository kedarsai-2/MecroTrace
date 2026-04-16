import type { ClipboardEvent, KeyboardEvent } from 'react';

export type NumericInputGuardMode = 'unsignedInteger' | 'unsignedDecimal' | 'signedDecimal';

const NAV_KEYS = new Set([
  'Backspace',
  'Tab',
  'Enter',
  'Escape',
  'Delete',
  'Home',
  'End',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
]);

function isAccel(e: KeyboardEvent<HTMLInputElement>): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

function selectionCoversIndex(start: number | null, end: number | null, idx: number): boolean {
  if (start == null || end == null) return false;
  return start <= idx && end > idx;
}

/** Strip non-digits (paste / programmatic). */
export function filterUnsignedIntegerString(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Nonnegative decimal: digits + at most one `.`. */
export function filterUnsignedDecimalString(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const first = cleaned.indexOf('.');
  if (first === -1) return cleaned;
  return cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/\./g, '');
}

/** Optional leading `-` + {@link filterUnsignedDecimalString} body. */
export function filterSignedDecimalString(raw: string): string {
  if (!raw) return '';
  const neg = raw[0] === '-';
  const body = neg ? raw.slice(1) : raw;
  const unsigned = filterUnsignedDecimalString(body.replace(/-/g, ''));
  return neg ? `-${unsigned}` : unsigned;
}

export function mergePastedNumeric(
  current: string,
  selStart: number,
  selEnd: number,
  pasted: string,
  mode: NumericInputGuardMode,
): string {
  const start = Math.max(0, Math.min(selStart, current.length));
  const end = Math.max(start, Math.min(selEnd, current.length));
  const merged = current.slice(0, start) + pasted + current.slice(end);
  switch (mode) {
    case 'unsignedInteger':
      return filterUnsignedIntegerString(merged);
    case 'unsignedDecimal':
      return filterUnsignedDecimalString(merged);
    case 'signedDecimal':
      return filterSignedDecimalString(merged);
  }
}

/**
 * Block invalid keys at input level (silent `preventDefault`).
 * Keeps Tab, arrows, Backspace/Delete, shortcuts (Ctrl/Cmd/Meta).
 */
export function allowOnlyNumbers(e: KeyboardEvent<HTMLInputElement>, mode: NumericInputGuardMode): void {
  if (isAccel(e)) return;
  const k = e.key;
  if (NAV_KEYS.has(k)) return;
  if (k.length > 1) return;

  const el = e.currentTarget;
  const value = el.value;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;

  if (mode === 'unsignedInteger') {
    if (!/^[0-9]$/.test(k)) e.preventDefault();
    return;
  }

  if (mode === 'unsignedDecimal') {
    if (k === '.' || /^[0-9]$/.test(k)) {
      if (k === '.') {
        const dot = value.indexOf('.');
        if (dot >= 0 && !selectionCoversIndex(start, end, dot)) e.preventDefault();
      }
      return;
    }
    e.preventDefault();
    return;
  }

  // signedDecimal
  if (k === '-') {
    if (start !== 0) {
      e.preventDefault();
      return;
    }
    if (value.startsWith('-') && !selectionCoversIndex(start, end, 0)) e.preventDefault();
    return;
  }
  if (k === '.' || /^[0-9]$/.test(k)) {
    if (k === '.') {
      const body = value.startsWith('-') ? value.slice(1) : value;
      const rel = body.indexOf('.');
      const absDot = rel < 0 ? -1 : value.startsWith('-') ? rel + 1 : rel;
      if (absDot >= 0 && !selectionCoversIndex(start, end, absDot)) e.preventDefault();
    }
    return;
  }
  e.preventDefault();
}

export function numericGuardModeForSettlement(integerOnly: boolean): NumericInputGuardMode {
  return integerOnly ? 'unsignedInteger' : 'unsignedDecimal';
}

export function numericGuardModeForBillingMoney(integerOnly: boolean): NumericInputGuardMode {
  return integerOnly ? 'unsignedInteger' : 'signedDecimal';
}

export function applyNumericPaste(
  e: ClipboardEvent<HTMLInputElement>,
  mode: NumericInputGuardMode,
  onNextValue: (next: string) => void,
): void {
  e.preventDefault();
  const el = e.currentTarget;
  const pasted = e.clipboardData.getData('text/plain') ?? '';
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = mergePastedNumeric(el.value, start, end, pasted, mode);
  onNextValue(next);
  requestAnimationFrame(() => {
    try {
      const pos = next.length;
      el.setSelectionRange(pos, pos);
    } catch {
      /* noop */
    }
  });
}
