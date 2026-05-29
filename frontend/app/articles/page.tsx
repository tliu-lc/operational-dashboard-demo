"use client";
import { Fragment, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchArticles, fetchArticleClients, ArticleItem, ArticleClient, fmtEuros } from "@/lib/api";
import SkeletonTable from "@/components/SkeletonTable";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import InfoTooltip from "@/components/InfoTooltip";
import Pagination from "@/components/Pagination";
import SortableTh from "@/components/SortableTh";
import { useSortable } from "@/lib/useSortable";

const PAGE_SIZE = 50;

const FILTER_CLASS =
  "w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg " +
  "placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 " +
  "focus:border-accent transition-colors";

interface Filters {
  name: string;        // server-side (passé à l'API)
  type: string;        // server-side (passé à l'API)
  qtyMin: string;
  caMin: string;
  marginMin: string;
  sellThroughMin: string;
  stockMin: string;
  trendMin: string;
  clientsMin: string;
}

const EMPTY_FILTERS: Filters = {
  name: "", type: "", qtyMin: "", caMin: "", marginMin: "",
  sellThroughMin: "", stockMin: "", trendMin: "", clientsMin: "",
};

function FilterTh({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-2 pb-2 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-fg-subtle text-xs">—</span>;
  if (pct > 5)  return <span className="text-green-600 dark:text-green-400 text-xs font-medium">↑ +{pct.toFixed(0)} %</span>;
  if (pct < -5) return <span className="text-red-600 dark:text-red-400 text-xs font-medium">↓ {pct.toFixed(0)} %</span>;
  return <span className="text-fg-muted text-xs">→ {pct.toFixed(0)} %</span>;
}

function SellThroughBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-fg-subtle text-xs">—</span>;
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-fg-muted">{pct.toFixed(0)} %</span>
    </div>
  );
}

