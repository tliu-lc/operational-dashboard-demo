"use client";
import { useState, useMemo } from "react";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> { key: K | null; dir: SortDir }

/**
 * Hook générique de tri pour tableaux client-side.
 *
 * Usage :
 *   const { sorted, sort, toggle } = useSortable(rows, {
 *     getValue: (row, key) => row[key],
 *     initialKey: "name",
 *   });
 *   <th onClick={() => toggle("name")}>Nom {sort.key === "name" && (sort.dir === "asc" ? "▲" : "▼")}</th>
 */
export function useSortable<T, K extends string>(
  rows: T[],
  opts: {
    getValue: (row: T, key: K) => unknown;
    initialKey?: K | null;
    initialDir?: SortDir;
  },
) {
  const [sort, setSort] = useState<SortState<K>>({
    key: opts.initialKey ?? null,
    dir: opts.initialDir ?? "asc",
  });

  const toggle = (k: K) => {
    setSort(prev =>
      prev.key === k
        ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: "asc" }
    );
  };

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const k = sort.key;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = opts.getValue(a, k);
      const vb = opts.getValue(b, k);

      // Null/undefined toujours en bas
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      // Numbers
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;

      // Dates ISO (YYYY-MM-DD)
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb, "fr", { numeric: true }) * mul;
      }

      // Fallback
      return String(va).localeCompare(String(vb), "fr", { numeric: true }) * mul;
    });
  }, [rows, sort, opts]);

  return { sorted, sort, toggle, setSort };
}
