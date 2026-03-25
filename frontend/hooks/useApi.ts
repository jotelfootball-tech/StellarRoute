'use client';

/**
 * Custom React hooks for StellarRoute data fetching.
 *
 * Each hook returns { data, loading, error } and handles:
 *  - Request cancellation on unmount (AbortController)
 *  - Auto-refresh intervals where appropriate
 *  - Debounced parameters for useQuote
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  StellarRouteApiError,
  stellarRouteClient,
} from '@/lib/api/client';
import { QUOTE_AMOUNT_DEBOUNCE_MS } from '@/lib/quote-stale';
import type {
  HealthStatus,
  Orderbook,
  PairsResponse,
  PriceQuote,
  QuoteType,
  TradingPair,
} from '@/types';

// ---------------------------------------------------------------------------
// Shared state shape
// ---------------------------------------------------------------------------

export interface UseApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: StellarRouteApiError | Error | null;
}

// ---------------------------------------------------------------------------
// Internal: generic fetch hook
// ---------------------------------------------------------------------------

function useFetch<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  refreshIntervalMs?: number,
): UseApiState<T> & { refresh: () => void } {
  const [state, setState] = useState<UseApiState<T>>({
    data: undefined,
    loading: true,
    error: null,
  });

  // Stable ref so the interval callback always sees the latest fetcher
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            data: undefined,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  // Auto-refresh
  useEffect(() => {
    if (!refreshIntervalMs) return;
    const id = setInterval(() => setTick((n) => n + 1), refreshIntervalMs);
    return () => clearInterval(id);
  }, [refreshIntervalMs]);

  return { ...state, refresh };
}

// ---------------------------------------------------------------------------
// Internal: simple debounce hook
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// usePairs — fetch and cache trading pairs
// ---------------------------------------------------------------------------

export function usePairs(): UseApiState<TradingPair[]> & {
  refresh: () => void;
} {
  const result = useFetch(
    (signal) =>
      stellarRouteClient
        .getPairs({ signal })
        .then((res: PairsResponse) => res.pairs),
    [],
  );
  return result;
}

// ---------------------------------------------------------------------------
// useOrderbook — fetch orderbook with auto-refresh every 10 s
// ---------------------------------------------------------------------------

export function useOrderbook(
  base: string,
  quote: string,
  refreshIntervalMs = 10_000,
): UseApiState<Orderbook> & { refresh: () => void } {
  return useFetch(
    (signal) => stellarRouteClient.getOrderbook(base, quote, { signal }),
    [base, quote],
    refreshIntervalMs,
  );
}

// ---------------------------------------------------------------------------
// useQuote — fetch price quote with 400 ms debounce on amount
// ---------------------------------------------------------------------------

export function useQuote(
  base: string,
  quote: string,
  amount?: number,
  type: QuoteType = 'sell',
  /** Optional polling interval. Prefer `useQuoteRefresh` for manual/auto refresh UX. */
  refreshIntervalMs?: number,
): UseApiState<PriceQuote> & { refresh: () => void } {
  const debouncedAmount = useDebounced(amount, QUOTE_AMOUNT_DEBOUNCE_MS);

  return useFetch(
    (signal) =>
      stellarRouteClient.getQuote(base, quote, debouncedAmount, type, {
        signal,
      }),
    [base, quote, debouncedAmount, type],
    refreshIntervalMs,
  );
}

// ---------------------------------------------------------------------------
// useHealth — API health status
// ---------------------------------------------------------------------------

export function useHealth(
  refreshIntervalMs = 60_000,
): UseApiState<HealthStatus> & { refresh: () => void } {
  return useFetch(
    (signal) => stellarRouteClient.getHealth({ signal }),
    [],
    refreshIntervalMs,
  );
}
