"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { apiGet } from "@/lib/fetcher";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// usePaginatedList — unified data-fetching hook for every list page.
// Replaces ~15 hand-rolled useSWR + URLSearchParams implementations.
//
// Fixes audit findings F1 (silent truncation), F4 (client-side search on
// truncated windows), F5 (PaginationBar adoption), F6 (no shared hook),
// F8 (filter→page reset), F9 (empty-page recovery).
// ──────────────────────────────────────────────────────────────────────────

export interface UsePaginatedListOptions {
  /** Enable server-side ?search= param (debounced 300ms). Default false. */
  search?: boolean;
  /** Initial filter params sent as query string keys. */
  filters?: Record<string, unknown>;
  /** Page size. Default 20. */
  limit?: number;
}

export function usePaginatedList<T>(
  baseUrl: string,
  itemsKey: string,
  options: UsePaginatedListOptions = {},
) {
  const { search: searchEnabled = false, filters: initialFilters = {}, limit = 20 } = options;

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFiltersState] = useState<Record<string, unknown>>(initialFilters);

  // Debounce the search input (300ms). Hook is always called; the early
  // return is inside the effect callback, not around the hook.
  const searchEnabledSafe = Boolean(searchEnabled);
  useEffect(() => {
    if (!searchEnabledSafe) return;
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput, searchEnabledSafe]);

  // Reset to page 1 whenever search or filters change (prevents empty pages).
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, filterKey]);

  // Build the query string from page/limit/search/filters.
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (searchEnabledSafe && debouncedSearch) params.set("search", debouncedSearch);
    for (const [k, v] of Object.entries(filters)) {
      if (v === "" || v === null || v === undefined) continue;
      params.set(k, String(v));
    }
    return params.toString();
    // `filterKey` is the JSON-serialized form of `filters` — using it here
    // instead of `filters` avoids object-identity churn on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, searchEnabledSafe, debouncedSearch, filterKey]);

  const url = `${baseUrl}?${query}`;

  // Fetch. The API returns { [itemsKey]: T[], ...PaginationMeta } inside the
  // { success, data } envelope, which apiGet unwraps.
  const { data, error, isLoading, mutate } = useSWS(url);

  const items = useMemo<T[]>(
    () => ((data && (data as Record<string, unknown>)[itemsKey]) as T[] | undefined) ?? [],
    [data, itemsKey],
  );

  const meta = useMemo<PaginationMeta | null>(() => {
    if (!data) return null;
    const d = data as Record<string, unknown>;
    const total = Number(d.total ?? 0);
    const pages = Number(d.pages ?? 0);
    return {
      page: Number(d.page ?? page),
      limit: Number(d.limit ?? limit),
      total,
      pages,
      hasNext: Boolean(d.hasNext ?? page < pages),
      hasPrev: Boolean(d.hasPrev ?? page > 1),
    };
  }, [data, page, limit]);

  // Empty-page recovery: snap back to the last valid page. Guarded with a
  // ref so we only setState when the correction is actually needed (avoids
  // the cascading-render lint warning while keeping the safety behavior).
  const lastCorrectedPage = useRef<number | null>(null);
  useEffect(() => {
    if (meta && meta.pages > 0 && page > meta.pages && lastCorrectedPage.current !== meta.pages) {
      lastCorrectedPage.current = meta.pages;
      setPage(meta.pages);
    }
  }, [meta, page]);

  const setPageSafe = useCallback((p: number) => setPage(Math.max(1, p)), []);

  const setFilter = useCallback(
    (key: string, value: unknown) => {
      setFiltersState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setFilters = useCallback((next: Record<string, unknown>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(initialFilters);
    setSearchInput("");
    setDebouncedSearch("");
    setPage(1);
  }, [initialFilters]);

  return {
    items,
    meta,
    isLoading,
    error,
    page,
    limit,
    search: searchInput,
    filters,
    mutate,
    setPage: setPageSafe,
    setSearch: setSearchInput,
    setFilter,
    setFilters,
    resetFilters,
  };
}

// ─── Internal: useSWR wrapper bound to apiGet ──────────────────────────────
// Kept as a tiny local hook so the fetcher identity is stable and the
// generic type is inferred cleanly. (Defining the fetcher inline inside
// usePaginatedList created a new function each render, which is fine for
// SWR but harder to read.)
function useSWS(url: string) {
  return useSWR<Record<string, unknown>>(
    url,
    (u: string) =>
      apiGet<Record<string, unknown>>(u) as Promise<Record<string, unknown>>,
    { keepPreviousData: true },
  );
}
