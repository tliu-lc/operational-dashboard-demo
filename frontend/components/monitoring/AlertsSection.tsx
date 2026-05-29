"use client";
import Link from "next/link";
import type { MonitoringSummary } from "@/lib/api";

interface Props {
  data: MonitoringSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-8 bg-surface-3 animate-pulse rounded" />
      ))}
    </div>
  );
}

interface AlertRowProps {
  dot: "red" | "amber" | "neutral";
  label: string;
  count: number;
  href: string;
}

function AlertRow({ dot, label, count, href }: AlertRowProps) {
  const dotColor = {
    red: "text-red-500",
    amber: "text-amber-500",
    neutral: "text-fg-subtle",
  }[dot];

  return (
    <Link
      href={href}
      className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-surface-3 transition-colors group"
    >
      <span className="flex items-center gap-2 text-sm text-fg">
        <span className={`${dotColor} text-base leading-none`}>●</span>
        {label}
      </span>
      <span className="text-sm font-semibold text-fg">{count}</span>
    </Link>
  );
}

export default function AlertsSection({ data, loading, error, onRetry }: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-fg mb-3">Alertes opérationnelles</h2>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-700 dark:text-red-300">⚠ Impossible de charger les alertes</p>
          <button
            onClick={onRetry}
            className="text-xs bg-surface-2 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg px-3 py-1.5 ml-4 shrink-0"
          >
            Réessayer
          </button>
        </div>
      )}

      {!error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Churn */}
          <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-medium text-fg">Alertes churn</p>
              {!loading && data?.churn && (
                <span className="bg-surface-3 text-fg-muted rounded-full px-2 py-0.5 text-xs font-semibold">
                  {data.churn.critique + data.churn.modere + data.churn.surveillance} clients
                </span>
              )}
            </div>

            {loading ? (
              <SkeletonRows />
            ) : !data?.churn ? (
              <p className="text-sm text-fg-subtle">Données non disponibles</p>
            ) : data.churn.critique === 0 && data.churn.modere === 0 && data.churn.surveillance === 0 ? (
              <div className="flex items-center gap-2 py-2">
                <span className="text-emerald-600 dark:text-emerald-400 text-base">●</span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Aucune alerte churn ✓</span>
              </div>
            ) : (
              <div>
                <AlertRow dot="red" label="Critique" count={data.churn.critique} href="/churn?level=critique" />
                <AlertRow dot="amber" label="Modéré" count={data.churn.modere} href="/churn?level=modere" />
                <AlertRow dot="neutral" label="Surveillance" count={data.churn.surveillance} href="/churn?level=surveillance" />
              </div>
            )}
          </div>

          {/* Réassort */}
          <div className="bg-surface-2 rounded-xl shadow-sm border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-medium text-fg">Réassort</p>
              {!loading && data?.reorder && (
                <span className="bg-surface-3 text-fg-muted rounded-full px-2 py-0.5 text-xs font-semibold">
                  {data.reorder.en_retard + data.reorder.du_semaine} clients
                </span>
              )}
            </div>

            {loading ? (
              <SkeletonRows />
            ) : !data?.reorder ? (
              <p className="text-sm text-fg-subtle">Données non disponibles</p>
            ) : data.reorder.en_retard === 0 && data.reorder.du_semaine === 0 ? (
              <div className="flex items-center gap-2 py-2">
                <span className="text-emerald-600 dark:text-emerald-400 text-base">●</span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Aucun réassort urgent ✓</span>
              </div>
            ) : (
              <div>
                <AlertRow dot="red" label="En retard" count={data.reorder.en_retard} href="/" />
                <AlertRow dot="amber" label="Dû cette sem." count={data.reorder.du_semaine} href="/" />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
