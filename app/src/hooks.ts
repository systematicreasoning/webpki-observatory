/**
 * hooks.ts — Shared React hooks for the WebPKI Observatory.
 *
 * Deduplicates filter, pagination, and expansion patterns
 * that were previously copy-pasted across every view component.
 */
import { useState, useMemo, useCallback } from 'react';
import { dn } from './helpers';

/**
 * useFilterPaginate — filter + paginate any array of CA-like objects.
 *
 * Filters by caOwner display name and country (if present).
 * Returns the filtered+sliced data plus state setters.
 *
 * Usage:
 *   const { shown, filter, setFilter, pageSize, setPageSize } =
 *     useFilterPaginate(caData, { defaultPageSize: 15 });
 */
export function useFilterPaginate<T extends { caOwner?: string; country?: string; ca?: string }>(
  data: T[],
  opts: { defaultPageSize?: number; filterFn?: (item: T, query: string) => boolean } = {},
) {
  const { defaultPageSize = 15, filterFn } = opts;
  const [filter, setFilter] = useState('');
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return data;
    if (filterFn) return data.filter((item) => filterFn(item, q));
    return data.filter((item) => {
      const name = item.caOwner ? dn(item.caOwner) : item.ca || '';
      return (
        name.toLowerCase().includes(q) ||
        (item.country || '').toLowerCase().includes(q)
      );
    });
  }, [data, filter, filterFn]);

  const shown = useMemo(
    () => (pageSize === 0 ? filtered : filtered.slice(0, pageSize)),
    [filtered, pageSize],
  );

  return { filtered, shown, filter, setFilter, pageSize, setPageSize };
}

/**
 * useExpandable — manage single-item expansion state.
 *
 * Returns the currently expanded key and a toggle function.
 * Clicking the same row collapses it.
 *
 * Usage:
 *   const { expanded, toggle } = useExpandable();
 *   <tr onClick={() => toggle(row.id)}>
 *   {expanded === row.id && <CADetail d={row} />}
 */
export function useExpandable<K extends string | number>(initial: K | null = null) {
  const [expanded, setExpanded] = useState<K | null>(initial);
  const toggle = useCallback((key: K) => {
    setExpanded((prev) => (prev === key ? null : key));
  }, []);
  return { expanded, toggle };
}
