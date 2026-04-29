import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { roundMoney2 } from '@/utils/billingMoney';
import {
  allowOnlyNumbers,
  applyNumericPaste,
  filterSignedDecimalString,
  filterUnsignedIntegerString,
  numericGuardModeForBillingMoney,
} from '@/utils/numericInputGuards';

/** Default trailing debounce for commitMode live — cuts full-page re-renders on huge forms (e.g. Billing). */
const DEFAULT_LIVE_DEBOUNCE_MS = 100;

type BillingMoneyInputProps = {
  value: number;
  /** Called while focused (live + debounce) and again on blur (final normalize). */
  onCommit: (n: number) => void;
  /** live: commit while typing (debounced); blur: commit only on blur/finalize. */
  commitMode?: 'live' | 'blur';
  /**
   * Only when commitMode is `live`: ms to wait after last change before calling onCommit.
   * Omit = {@link DEFAULT_LIVE_DEBOUNCE_MS}. Use `0` for immediate per-keystroke commits (small forms).
   */
  liveDebounceMs?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  title?: string;
  /** Minimum value after commit (inclusive). Omit for no floor. */
  min?: number;
  /** If invalid/empty on blur, commit 0 instead of reverting to previous value. */
  allowEmptyZero?: boolean;
  /** Whole numbers only (e.g. bag qty); still uses money rounding on blur when not integer-focused. */
  integerOnly?: boolean;
};

/**
 * Parse in-progress decimal text for live updates. Returns null when the field is empty,
 * incomplete (e.g. lone minus/dot), or invalid — parent state is left unchanged until blur
 * or a complete number, so clearing a field does not force artificial values (e.g. qty → 1).
 */
function parseDraftToNumber(raw: string, min?: number, integerOnly?: boolean): number | null {
  const t = raw.replace(/,/g, '').trim();
  if (t === '') return null;
  if (integerOnly) {
    if (!/^\d+$/.test(t)) return null;
    const n = parseInt(t, 10);
    if (!Number.isFinite(n)) return null;
    let x = n;
    if (min !== undefined && x < min) x = min;
    return x;
  }
  if (t === '.') return null;
  if (t === '-') return null;
  if (!/^-?\d*\.?\d*$/.test(t)) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  let x = roundMoney2(n);
  if (min !== undefined && x < min) x = min;
  return x;
}

/**
 * Money field: shows 00.00 when blurred; on focus clears so typing replaces value without select-all.
 * Blur with no edits restores display from parent (no onCommit). After any edit, blur parses and commits.
 * Parent state updates per commitMode (live vs blur).
 */
export function BillingMoneyInput({
  value,
  onCommit,
  commitMode = 'live',
  liveDebounceMs,
  disabled,
  className,
  placeholder,
  title,
  min,
  allowEmptyZero,
  integerOnly = false,
}: BillingMoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  /** True after any input/paste while focused; false on focus until user edits. */
  const editedSinceFocusRef = useRef(false);
  const liveCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const liveDebounceEffective =
    commitMode === 'live'
      ? liveDebounceMs === 0
        ? 0
        : (liveDebounceMs ?? DEFAULT_LIVE_DEBOUNCE_MS)
      : 0;

  const clearLiveTimer = () => {
    if (liveCommitTimerRef.current != null) {
      clearTimeout(liveCommitTimerRef.current);
      liveCommitTimerRef.current = null;
    }
  };

  useEffect(() => () => clearLiveTimer(), []);

  const display =
    draft !== null
      ? draft
      : integerOnly
        ? String(Math.max(min ?? 0, Math.round(Number(value) || 0)))
        : roundMoney2(value).toFixed(2);
  const guardMode = numericGuardModeForBillingMoney(integerOnly);

  const scheduleLiveCommit = (next: string) => {
    if (commitMode !== 'live') return;
    const live = parseDraftToNumber(next, min, integerOnly);
    clearLiveTimer();
    if (liveDebounceEffective === 0) {
      if (live !== null) onCommit(live);
      return;
    }
    if (live === null) return;
    liveCommitTimerRef.current = setTimeout(() => {
      liveCommitTimerRef.current = null;
      onCommit(live);
    }, liveDebounceEffective);
  };

  const pushDraft = (next: string) => {
    editedSinceFocusRef.current = true;
    setDraft(next);
    if (commitMode === 'live') {
      scheduleLiveCommit(next);
    }
  };

  return (
    <Input
      data-billing-money
      type="text"
      inputMode={integerOnly ? 'numeric' : 'decimal'}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      value={display}
      onKeyDown={e => allowOnlyNumbers(e, guardMode)}
      onPaste={e =>
        applyNumericPaste(e, guardMode, next => {
          pushDraft(next);
        })
      }
      onFocus={() => {
        editedSinceFocusRef.current = false;
        setDraft('');
      }}
      onChange={e => {
        const raw = e.target.value;
        const next = integerOnly ? filterUnsignedIntegerString(raw) : filterSignedDecimalString(raw);
        pushDraft(next);
      }}
      onBlur={() => {
        clearLiveTimer();
        const raw = draft ?? '';
        const trimmed = raw.replace(/,/g, '').trim();
        if (!editedSinceFocusRef.current && trimmed === '') {
          setDraft(null);
          editedSinceFocusRef.current = false;
          return;
        }
        setDraft(null);
        editedSinceFocusRef.current = false;
        let n = parseFloat(raw.replace(/,/g, ''));
        if (!Number.isFinite(n)) {
          onCommit(allowEmptyZero ? 0 : integerOnly ? Math.max(min ?? 0, Math.round(Number(value) || 0)) : roundMoney2(value));
          return;
        }
        if (min !== undefined && n < min) n = min;
        const committed = integerOnly ? Math.round(n) : roundMoney2(n);
        onCommit(committed);
      }}
      className={cn(className)}
    />
  );
}
