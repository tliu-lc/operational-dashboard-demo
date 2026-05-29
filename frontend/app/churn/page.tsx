"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchChurn, ChurnAlert, fmtDate, fmtEuros } from "@/lib/api";
import SkeletonTable from "@/components/SkeletonTable";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import Pagination from "@/components/Pagination";
import InfoTooltip from "@/components/InfoTooltip";

const LEVEL_CONFIG = {
  critique:     { label: "🔴 CRITIQUE",     classes: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-500"             },
  modere:       { label: "🟠 MODÉRÉ",       classes: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 border-orange-500" },
  surveillance: { label: "🟡 SURVEILLANCE", classes: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-500"     },
} as const;

const SIGNAL_LABELS: Record<string, string> = {
  inactivite: "Inactif depuis {recency} j",
  freq_basse: "Fréquence faible",
  ca_faible:  "CA faible",
};

const SIGNAL_TOOLTIPS: Record<string, string> = {
  inactivite: "Ce client n'a pas commandé depuis plus longtemps que sa fréquence habituelle.",
  freq_basse: "Le nombre de commandes sur les 3 derniers mois est inférieur à la moyenne historique du client.",
  ca_faible:  "Le chiffre d'affaires récent est significativement inférieur à la moyenne historique du client.",
};

const PAGE_SIZE = 20;

function renderTrend(ca_trend: string | null, ca_trend_pct: number | null): string {
  if (!ca_trend) return "—";
  const pct = Math.round(ca_trend_pct ?? 0);
  if (ca_trend === "hausse") return `↑ +${pct} %`;
  if (ca_trend === "baisse") return `↓ ${pct} %`;
  return "→ stable";
}

const clientId = (key: string) => key.split("|").slice(1).join("|");

export default function ChurnPage() {
  const { boutique } = useBoutique();
  const router = useRouter();
  const [data, setData] = useState<ChurnAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string[]>(["critique", "modere", "surveillance"]);
  const [nameFilter, setNameFilter] = useState("");
  const [inactifMin, setInactifMin] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchChurn(boutique)
      .then(r => setData(r.alerts))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); setPage(1); }, [boutique]);
  useEffect(() => { setPage(1); }, [levelFilter, nameFilter, inactifMin]);

  if (loading) return <><h1 className="text-2xl font-bold mb-4">Alertes churn</h1><SkeletonTable /></>;
  if (error) return <><h1 className="text-2xl font-bold mb-4">Alertes churn</h1><ErrorState message={error} onRetry={load} /></>;

  let filtered = data.filter(a => levelFilter.includes(a.churn_level));
  if (nameFilter) filtered = filtered.filter(a => a.customer_name.toLowerCase().includes(nameFilter.toLowerCase()));
  if (inactifMin > 0) filtered = filtered.filter(a => (a.recency_days ?? 0) >= inactifMin);

  const nCritique = data.filter(a => a.churn_level === "critique").length;
  const nModere = data.filter(a => a.churn_level === "modere").length;
  const nSurveillance = data.filter(a => a.churn_level === "surveillance").length;

  if (data.length === 0) return (
    <>
      <h1 className="text-2xl font-bold mb-4 flex items-center">
        Alertes churn
        <InfoTooltip
          text="Clients présentant des signaux de départ : inactivité prolongée, baisse de fréquence ou chute du chiffre d'affaires. Trois niveaux de risque : Critique, Modéré, Surveillance."
          position="right"
        />
      </h1>
      <EmptyState message="Aucune alerte churn pour cette boutique." positive />
    </>
  );

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 flex items-center">
        Alertes churn
        <InfoTooltip
          text="Clients présentant des signaux de départ : inactivité prolongée, baisse de fréquence ou chute du chiffre d'affaires. Trois niveaux de risque : Critique, Modéré, Surveillance."
          position="right"
        />
      </h1>
      <p className="text-sm text-fg-muted mb-4">
        🔴 <strong>{nCritique}</strong> critiques &nbsp;·&nbsp;
        🟠 <strong>{nModere}</strong> modérés &nbsp;·&nbsp;
        🟡 <strong>{nSurveillance}</strong> surveillés
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Recherche client…"
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          className="border border-border-strong rounded px-3 py-1.5 text-sm flex-1 min-w-48 bg-surface-2 text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex gap-2 flex-wrap">
          {(["critique", "modere", "surveillance"] as const).map(l => (
            <label key={l} className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={levelFilter.includes(l)}
                onChange={() => setLevelFilter(prev =>
                  prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]
                )}
              />
              {LEVEL_CONFIG[l].label}
              {l === "critique" && (
                <InfoTooltip text="Risque élevé de perte : inactivité longue + forte baisse du CA. Action commerciale urgente recommandée." position="bottom" />
              )}
              {l === "modere" && (
                <InfoTooltip text="Signaux faibles détectés : baisse de fréquence ou légère chute du CA. Surveiller de près." position="bottom" />
              )}
              {l === "surveillance" && (
                <InfoTooltip text="Légère anomalie détectée — pas encore préoccupant mais à suivre." position="bottom" />
              )}
            </label>
          ))}
        </div>
        <select
          value={inactifMin}
          onChange={e => setInactifMin(Number(e.target.value))}
          className="border border-border-strong rounded px-2 py-1 text-sm bg-surface-2 text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value={0}>Tout afficher</option>
          <option value={30}>&gt; 30 j</option>
          <option value={60}>&gt; 60 j</option>
          <option value={90}>&gt; 90 j</option>
          <option value={180}>&gt; 180 j</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="Aucune alerte ne correspond aux filtres sélectionnés." />
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map(a => {
              const cfg = LEVEL_CONFIG[a.churn_level];
              const trend = renderTrend(a.ca_trend, a.ca_trend_pct);
              const trendColor = a.ca_trend === "hausse" ? "text-green-600 dark:text-green-400" : a.ca_trend === "baisse" ? "text-red-600 dark:text-red-400" : "text-fg-muted";
              return (
                <div key={a.customer_key} className={`bg-surface-2 border border-border border-l-4 ${cfg.classes.split(' ').filter(c => c.startsWith('border-')).join(' ')} rounded-lg p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow`} onClick={() => router.push(`/client/${encodeURIComponent(clientId(a.customer_key))}`)}>

                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${cfg.classes.split(' ').filter(c => !c.startsWith('border-')).join(' ')}`}>{cfg.label}</span>
                    <span className={`text-sm font-bold ${trendColor}`}>{trend}</span>
                  </div>
                  <p className="font-semibold text-fg mt-1">{a.customer_name}</p>
                  <p className="text-sm text-fg-muted">
                    Dernier achat : {fmtDate(a.last_order_date)} · il y a {a.recency_days} jours
                  </p>
                  <p className="text-sm text-fg-muted">CA 12 mois : {fmtEuros(a.monetary_12m)} · CA total : {fmtEuros(a.ca_total_ht)}</p>
                  {a.churn_signals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.churn_signals.map(s => {
                        const tpl = SIGNAL_LABELS[s] ?? s;
                        const label = tpl.replace("{recency}", String(a.recency_days ?? "—"));
                        return (
                          <span key={s} className="flex items-center bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 text-xs px-2 py-0.5 rounded">
                            {label}
                            {SIGNAL_TOOLTIPS[s] && (
                              <InfoTooltip text={SIGNAL_TOOLTIPS[s]} position="right" />
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[20, 50]}
            itemLabel="alertes"
          />
        </>
      )}
    </div>
  );
}
