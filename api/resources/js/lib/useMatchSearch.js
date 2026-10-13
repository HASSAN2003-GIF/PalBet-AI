import { useCallback, useEffect, useRef, useState } from 'react';
import { searchMatches } from './api';

export const MIN_QUERY = 2;
const DEBOUNCE_MS = 280;

/** Normalised query: trimmed, inner whitespace collapsed. */
export const cleanQuery = (q) => (q || '').trim().replace(/\s+/g, ' ');

const IDLE = { status: 'idle', results: [], total: 0, page: 1, hasMore: false, truncated: false, interpreted: null, error: null, loadingMore: false };

/**
 * Live match search against /api/search.
 *  - waits for a pause in typing (debounce), unless `flush()` asks for an immediate search;
 *  - aborts the request for an older query when a newer one starts, and ignores any response
 *    that still arrives for a query that is no longer current;
 *  - never calls the API for an empty or one-character query.
 */
export function useMatchSearch(rawQuery, fetcher = searchMatches) {
    const query = cleanQuery(rawQuery);
    const [state, setState] = useState(IDLE);
    const [retryTick, setRetryTick] = useState(0);
    const skipDebounce = useRef(false);
    const current = useRef({ query: '', controller: null });

    useEffect(() => {
        current.current.controller?.abort();
        if (query.length < MIN_QUERY) {
            current.current = { query: '', controller: null };
            setState(IDLE);
            return undefined;
        }

        const controller = new AbortController();
        current.current = { query, controller };
        setState((s) => ({ ...s, status: 'loading', error: null }));

        const run = () => fetcher(query, 1, controller.signal)
            .then((payload) => {
                if (current.current.controller !== controller) return;   // a newer query took over
                setState({
                    status: 'ready',
                    results: payload.results ?? [],
                    total: payload.total ?? 0,
                    page: 1,
                    hasMore: Boolean(payload.has_more),
                    truncated: Boolean(payload.truncated),
                    interpreted: payload.interpreted ?? null,
                    error: null,
                    loadingMore: false,
                });
            })
            .catch((err) => {
                if (err.name === 'AbortError' || current.current.controller !== controller) return;
                setState({ ...IDLE, status: 'error', error: err.message || 'The search could not be completed.' });
            });

        const delay = skipDebounce.current ? 0 : DEBOUNCE_MS;
        skipDebounce.current = false;
        const timer = setTimeout(run, delay);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query, retryTick, fetcher]);

    const loadMore = useCallback(() => {
        const { query: q, controller } = current.current;
        if (!q || !state.hasMore || state.loadingMore) return;
        const nextPage = state.page + 1;
        setState((s) => ({ ...s, loadingMore: true }));
        fetcher(q, nextPage, controller?.signal)
            .then((payload) => {
                if (current.current.query !== q) return;
                setState((s) => ({
                    ...s,
                    results: [...s.results, ...(payload.results ?? [])],
                    page: nextPage,
                    hasMore: Boolean(payload.has_more),
                    loadingMore: false,
                }));
            })
            .catch((err) => {
                if (err.name === 'AbortError' || current.current.query !== q) return;
                setState((s) => ({ ...s, loadingMore: false, error: err.message }));
            });
    }, [fetcher, state.hasMore, state.loadingMore, state.page]);

    return {
        query,
        ...state,
        active: query.length >= MIN_QUERY,
        tooShort: query.length > 0 && query.length < MIN_QUERY,
        retry: () => { skipDebounce.current = true; setRetryTick((n) => n + 1); },
        // Enter: search now instead of waiting for the typing pause (only if one is pending).
        flush: () => {
            if (state.status !== 'loading') return;
            skipDebounce.current = true;
            setRetryTick((n) => n + 1);
        },
        loadMore,
    };
}