export default function ArticlesPage() {
  const { boutique } = useBoutique();
  const router = useRouter();
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [seasonLabel, setSeasonLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selectedItem, setSelectedItem] = useState<ArticleItem | null>(null);
  const [itemClients, setItemClients] = useState<ArticleClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const updateFilter = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(prev => ({ ...prev, [k]: v }));

  const load = () => {
    setLoading(true);
    setError(null);
    fetchArticles(boutique, { type: filters.type, sort: "ca", search: filters.name })
      .then(r => { setItems(r.items); setTypes(r.types); setSeasonLabel(r.season_label); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  // Recharge serveur uniquement quand boutique/name/type changent
  useEffect(() => { load(); setPage(1); setSelectedItem(null); }, [boutique, filters.name, filters.type]);
  // Reset page sur changement de filtre client-side
  useEffect(() => { setPage(1); }, [
    filters.qtyMin, filters.caMin, filters.marginMin,
    filters.sellThroughMin, filters.stockMin, filters.trendMin, filters.clientsMin,
  ]);

  const selectItem = (item: ArticleItem) => {
    if (selectedItem?.item_id === item.item_id) { setSelectedItem(null); setItemClients([]); return; }
    setSelectedItem(item);
    setClientsLoading(true);
    fetchArticleClients(item.item_id, boutique)
      .then(setItemClients)
      .catch(() => setItemClients([]))
      .finally(() => setClientsLoading(false));
  };

  // Filtres client-side (les filtres serveur sont déjà appliqués sur `items`)
  let filtered = items;
  const qtyMin = parseFloat(filters.qtyMin);
  if (!isNaN(qtyMin)) filtered = filtered.filter(i => i.qty_sold_season >= qtyMin);
  const caMin = parseFloat(filters.caMin);
  if (!isNaN(caMin)) filtered = filtered.filter(i => (i.ca_season_ht ?? 0) >= caMin);
  const marginMin = parseFloat(filters.marginMin);
  if (!isNaN(marginMin)) filtered = filtered.filter(i => i.margin_rate != null && i.margin_rate >= marginMin);
  const sellThroughMin = parseFloat(filters.sellThroughMin);
  if (!isNaN(sellThroughMin)) filtered = filtered.filter(i => i.sell_through_pct != null && i.sell_through_pct >= sellThroughMin);
  const stockMin = parseFloat(filters.stockMin);
  if (!isNaN(stockMin)) filtered = filtered.filter(i => (i.current_stock ?? 0) >= stockMin);
  const trendMin = parseFloat(filters.trendMin);
  if (!isNaN(trendMin)) filtered = filtered.filter(i => i.ca_trend_pct != null && i.ca_trend_pct >= trendMin);
  const clientsMin = parseFloat(filters.clientsMin);
  if (!isNaN(clientsMin)) filtered = filtered.filter(i => i.nb_clients_season >= clientsMin);

  type ColKey = "item_caption" | "type_vetement" | "qty_sold_season" | "ca_season_ht" | "margin_rate" | "sell_through_pct" | "current_stock" | "ca_trend_pct" | "nb_clients_season";
  const { sorted, sort, toggle } = useSortable<ArticleItem, ColKey>(filtered, {
    getValue: (row, key) => row[key],
    initialKey: "ca_season_ht",
    initialDir: "desc",
  });

  if (loading) return <><h1 className="text-2xl font-bold mb-4">Catalogue articles</h1><SkeletonTable /></>;
  if (error)   return <><h1 className="text-2xl font-bold mb-4">Catalogue articles</h1><ErrorState message={error} onRetry={load} /></>;

  const hasActiveFilter = Object.values(filters).some(v => v !== "");

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center">
          Catalogue articles
          <InfoTooltip text="Performance articles sur la saison en cours. Sell-through = % du stock écoulé." position="right" />
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          {seasonLabel && (
            <span className="text-sm text-fg-muted bg-surface-3 px-2 py-1 rounded">
              Saison : {seasonLabel.replace("SS_", "Été ").replace("AH_", "Hiver ")}
            </span>
          )}
          <span className="text-sm text-fg-muted">
            {sorted.length.toLocaleString("fr-FR")} article{sorted.length > 1 ? "s" : ""}
            {hasActiveFilter && <span className="text-fg-subtle"> (filtré sur {items.length.toLocaleString("fr-FR")})</span>}
          </span>
          {hasActiveFilter && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-xs text-fg-muted hover:text-fg underline"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-3">
            {/* Ligne 1 : noms de colonnes (triables) */}
            <tr className="border-b border-border">
              <SortableTh sortKey="item_caption"      sort={sort} onToggle={toggle} label="Article"    className="py-2 px-2" />
              <SortableTh sortKey="type_vetement"     sort={sort} onToggle={toggle} label="Catégorie"  className="py-2 px-2" />
              <SortableTh sortKey="qty_sold_season"   sort={sort} onToggle={toggle} align="right" label="Qté" className="py-2 px-2" />
              <SortableTh sortKey="ca_season_ht"      sort={sort} onToggle={toggle} align="right"
                label={<>CA saison<InfoTooltip text="CA HT sur la saison en cours." position="bottom" /></>}
                className="py-2 px-2" />
              <SortableTh sortKey="margin_rate"       sort={sort} onToggle={toggle} align="right"
                label={<>Marge<InfoTooltip text="Taux de marge brute = (CA - coût d'achat) / CA." position="bottom" /></>}
                className="py-2 px-2" />
              <SortableTh sortKey="sell_through_pct"  sort={sort} onToggle={toggle}
                label={<>Sell-through<InfoTooltip text="% du stock écoulé = qté vendue / (qté vendue + stock actuel)." position="bottom" /></>}
                className="py-2 px-2" />
              <SortableTh sortKey="current_stock"     sort={sort} onToggle={toggle} align="right" label="Stock" className="py-2 px-2" />
              <SortableTh sortKey="ca_trend_pct"      sort={sort} onToggle={toggle}
                label={<>Tendance N-1<InfoTooltip text="Évolution du CA par rapport à la même saison l'année précédente." position="bottom" /></>}
                className="py-2 px-2" />
              <SortableTh sortKey="nb_clients_season" sort={sort} onToggle={toggle} align="right"
                label={<>Clients<InfoTooltip text="Nombre de clients distincts ayant acheté cet article sur la saison en cours." position="bottom" /></>}
                className="py-2 px-2" />
            </tr>
            {/* Ligne 2 : filtres uniformes */}
            <tr className="border-b border-border">
              <FilterTh>
                <input type="text" placeholder="Recherche…" value={filters.name}
                  onChange={e => updateFilter("name", e.target.value)} className={FILTER_CLASS} />
              </FilterTh>
              <FilterTh>
                <select value={filters.type}
                  onChange={e => updateFilter("type", e.target.value)}
                  className={`${FILTER_CLASS} cursor-pointer`}>
                  <option value="">Toutes</option>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FilterTh>
              <FilterTh align="right">
                <input type="number" inputMode="numeric" placeholder="≥" value={filters.qtyMin}
                  onChange={e => updateFilter("qtyMin", e.target.value)} className={`${FILTER_CLASS} text-right`} />
              </FilterTh>
              <FilterTh align="right">
                <input type="number" inputMode="numeric" placeholder="≥ € HT" value={filters.caMin}
                  onChange={e => updateFilter("caMin", e.target.value)} className={`${FILTER_CLASS} text-right`} />
              </FilterTh>
              <FilterTh align="right">
                <input type="number" inputMode="numeric" placeholder="≥ %" value={filters.marginMin}
                  onChange={e => updateFilter("marginMin", e.target.value)} className={`${FILTER_CLASS} text-right`} />
              </FilterTh>
              <FilterTh>
                <input type="number" inputMode="numeric" placeholder="≥ %" value={filters.sellThroughMin}
                  onChange={e => updateFilter("sellThroughMin", e.target.value)} className={FILTER_CLASS} />
              </FilterTh>
              <FilterTh align="right">
                <input type="number" inputMode="numeric" placeholder="≥" value={filters.stockMin}
                  onChange={e => updateFilter("stockMin", e.target.value)} className={`${FILTER_CLASS} text-right`} />
              </FilterTh>
              <FilterTh>
                <input type="number" inputMode="numeric" placeholder="≥ %" value={filters.trendMin}
                  onChange={e => updateFilter("trendMin", e.target.value)} className={FILTER_CLASS} />
              </FilterTh>
              <FilterTh align="right">
                <input type="number" inputMode="numeric" placeholder="≥" value={filters.clientsMin}
                  onChange={e => updateFilter("clientsMin", e.target.value)} className={`${FILTER_CLASS} text-right`} />
              </FilterTh>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-fg-subtle">
                  Aucun article ne correspond aux filtres.
                </td>
              </tr>
            ) : (
              sorted.slice((page - 1) * pageSize, page * pageSize).map(item => {
                const isSelected = selectedItem?.item_id === item.item_id;
                return (
                  <Fragment key={item.item_id}>
                    <tr
                      className={`border-b border-border cursor-pointer transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-surface-3"}`}
                      onClick={() => selectItem(item)}
                    >
                      <td className="py-2 px-2 font-medium text-blue-700 dark:text-blue-300 max-w-xs truncate">{item.item_caption}</td>
                      <td className="py-2 px-2 text-fg-muted">{item.type_vetement}</td>
                      <td className="py-2 px-2 text-right text-fg">{item.qty_sold_season.toLocaleString("fr-FR")}</td>
                      <td className="py-2 px-2 text-right text-fg">{fmtEuros(item.ca_season_ht)}</td>
                      <td className="py-2 px-2 text-right">
                        {item.margin_rate != null
                          ? <span className={`font-medium ${item.margin_rate >= 30 ? "text-green-600 dark:text-green-400" : item.margin_rate >= 15 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{item.margin_rate.toFixed(1)} %</span>
                          : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="py-2 px-2"><SellThroughBar pct={item.sell_through_pct} /></td>
                      <td className="py-2 px-2 text-right text-fg-muted">{item.current_stock != null ? Math.round(item.current_stock) : "—"}</td>
                      <td className="py-2 px-2"><TrendBadge pct={item.ca_trend_pct} /></td>
                      <td className="py-2 px-2 text-right text-fg-muted">{item.nb_clients_season}</td>
                    </tr>

                    {isSelected && (
                      <tr className="bg-blue-50 dark:bg-blue-950/30">
                        <td colSpan={9} className="px-4 pb-4 pt-2">
                          <div className="border border-blue-200 dark:border-blue-900 rounded-lg p-3 bg-surface-2">
                            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-2">
                              Top clients acheteurs — {item.item_caption}
                            </p>
                            {clientsLoading ? (
                              <p className="text-sm text-fg-muted">Chargement…</p>
                            ) : itemClients.length === 0 ? (
                              <p className="text-sm text-fg-subtle">Aucun client trouvé.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-fg-muted border-b">
                                    <th className="pb-1 text-left font-medium">Client</th>
                                    <th className="pb-1 text-right font-medium">Qté totale</th>
                                    <th className="pb-1 text-right font-medium">CA total</th>
                                    <th className="pb-1 text-right font-medium">Cmds</th>
                                    <th className="pb-1 text-right font-medium">Dernier achat</th>
                                    <th className="pb-1"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {itemClients.map(c => (
                                    <tr key={c.customer_key} className="border-b border-border">
                                      <td className="py-1 pr-3 text-blue-700 dark:text-blue-300 font-medium">{c.customer_name}</td>
                                      <td className="py-1 pr-3 text-right text-fg-muted">{c.total_qty}</td>
                                      <td className="py-1 pr-3 text-right text-fg">{fmtEuros(c.total_ca_ht)}</td>
                                      <td className="py-1 pr-3 text-right text-fg-muted">{c.nb_orders}</td>
                                      <td className="py-1 pr-3 text-right text-fg-muted">{c.last_order_date ? new Date(c.last_order_date).toLocaleDateString("fr-FR") : "—"}</td>
                                      <td className="py-1 text-right">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); router.push(`/client/${encodeURIComponent(c.customer_id)}`); }}
                                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                                        >
                                          Fiche →
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > 0 && (
        <Pagination
          total={sorted.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={size => { setPageSize(size); setPage(1); setSelectedItem(null); }}
          pageSizeOptions={[25, 50, 100]}
          itemLabel="articles"
        />
      )}
    </div>
  );
}
