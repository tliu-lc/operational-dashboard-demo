"use client";

interface Props {
  lastImportDate: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now  = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function freshnessLevel(days: number | null): "vert" | "amber" | "rouge" | "gris" {
  if (days == null) return "gris";
  if (days < 30) return "vert";
  if (days <= 90) return "amber";
  return "rouge";
}

const DOT_CLASSES: Record<"vert" | "amber" | "rouge" | "gris", string> = {
  vert:  "bg-emerald-500",
  amber: "bg-amber-500",
  rouge: "bg-red-500",
  gris:  "bg-stone-300",
};

export default function HeaderProspection({ lastImportDate, onRefresh, refreshing }: Props) {
  const days = daysAgo(lastImportDate);
  const level = freshnessLevel(days);
  const dateLabel = lastImportDate
    ? new Date(lastImportDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    : "non disponible";
  const daysLabel = days == null ? "" : days === 0 ? " · aujourd'hui" : ` · il y a ${days} jour${days > 1 ? "s" : ""}`;

  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-bold text-fg tracking-tight">Prospection</h1>
        <p className="text-xs text-fg-subtle mt-1 flex items-center gap-2">
          <span className="text-fg-muted">Vue toutes boutiques</span>
          <span className="text-fg-subtle">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT_CLASSES[level]}`} />
            Dernier import SIRENE : {dateLabel}{daysLabel}
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-fg-muted hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border rounded-md transition-colors disabled:opacity-60"
      >
        <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Actualiser
      </button>
    </div>
  );
}
