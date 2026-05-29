"use client";

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (n: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

export default function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  itemLabel = "lignes",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-fg-muted">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Page précédente"
        aria-disabled={page === 1}
        className="px-3 py-1.5 rounded border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-3"
      >
        ← Préc.
      </button>

      <span aria-live="polite" className="text-fg-muted flex items-center gap-2">
        <span>Page {page} / {totalPages}</span>
        <span className="text-fg-subtle hidden sm:inline">
          ({firstItem}–{lastItem} sur {total} {itemLabel})
        </span>
        {onPageSizeChange && pageSizeOptions && (
          <select
            value={pageSize}
            onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
            className="border border-border rounded px-2 py-0.5 text-xs text-fg-muted bg-surface-2 ml-1 cursor-pointer hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {pageSizeOptions.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Page suivante"
        aria-disabled={page === totalPages}
        className="px-3 py-1.5 rounded border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-3"
      >
        Suiv. →
      </button>
    </div>
  );
}
