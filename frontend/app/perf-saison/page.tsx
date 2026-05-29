"use client";
import { useState, useEffect } from "react";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchPerfSeasons, fetchPerfSaison, PerfItem, fmtEuros } from "@/lib/api";
import SkeletonTable from "@/components/SkeletonTable";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import InfoTooltip from "@/components/InfoTooltip";
import SortableTh from "@/components/SortableTh";
import { useSortable } from "@/lib/useSortable";

function fmt(val: number | null, unit = ""): string {
  if (val == null) return "—";
  return `${val.toLocaleString("fr-FR")}${unit}`;
}

function fmtTrend(val: number | null): string {
  if (val == null) return "—";
  const sign = val > 0 ? "+" : "";
  return `${val > 0 ? "↑" : val < 0 ? "↓" : "→"} ${sign}${val.toFixed(1)} %`;
}

function PerfTable({ items, mode }: { items: PerfItem[]; mode: "best" | "flop" }) {
  // Préselection top/bottom 10 par CA (logique existante)
  const preSorted = mode === "best"
    ? [...items].sort((a, b) => (b.revenue_ht_season ?? 0) - (a.revenue_ht_season ?? 0))
    : [...items].filter(i => (i.real_stock_current ?? 0) > 0).sort((a, b) => (a.revenue_ht_season ?? 0) - (b.revenue_ht_season ?? 0));
  const top10 = preSorted.slice(0, 10);

  type ColKey = "item_caption" | "type_vetement" | "revenue_ht_season" | "qty_sold_season" | "margin_ht_season" | "margin_rate" | "real_stock_current" | "ca_trend_season_pct";
  const { sorted, sort, toggle } = useSortable<PerfItem, ColKey>(top10, {
    getValue: (row, key) => row[key],
    initialKey: "revenue_ht_season",
    initialDir: mode === "best" ? "desc" : "asc",
  });

  if (sorted.length === 0) return <EmptyState message={mode === "best" ? "Aucun best-seller pour cette sélection." : "Aucun flop avec stock résiduel."} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-fg-muted text-left">
            <th className="py-1.5 pr-2 font-medium flex items-center gap-1">
              #
              <InfoTooltip text="Position de l'article selon son CA HT dans la saison sélectionnée. Le rang 1 est le meilleur vendeur." position="bottom" />
            </th>
            <SortableTh sortKey="item_caption"        sort={sort} onToggle={toggle} label="Article"   className="py-1.5 pr-2" />
            <SortableTh sortKey="type_vetement"       sort={sort} onToggle={toggle} label="Type"      className="py-1.5 pr-2" />
            <SortableTh sortKey="revenue_ht_season"   sort={sort} onToggle={toggle} align="right" label="CA HT"     className="py-1.5 pr-2" />
            <SortableTh sortKey="qty_sold_season"     sort={sort} onToggle={toggle} align="right" label="Qté"       className="py-1.5 pr-2" />
            <SortableTh sortKey="margin_ht_season"    sort={sort} onToggle={toggle} align="right" label="Marge"     className="py-1.5 pr-2" />
            <SortableTh sortKey="margin_rate"         sort={sort} onToggle={toggle} align="right" label="Tx marge"  className="py-1.5 pr-2" />
            <SortableTh sortKey="real_stock_current"  sort={sort} onToggle={toggle} align="right" label="Stock act." className="py-1.5" />
            {mode === "best" && <SortableTh sortKey="ca_trend_season_pct" sort={sort} onToggle={toggle} align="right" label="vs N-1" className="py-1.5 pl-2" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, i) => (
            <tr key={item.item_id} className="border-b border-border">
              <td className="py-1.5 pr-2 text-fg-subtle">{i + 1}</td>
              <td className="py-1.5 pr-2 text-fg">{item.item_caption ?? `(ID: ${item.item_id})`}</td>
              <td className="py-1.5 pr-2 text-fg-muted">{item.type_vetement}</td>
              <td className="py-1.5 pr-2 text-right text-fg">{fmtEuros(item.revenue_ht_season)}</td>
              <td className="py-1.5 pr-2 text-right text-fg">{fmt(item.qty_sold_season)}</td>
              <td className="py-1.5 pr-2 text-right text-fg">{fmtEuros(item.margin_ht_season)}</td>
              <td className="py-1.5 pr-2 text-right text-fg-muted">{fmt(item.margin_rate, " %")}</td>
              <td className="py-1.5 text-right text-fg-muted">{fmt(item.real_stock_current)}</td>
              {mode === "best" && <td className="py-1.5 pl-2 text-right text-fg-muted">{fmtTrend(item.ca_trend_season_pct)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PerfSaisonPage() {
  const { boutique } = useBoutique();
  const [seasons, setSeasons] = useState<{ season_label: string; is_current: boolean }[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [items, setItems] = useState<PerfItem[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPerfSeasons(boutique)
      .then(s => {
        setSeasons(s);
        const defaultSeason = s.find(x => !x.is_current)?.season_label ?? s[0]?.season_label ?? "";
        setSelectedSeason(defaultSeason);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [boutique]);

  useEffect(() => {
    if (!selectedSeason) return;
    setLoadingData(true);
    fetchPerfSaison(boutique, selectedSeason)
      .then(r => { setItems(r.items); setTypes(r.types); setTypeFilter(""); })
      .catch(e => setError(e.message))
      .finally(() => setLoadingData(false));
  }, [boutique, selectedSeason]);

  if (loading) return <><h1 className="text-2xl font-bold mb-4">Best-sellers &amp; Flops</h1><SkeletonTable /></>;
  if (error) return <><h1 className="text-2xl font-bold mb-4">Best-sellers &amp; Flops</h1><ErrorState message={error} onRetry={() => { setError(null); setLoading(true); }} /></>;
  if (seasons.length === 0) return (
    <>
      <h1 className="text-2xl font-bold mb-4 flex items-center">
        Best-sellers &amp; Flops par saison
        <InfoTooltip
          text="Classement des articles selon leur performance de vente par saison — identifie les best-sellers à réapprovisionner et les flops à déstockter."
          position="right"
        />
      </h1>
      <EmptyState message="Aucune donnée de performance disponible pour cette boutique." />
    </>
  );

  let filtered = items;
  if (typeFilter) filtered = filtered.filter(i => i.type_vetement === typeFilter);

  const currentSeason = seasons.find(s => s.season_label === selectedSeason);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 flex items-center">
        Best-sellers &amp; Flops par saison
        <InfoTooltip
          text="Classement des articles selon leur performance de vente par saison — identifie les best-sellers à réapprovisionner et les flops à déstockter."
          position="right"
        />
      </h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <select value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)} className="border border-border-strong rounded px-2 py-1.5 text-sm bg-surface-2 text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30">
          {seasons.map(s => (
            <option key={s.season_label} value={s.season_label}>
              {s.season_label}{s.is_current ? " (en cours — données partielles)" : ""}
            </option>
          ))}
        </select>
        {currentSeason?.is_current && (
          <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 font-medium">
            ⚠ Saison en cours
            <InfoTooltip text="Les données de cette saison sont partielles — la saison n'est pas encore terminée. Les chiffres évolueront." position="bottom" />
          </span>
        )}
        {types.length > 0 && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-border-strong rounded px-2 py-1.5 text-sm bg-surface-2 text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30">
            <option value="">Tous types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {loadingData ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <EmptyState message="Aucun article vendu pour cette sélection." />
      ) : (
        <div className="flex flex-col gap-10">
          <div>
            <h2 className="text-lg font-semibold mb-3">🏆 Best-sellers — Top 10</h2>
            <PerfTable items={filtered} mode="best" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              📉 Flops — Bottom 10 (stock résiduel &gt; 0)
              <InfoTooltip text="Articles classés dans le bas du tableau — faible CA ou faible volume vendu pour la saison." position="right" />
            </h2>
            <PerfTable items={filtered} mode="flop" />
          </div>
        </div>
      )}
    </div>
  );
}
