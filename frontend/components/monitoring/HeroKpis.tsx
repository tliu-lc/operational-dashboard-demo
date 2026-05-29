"use client";
import { useEffect, useState } from "react";
import type { MonitoringKpis } from "@/lib/api";
import { fetchAnalyseCaParJour, fmtEuros } from "@/lib/api";
import Sparkline from "@/components/Sparkline";

interface Props {
  data: MonitoringKpis | null;
  loading: boolean;
  boutique: string;
}

function TrendBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return null;
  const positive = pct >= 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
      positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
    }`}>
      <Icon />
      {positive ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

const ArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H8M17 7v9" />
  </svg>
);
const ArrowDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 7L7 17M7 17h9M7 17V8" />
  </svg>
);

function KpiCard({
  label, value, sublabel, trend, sparkline, accentClass = "text-accent", loading,
}: {
  label: string;
  value: string;
  sublabel?: string;
  trend?: number | null;
  sparkline?: number[];
  accentClass?: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 hover:shadow-card-hover transition-shadow group">
      <p className="text-xs font-medium text-fg-subtle uppercase tracking-wide">{label}</p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold text-fg tracking-tight">
          {loading ? <span className="inline-block w-20 h-7 bg-surface-3 rounded animate-pulse" /> : value}
        </p>
        {trend != null && <TrendBadge pct={trend} />}
      </div>
      <div className="mt-3 h-8 flex items-end justify-between gap-3">
        <p className="text-xs text-fg-muted">{sublabel}</p>
        {sparkline && sparkline.length > 1 && (
          <div className={accentClass}>
            <Sparkline data={sparkline} width={80} height={28} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function HeroKpis({ data, loading, boutique }: Props) {
  const [caSeries, setCaSeries] = useState<number[]>([]);

  useEffect(() => {
    // Sparkline CA = 30 derniers jours
    fetchAnalyseCaParJour(boutique, { days: 30 })
      .then(r => setCaSeries(r.data.map(d => d.ca)))
      .catch(() => setCaSeries([]));
  }, [boutique]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="CA 12 mois"
        value={loading || !data ? "" : fmtEuros(data.ca_12m, 0)}
        sublabel={data?.ca_12m_precedents ? `vs ${fmtEuros(data.ca_12m_precedents, 0)}` : undefined}
        trend={data?.ca_trend_pct}
        sparkline={caSeries}
        accentClass="text-blue-500 dark:text-blue-400"
        loading={loading}
      />
      <KpiCard
        label="Panier moyen"
        value={loading || !data ? "" : fmtEuros(data.panier_moyen, 0)}
        sublabel="sur 12 mois"
        accentClass="text-emerald-500 dark:text-emerald-400"
        loading={loading}
      />
      <KpiCard
        label="Clients actifs"
        value={loading || !data ? "" : `${data.clients_actifs_12m}`}
        sublabel={data ? `${data.clients_total} au total` : undefined}
        accentClass="text-violet-500 dark:text-violet-400"
        loading={loading}
      />
      <KpiCard
        label="Commandes"
        value={loading || !data ? "" : `${data.nb_orders_12m?.toLocaleString("fr-FR") ?? "—"}`}
        sublabel="sur 12 mois"
        accentClass="text-amber-500 dark:text-amber-400"
        loading={loading}
      />
    </div>
  );
}
