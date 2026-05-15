import { useRef, type ReactNode } from 'react';
import { useVirtualizer, measureElement } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

/** Long mobile card stacks: measured row heights inside bounded scroll (Sales Pad–style). */
export function SettlementMobileVirtualStack({
  count,
  estimateItemSize,
  getItemKey,
  containerClassName,
  children,
}: {
  count: number;
  estimateItemSize: number;
  getItemKey: (index: number) => string | number;
  containerClassName?: string;
  children: (index: number) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateItemSize,
    overscan: 8,
    measureElement,
    getItemKey,
  });
  return (
    <div
      ref={parentRef}
      className={cn(
        'max-h-[min(72vh,720px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]',
        containerClassName,
      )}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(vi => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full pb-3"
            style={{ transform: `translateY(${vi.start}px)` }}
          >
            {children(vi.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
