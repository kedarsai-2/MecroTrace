import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  allowOnlyNumbers,
  applyNumericPaste,
  filterUnsignedDecimalString,
  filterUnsignedIntegerString,
  numericGuardModeForSettlement,
} from '@/utils/numericInputGuards';

const DEFAULT_MAX = 10_000_000;

export type SettlementNumericInputProps = {
  value: number;
  onCommit: (n: number) => void;
  /** Empty blur after user edited: clear override / parent state instead of revert-to-value. */
  onClear?: () => void;
  commitMode?: 'live' | 'blur';
  /** Decimals when blurred (0 = integer display). */
  fractionDigits?: number;
  min?: number;
  max?: number;
  emptyWhenZero?: boolean;
  /** If empty after edit and no onClear: commit 0 instead of reverting to value. */
  allowEmptyZero?: boolean;
  /** Whole numbers only (quantity). */
  integerOnly?: boolean;
  className?: string;
  disabled?: boolean;
  /** Keep same visual as editable input; blocks edits without disabled styling. */
  readOnly?: boolean;
  id?: string;
  'aria-label'?: string;
  title?: string;
  placeholder?: string;
  /** Mirror in-progress text to parent (e.g. expense merge toggle reads draft before blur). null = blurred / not editing. */
  onRawChange?: (raw: string | null) => void;
};

function clampNum(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  const stepped = Math.round(n * 100) / 100;
  return Math.max(min, Math.min(max, stepped));
}

function parseDraft(raw: string, integerOnly: boolean, min: number, max: number): number | null {
  const t = raw.replace(/,/g, '').trim();
  if (t === '') return null;
  if (integerOnly) {
    if (!/^\d+$/.test(t)) return null;
    const n = parseInt(t, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
  }
  if (t === '.') return null;
  if (!/^\d*\.?\d*$/.test(t)) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return clampNum(n, min, max);
}

function formatBlurred(value: number, fractionDigits: number, emptyWhenZero: boolean): string {
  if (emptyWhenZero && value === 0) return '';
  return fractionDigits === 0 ? String(Math.round(value)) : value.toFixed(fractionDigits);
}

/**
 * Billing-style overwrite: focus clears field; blur without edits restores display without onCommit.
 * Uses nonnegative decimal (or integer) parsing and 2dp clamping unless integerOnly.
 */
export function SettlementNumericInput({
  value,
  onCommit,
  onClear,
  commitMode = 'live',
  fractionDigits = 2,
  min = 0,
  max = DEFAULT_MAX,
  emptyWhenZero = false,
  allowEmptyZero = false,
  integerOnly = false,
  className,
  disabled,
  readOnly,
  id,
  'aria-label': ariaLabel,
  title,
  placeholder,
  onRawChange,
}: SettlementNumericInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editedSinceFocusRef = useRef(false);

  const blurred = formatBlurred(value, fractionDigits, emptyWhenZero);
  const display = draft !== null ? draft : blurred;
  const guardMode = numericGuardModeForSettlement(integerOnly);

  const pushDraft = (next: string) => {
    if (readOnly) return;
    editedSinceFocusRef.current = true;
    setDraft(next);
    onRawChange?.(next);
    if (commitMode === 'live') {
      const live = parseDraft(next, integerOnly, min, max);
      if (live !== null) {
        onCommit(live);
      }
    }
  };

  return (
    <Input
      type="text"
      inputMode={integerOnly ? 'numeric' : 'decimal'}
      disabled={disabled}
      readOnly={readOnly}
      id={id}
      title={title}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={display}
      onKeyDown={e => {
        if (readOnly) return;
        allowOnlyNumbers(e, guardMode);
      }}
      onPaste={e => {
        if (readOnly) {
          e.preventDefault();
          return;
        }
        applyNumericPaste(e, guardMode, next => {
          pushDraft(next);
        });
      }}
      onFocus={() => {
        if (readOnly) return;
        editedSinceFocusRef.current = false;
        setDraft('');
        onRawChange?.('');
      }}
      onChange={e => {
        if (readOnly) return;
        const raw = e.target.value;
        const next = integerOnly ? filterUnsignedIntegerString(raw) : filterUnsignedDecimalString(raw);
        pushDraft(next);
      }}
      onBlur={() => {
        if (readOnly) return;
        const raw = draft ?? '';
        const trimmed = raw.replace(/,/g, '').trim();
        if (!editedSinceFocusRef.current && trimmed === '') {
          setDraft(null);
          editedSinceFocusRef.current = false;
          onRawChange?.(null);
          return;
        }
        setDraft(null);
        editedSinceFocusRef.current = false;
        const parsed = parseDraft(raw.replace(/,/g, ''), integerOnly, min, max);
        if (parsed === null || trimmed === '') {
          if (onClear) {
            onClear();
          } else {
            onCommit(allowEmptyZero ? 0 : clampNum(value, min, max));
          }
          onRawChange?.(null);
          return;
        }
        onCommit(parsed);
        onRawChange?.(null);
      }}
      className={cn(className)}
    />
  );
}
