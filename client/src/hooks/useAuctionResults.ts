import { useState, useEffect, useCallback, useRef } from 'react';
import { auctionApi, type AuctionResultDTO } from '@/services/api/auction';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

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
  refetch: () => Promise<void>;
} {
  const [auctionResults, setAuctionResults] = useState<AuctionResultDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resultsComplete, setResultsComplete] = useState(false);
  const [totalElements, setTotalElements] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const onProgressRef = useRef(options?.onProgress);
  onProgressRef.current = options?.onProgress;

  const refetch = useCallback(async () => {
    genRef.current += 1;
    const gen = genRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const { signal } = ac;

    setAuctionResults([]);
    setLoading(true);
    setLoadingMore(false);
    setResultsComplete(false);
    setTotalElements(null);
    setError(null);

    try {
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
    void refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [refetch]);

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
