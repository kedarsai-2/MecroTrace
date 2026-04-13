import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { roundMoney2 } from '@/utils/billingMoney';

type BillingMoneyInputProps = {
  value: number;
  /** Called on every keystroke while focused (live recalc) and again on blur (final normalize). */
  onCommit: (n: number) => void;
  /** live: commit on each keypress; blur: commit only on blur/finalize. */
  commitMode?: 'live' | 'blur';
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  title?: string;
  /** Minimum value after commit (inclusive). Omit for no floor. */
  min?: number;
  /** If invalid/empty on blur, commit 0 instead of reverting to previous value. */
  allowEmptyZero?: boolean;
};

/**
 * Parse in-progress decimal text for live updates. Returns null when the field is empty,
 * incomplete (e.g. lone minus/dot), or invalid — parent state is left unchanged until blur
 * or a complete number, so clearing a field does not force artificial values (e.g. qty → 1).
 */
function parseDraftToNumber(raw: string, min?: number): number | null {
  const t = raw.replace(/,/g, '').trim();
  if (t === '') return null;
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
  disabled,
  className,
  placeholder,
  title,
  min,
  allowEmptyZero,
}: BillingMoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  /** True after any input/paste while focused; false on focus until user edits. */
  const editedSinceFocusRef = useRef(false);

  const display = draft !== null ? draft : roundMoney2(value).toFixed(2);

  return (
    <Input
      data-billing-money
      type="text"
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      value={display}
      onFocus={() => {
        editedSinceFocusRef.current = false;
        setDraft('');
      }}
      onChange={e => {
        editedSinceFocusRef.current = true;
        const next = e.target.value;
        setDraft(next);
        if (commitMode === 'live') {
          const live = parseDraftToNumber(next, min);
          if (live !== null) {
            onCommit(live);
          }
        }
      }}
      onBlur={() => {
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
          onCommit(allowEmptyZero ? 0 : roundMoney2(value));
          return;
        }
        if (min !== undefined && n < min) n = min;
        onCommit(roundMoney2(n));
      }}
      className={cn(className)}
    />
  );
}
