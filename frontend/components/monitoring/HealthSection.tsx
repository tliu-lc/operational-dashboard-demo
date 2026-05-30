"use client";
import type { MonitoringHealth, MonitoringMartInfo } from "@/lib/api";
import { fmtDate } from "@/lib/api";

interface Props {
  data: MonitoringHealth | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const MART_LABELS: Record<string, string> = {
  mart_customer_rfm: "Relances clients",
  mart_churn_alerts: "Alertes churn",
  mart_stock_status: "Stock",
  mart_geo_sales: "Géo ventes",
  mart_item_perf_by_season: "Perf saison",
};

function FreshnessBadge({ days, level }: { days: number | null; level: string | null }) {
  if (!level) {
    return <span className="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-full px-2 py-0.5 text-xs font-semibold">Aucune donnée</span>;
  }
  if (level === "vert") {
    return <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5 text-xs font-semibold">À jour</span>;
  }
  if (level === "orange") {
    return <span className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 text-xs font-semibold">À vérifier</span>;
  }
  return (
    <span className="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-full px-2 py-0.5 text-xs font-semibold">
      {days !== null && days > 365 ? "> 1 an" : "Obsolète"}
    </span>
  );
}

function MartCard({ name, info }: { name: string; info: MonitoringMartInfo }) {
  const label = MART_LABELS[name] ?? name;
  if (!info.exists) {
    return (
      <div className="bg-surface-2 rounded-xl shadow-sm ring-1 ring-red-200 p-3">
        <p className="text-xs text-fg-muted truncate">{label}</p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">Table absente</p>
        <p className="text-xs text-red-400">Données pas encore disponibles</p>
      </div>
    );
  }
  if (info.count === 0) {
    return (
      <div className="bg-surface-2 rounded-xl shadow-sm ring-1 ring-amber-200 p-3">
        <p className="text-xs text-fg-muted truncate">{label}</p>
        <p className="text-lg font-semibold text-fg mt-1">0</p>
        <span className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 text-xs font-semibold">Table vide</span>
      </div>
    );
  }
  return (
    <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-3">
      <p className="text-xs text-fg-muted truncate">{label}</p>
      <p className="text-lg font-semibold text-fg mt-1">
        {info.count?.toLocaleString("fr-FR")}
      </p>
      <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5 text-xs font-semibold">Alimentée</span>
    </div>
  );
}

function SkeletonMart() {
  return (
    <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-3 space-y-2">
      <div className="h-3 bg-surface-3 animate-pulse rounded w-3/4" />
      <div className="h-5 bg-surface-3 animate-pulse rounded w-1/2" />
      <div className="h-3 bg-surface-3 animate-pulse rounded w-1/3" />
    </div>
  );
}

export default function HealthSection({ data, loading, error, onRetry }: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-fg mb-3">Santé des données</h2>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-700 dark:text-red-300">⚠ {error}</p>
          <button
            onClick={onRetry}
            className="text-xs bg-surface-2 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg px-3 py-1.5 ml-4 shrink-0"
          >
            Réessayer
          </button>
        </div>
      )}

      {!error && data?.bq_status === "error" && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">⚠ Les données ne sont pas disponibles pour le moment</p>
          <p className="text-xs text-red-500 mt-1">Veuillez réessayer dans quelques instants ou contacter le support.</p>
        </div>
      )}

      {!error && data?.bq_status !== "error" && (
        <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4 md:p-6 space-y-4">
          {/* BQ status + freshness row */}
          <div className="flex flex-wrap items-center gap-4">
            {loading ? (
              <div className="h-5 bg-surface-3 animate-pulse rounded w-40" />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">● Données opérationnelles</span>
              </div>
            )}

            {loading ? (
              <div className="h-5 bg-surface-3 animate-pulse rounded w-56" />
            ) : data ? (
              <div className="flex items-center gap-2 text-sm text-fg-muted">
                <span>Dernier document : {fmtDate(data.last_document_date)}</span>
                {data.days_since_last_doc !== null && (
                  <span className="text-fg-subtle">· il y a {data.days_since_last_doc} j</span>
                )}
                <FreshnessBadge days={data.days_since_last_doc} level={data.freshness_level} />
              </div>
            ) : null}
          </div>

          {/* Mart cards grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonMart key={i} />)
              : data?.mart_counts
              ? Object.entries(data.mart_counts).map(([name, info]) => (
                  <MartCard key={name} name={name} info={info} />
                ))
              : null}
          </div>
        </div>
      )}
    </section>
  );
}
