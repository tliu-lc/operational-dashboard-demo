"use client";
import type { MonitoringKpis } from "@/lib/api";
import { fmtEuros } from "@/lib/api";
import InfoTooltip from "@/components/InfoTooltip";

interface Props {
  data: MonitoringKpis | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function SkeletonCard() {
  return (
    <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4 space-y-2">
      <div className="h-3 bg-surface-3 animate-pulse rounded w-1/2" />
      <div className="h-8 bg-surface-3 animate-pulse rounded w-3/4" />
      <div className="h-3 bg-surface-3 animate-pulse rounded w-1/3" />
    </div>
  );
}

function TrendDisplay({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-sm text-fg-subtle">— données insuffisantes</span>;
  }
  const abs = Math.abs(pct);
  if (pct > 1) {
    return <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">↑ +{abs.toFixed(1)} %</span>;
  }
  if (pct < -1) {
    return <span className="text-lg font-semibold text-red-600 dark:text-red-400">↓ −{abs.toFixed(1)} %</span>;
  }
  return <span className="text-lg font-semibold text-fg-muted">→ stable</span>;
}

function QualityBadge({ pct }: { pct: number }) {
  if (pct >= 70) {
    return <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5 text-xs font-semibold">{pct.toFixed(0)} %</span>;
  }
  if (pct >= 50) {
    return <span className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 text-xs font-semibold">{pct.toFixed(0)} %</span>;
  }
  return <span className="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-full px-2 py-0.5 text-xs font-semibold">{pct.toFixed(0)} %</span>;
}

export default function KpisSection({ data, loading, error, onRetry }: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-fg mb-3">KPIs business</h2>

      {error && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-amber-700 dark:text-amber-300">⚠ Impossible de charger les KPIs</p>
          <button
            onClick={onRetry}
            className="text-xs bg-surface-2 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg px-3 py-1.5 ml-4 shrink-0"
          >
            Réessayer
          </button>
        </div>
      )}

      {!error && (
        <>
          {/* 4 KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              <>
                {/* CA 12 mois */}
                <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4">
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wide flex items-center">
                    CA 12 MOIS
                    <InfoTooltip text="Chiffre d'affaires hors taxes sur les 12 derniers mois glissants." position="bottom" />
                  </p>
                  <p className="text-3xl font-bold text-fg mt-1 leading-none">
                    {fmtEuros(data?.ca_12m ?? 0)}
                  </p>
                </div>

                {/* Clients actifs */}
                <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4">
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wide flex items-center">
                    CLIENTS ACTIFS 12M
                    <InfoTooltip text="Clients ayant passé au moins une commande sur les 12 derniers mois." position="bottom" />
                  </p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1 leading-none">
                    {data?.clients_actifs_12m ?? "—"}
                  </p>
                  {data && data.clients_total > 0 && (
                    <p className="text-sm text-fg-muted mt-1">sur {data.clients_total} au total</p>
                  )}
                </div>

                {/* Panier moyen */}
                <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4">
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wide flex items-center">
                    PANIER MOYEN
                    <InfoTooltip text="CA 12m divisé par le nombre de commandes sur la même période." position="bottom" />
                  </p>
                  <p className="text-3xl font-bold text-fg mt-1 leading-none">
                    {data ? fmtEuros(data.panier_moyen, 0) : "—"}
                  </p>
                  {data && data.nb_orders_12m > 0 && (
                    <p className="text-xs text-fg-subtle mt-1">{data.nb_orders_12m.toLocaleString("fr-FR")} commandes</p>
                  )}
                </div>

                {/* Tendance CA */}
                <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4">
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wide flex items-center">
                    TENDANCE CA
                    <InfoTooltip text="Évolution du CA 12m par rapport aux 12 mois précédents." position="bottom" />
                  </p>
                  <div className="mt-1">
                    <TrendDisplay pct={data?.ca_trend_pct ?? null} />
                  </div>
                  {data?.ca_12m_precedents != null && (
                    <p className="text-xs text-fg-subtle mt-1">vs {fmtEuros(data.ca_12m_precedents)} N-1</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 2 secondary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              <>
                {/* Stock coverage */}
                <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4">
                  <p className="text-base font-medium text-fg mb-3">Couverture stock</p>
                  {data?.stock_coverage ? (
                    <>
                      <div className="flex rounded-full overflow-hidden h-2.5 mb-3">
                        <div
                          className="bg-emerald-500 transition-all"
                          style={{ width: `${data.stock_coverage.pct_normal}%` }}
                        />
                        <div
                          className="bg-red-400 transition-all"
                          style={{ width: `${data.stock_coverage.pct_alerte}%` }}
                        />
                      </div>
                      <div className="flex gap-4 text-sm">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{data.stock_coverage.pct_normal.toFixed(0)} % normal</span>
                        <span className="text-red-500">{data.stock_coverage.pct_alerte.toFixed(0)} % en alerte</span>
                      </div>
                      <p className="text-xs text-fg-subtle mt-1">
                        {data.stock_coverage.total_articles.toLocaleString("fr-FR")} articles suivis
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-fg-subtle">Données non disponibles</p>
                  )}
                </div>

                {/* Data quality */}
                <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4">
                  <p className="text-base font-medium text-fg mb-3">Qualité des données</p>
                  {data?.data_quality ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-fg-muted">Historique suffisant</span>
                        <QualityBadge pct={data.data_quality.pct_clients_suffisant} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-fg-muted">Couverture stock calculable</span>
                        <QualityBadge pct={data.data_quality.pct_articles_coverage_calculable} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-fg-subtle">Données non disponibles</p>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
