import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BillingMoneyInput } from './BillingMoneyInput';

describe('BillingMoneyInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces live onCommit by default', () => {
    const onCommit = vi.fn();
    render(<BillingMoneyInput value={0} onCommit={onCommit} commitMode="live" min={0} />);

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12' } });

    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith(12);
  });

  it('liveDebounceMs=0 commits on each change', () => {
    const onCommit = vi.fn();
    render(
      <BillingMoneyInput value={0} onCommit={onCommit} commitMode="live" liveDebounceMs={0} min={0} />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5' } });

    expect(onCommit).toHaveBeenCalled();
  });

  it('flush pending live commit on blur before debounce fires', () => {
    const onCommit = vi.fn();
    render(<BillingMoneyInput value={0} onCommit={onCommit} commitMode="live" min={0} />);

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.blur(input);

    expect(onCommit.mock.calls.some((c) => c[0] === 7)).toBe(true);
  });
});
