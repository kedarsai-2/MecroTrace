import { useState, useEffect, useCallback, useRef } from 'react';
import { auctionApi, type AuctionResultDTO } from '@/services/api/auction';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function normalizeInitialPageSize(size: number | undefined): number {
  const n = Math.floor(Number(size) || PAGE_SIZE);
  return Math.max(1, Math.min(PAGE_SIZE, n));
}

function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  );
}

export type AuctionResultsProgress = {
  items: AuctionResultDTO[];
  pageIndex: number;
  totalElements: number;
};

export type UseAuctionResultsOptions = {
  /** Fires after each merged page (same array reference semantics as internal state updates). */
  onProgress?: (p: AuctionResultsProgress) => void;
  /** Optional first pass size for screens that need a fast preview before full background paging. */
  initialPageSize?: number;
  /** Set false when a screen wants to trigger the heavy result load manually. */
  enabled?: boolean;
};

export type RefetchAuctionResultsOptions = {
  /** Keep existing rows visible while fresh pages load. */
  keepPreviousData?: boolean;
};

/**
 * Auction results from `/module-auctions/results`, loaded page-by-page.
 * `auctionResults` grows as pages arrive; `loading` clears after first page so UI can render fast.
 */
export function useAuctionResults(options?: UseAuctionResultsOptions): {
  auctionResults: AuctionResultDTO[];
  loading: boolean;
  loadingMore: boolean;
  resultsComplete: boolean;
  totalElements: number | null;
  error: Error | null;
  refetch: (options?: RefetchAuctionResultsOptions) => Promise<void>;
} {
  const [auctionResults, setAuctionResults] = useState<AuctionResultDTO[]>([]);
  const [loading, setLoading] = useState(options?.enabled !== false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resultsComplete, setResultsComplete] = useState(false);
  const [totalElements, setTotalElements] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const onProgressRef = useRef(options?.onProgress);
  onProgressRef.current = options?.onProgress;
  const initialPageSizeRef = useRef(options?.initialPageSize);
  initialPageSizeRef.current = options?.initialPageSize;
  const enabled = options?.enabled !== false;

  const refetch = useCallback(async (refetchOptions?: RefetchAuctionResultsOptions) => {
    genRef.current += 1;
    const gen = genRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const { signal } = ac;

    const keepPreviousData = !!refetchOptions?.keepPreviousData;
    if (!keepPreviousData) {
      setAuctionResults([]);
    }
    setLoading(!keepPreviousData);
    setLoadingMore(false);
    setResultsComplete(false);
    setTotalElements(null);
    setError(null);

    try {
      const firstPageSize = keepPreviousData
        ? PAGE_SIZE
        : normalizeInitialPageSize(initialPageSizeRef.current);

      if (firstPageSize < PAGE_SIZE) {
        const { items, totalElements: tot } = await auctionApi.listResultsPage(
          { page: 0, size: firstPageSize, sort: 'completedAt,desc' },
          { signal }
        );
        if (gen !== genRef.current) return;

        setAuctionResults(items);
        setTotalElements(tot);
        onProgressRef.current?.({ items, pageIndex: 0, totalElements: tot });
        setLoading(false);

        const doneByShort = items.length < firstPageSize;
        const doneByTotal = tot > 0 && items.length >= tot;
        if (doneByShort || doneByTotal) {
          setLoadingMore(false);
          setResultsComplete(true);
          return;
        }

        setLoadingMore(true);
      }

      let page = 0;
      let merged: AuctionResultDTO[] = [];
      while (page < MAX_PAGES) {
        const { items, totalElements: tot } = await auctionApi.listResultsPage(
          { page, size: PAGE_SIZE, sort: 'completedAt,desc' },
          { signal }
        );
        if (gen !== genRef.current) return;

        merged = merged.concat(items);
        setAuctionResults(merged);
        setTotalElements(tot);
        onProgressRef.current?.({ items: merged, pageIndex: page, totalElements: tot });

        if (page === 0) {
          setLoading(false);
        }

        const doneByShort = items.length < PAGE_SIZE;
        const doneByTotal = tot > 0 && merged.length >= tot;
        if (doneByShort || doneByTotal) {
          setLoadingMore(false);
          setResultsComplete(true);
          return;
        }

        setLoadingMore(true);
        page += 1;
      }
      if (gen === genRef.current) {
        setLoadingMore(false);
        setResultsComplete(true);
      }
    } catch (e) {
      if (isAbortError(e)) return;
      if (gen === genRef.current) {
        setError(e instanceof Error ? e : new Error('Failed to load auction results'));
        setAuctionResults([]);
        setResultsComplete(false);
      }
    } finally {
      if (gen === genRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return () => {
        abortRef.current?.abort();
      };
    }
    void refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, refetch]);

  return {
    auctionResults,
    loading,
    loadingMore,
    resultsComplete,
    totalElements,
    error,
    refetch,
  };
}
