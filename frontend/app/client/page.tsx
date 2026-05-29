"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchClientList, ClientListItem, fmtDate, fmtEuros } from "@/lib/api";
import SkeletonTable from "@/components/SkeletonTable";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import Pagination from "@/components/Pagination";
import InfoTooltip from "@/components/InfoTooltip";
import SortableTh from "@/components/SortableTh";
import { useSortable } from "@/lib/useSortable";

const CHURN_LABELS: Record<string, string> = { vert: "Fidèle", orange: "À risque", rouge: "En fuite", gris: "Sans achat" };
const CHURN_COLORS: Record<string, string> = { vert: "text-green-600 dark:text-green-400", orange: "text-orange-500", rouge: "text-red-600 dark:text-red-400", gris: "text-slate-400" };

const SEGMENT_CONFIG: Record<string, { label: string; classes: string; tooltip: string }> = {
  vip:       { label: "VIP",         classes: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300",         tooltip: "Top 10% CA · commandes fréquentes · actif récemment." },
  actif:     { label: "Actif",       classes: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300", tooltip: "Commandes régulières, actif sur les 90 derniers jours." },
  saisonnier:{ label: "Saisonnier",  classes: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300",             tooltip: "Achète 1-2 fois par an selon les saisons." },
  nouveau:   { label: "Nouveau",     classes: "bg-violet-100 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300",     tooltip: "Premier achat dans les 90 derniers jours." },
  endormi:   { label: "Endormi",     classes: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300",     tooltip: "Inactif depuis 6 à 12 mois — à relancer." },
  inactif:   { label: "Inactif",     classes: "bg-surface-3 text-fg-subtle",                                                   tooltip: "Inactif depuis plus d'un an ou sans historique." },
};

const PRESENCE_OPTIONS = [
  { value: "both",     label: "Les deux" },
  { value: "sed_only", label: "Sédaine" },
  { value: "hip_only", label: "Fashion Center" },
];

const PAGE_SIZE = 20;

// Style commun pour tous les filtres → uniformité visuelle
const FILTER_CLASS =
  "w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg " +
  "placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 " +
  "focus:border-accent transition-colors";

interface Filters {
  name: string;
  presence: string;
  dept: string;
  segment: string;
  churn: string;
  caTotalMin: string;
  ca12mMin: string;
  lastOrderFrom: string;
}

const EMPTY_FILTERS: Filters = {
  name: "", presence: "", dept: "", segment: "", churn: "",
  caTotalMin: "", ca12mMin: "", lastOrderFrom: "",
};

function FilterTh({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-2 pb-2 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export default function ClientPage() {
  const { boutique } = useBoutique();
  const router = useRouter();
  const [data, setData] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const updateFilter = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(prev => ({ ...prev, [k]: v }));

  const load = () => {
    setLoading(true);
    setError(null);
    fetchClientList(boutique)
      .then(r => setData(r.customers))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); setPage(1); }, [boutique]);
  useEffect(() => { setPage(1); }, [filters]);

  // Filtrage (calculé toujours pour respecter les Rules of Hooks)
  let filtered = data;
  const nameQ = filters.name.toLowerCase().trim();
  if (nameQ) filtered = filtered.filter(c => c.customer_name.toLowerCase().includes(nameQ));
  if (filters.presence) filtered = filtered.filter(c => c.presence === filters.presence);
  if (filters.dept)     filtered = filtered.filter(c => c.dept_code === filters.dept);
  if (filters.segment)  filtered = filtered.filter(c => c.segment === filters.segment);
  if (filters.churn)    filtered = filtered.filter(c => c.churn_color === filters.churn);
  const caTotalMin = parseFloat(filters.caTotalMin);
  if (!isNaN(caTotalMin)) filtered = filtered.filter(c => (c.ca_total_ht ?? 0) >= caTotalMin);
  const ca12mMin = parseFloat(filters.ca12mMin);
  if (!isNaN(ca12mMin)) filtered = filtered.filter(c => (c.ca_12m_ht ?? 0) >= ca12mMin);
  if (filters.lastOrderFrom) {
    filtered = filtered.filter(c => c.last_order_date != null && c.last_order_date >= filters.lastOrderFrom);
  }

  type ColKey = "customer_name" | "presence" | "dept_code" | "segment" | "churn_color" | "ca_total_ht" | "ca_12m_ht" | "last_order_date";
  const { sorted, sort, toggle } = useSortable<ClientListItem, ColKey>(filtered, {
    getValue: (row, key) => row[key],
    initialKey: "ca_12m_ht",
    initialDir: "desc",
  });

  if (loading) return <><h1 className="text-2xl font-bold mb-4">Clients</h1><SkeletonTable /></>;
  if (error) return <><h1 className="text-2xl font-bold mb-4">Clients</h1><ErrorState message={error} onRetry={load} /></>;
  if (data.length === 0) return (
    <>
      <h1 className="text-2xl font-bold mb-4 flex items-center">
        Clients
        <InfoTooltip
          text="Liste complète des clients avec leur profil d'achat, statut de fidélité et indicateurs de performance sur les 12 derniers mois."
          position="right"
        />
      </h1>
      <EmptyState message="Aucun client disponible pour cette boutique." />
    </>
  );

  const depts = [...new Set(data.map(c => c.dept_code).filter(Boolean))].sort() as string[];
  const hasActiveFilter = Object.values(filters).some(v => v !== "");
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center">
          Clients
          <InfoTooltip
            text="Liste complète des clients avec leur profil d'achat, statut de fidélité et indicateurs de performance sur les 12 derniers mois."
            position="right"
          />
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-muted">
            {sorted.length.toLocaleString("fr-FR")} client{sorted.length > 1 ? "s" : ""}
            {hasActiveFilter && <span className="text-fg-subtle"> (filtré sur {data.length.toLocaleString("fr-FR")})</span>}
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
              <SortableTh sortKey="customer_name"   sort={sort} onToggle={toggle} label="Client"      className="py-2 px-2" />
              {boutique === "ALL" && (
                <SortableTh sortKey="presence"     sort={sort} onToggle={toggle} label="Présence"   className="py-2 px-2" />
              )}
              <SortableTh sortKey="dept_code"       sort={sort} onToggle={toggle} label="Dép."       className="py-2 px-2" />
              <SortableTh sortKey="segment"         sort={sort} onToggle={toggle} label="Segment"    className="py-2 px-2" />
              <SortableTh sortKey="churn_color"     sort={sort} onToggle={toggle} label="Churn"      className="py-2 px-2" />
              <SortableTh sortKey="ca_total_ht"     sort={sort} onToggle={toggle} align="right"     label={<>CA Total<InfoTooltip text="CA HT total sur toute la période." position="bottom" /></>} className="py-2 px-2" />
              <SortableTh sortKey="ca_12m_ht"       sort={sort} onToggle={toggle} align="right"     label={<>CA 12M<InfoTooltip text="CA HT sur les 12 derniers mois glissants." position="bottom" /></>}    className="py-2 px-2" />
              <SortableTh sortKey="last_order_date" sort={sort} onToggle={toggle} label="Dern. cmd." className="py-2 px-2" />
            </tr>
            {/* Ligne 2 : filtres uniformes */}
            <tr className="border-b border-border">
              <FilterTh>
                <input
                  type="text"
                  placeholder="Recherche…"
                  value={filters.name}
                  onChange={e => updateFilter("name", e.target.value)}
                  className={FILTER_CLASS}
                />
              </FilterTh>
              {boutique === "ALL" && (
                <FilterTh>
                  <select
                    value={filters.presence}
                    onChange={e => updateFilter("presence", e.target.value)}
                    className={`${FILTER_CLASS} cursor-pointer`}
                  >
                    <option value="">Tous</option>
                    {PRESENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FilterTh>
              )}
              <FilterTh>
                <select
                  value={filters.dept}
                  onChange={e => updateFilter("dept", e.target.value)}
                  className={`${FILTER_CLASS} cursor-pointer`}
                >
                  <option value="">Tous</option>
                  {depts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </FilterTh>
              <FilterTh>
                <select
                  value={filters.segment}
                  onChange={e => updateFilter("segment", e.target.value)}
                  className={`${FILTER_CLASS} cursor-pointer`}
                >
                  <option value="">Tous</option>
                  {Object.entries(SEGMENT_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </FilterTh>
              <FilterTh>
                <select
                  value={filters.churn}
                  onChange={e => updateFilter("churn", e.target.value)}
                  className={`${FILTER_CLASS} cursor-pointer`}
                >
                  <option value="">Tous</option>
                  {Object.entries(CHURN_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </FilterTh>
              <FilterTh align="right">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="≥ € HT"
                  value={filters.caTotalMin}
                  onChange={e => updateFilter("caTotalMin", e.target.value)}
                  className={`${FILTER_CLASS} text-right`}
                />
              </FilterTh>
              <FilterTh align="right">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="≥ € HT"
                  value={filters.ca12mMin}
                  onChange={e => updateFilter("ca12mMin", e.target.value)}
                  className={`${FILTER_CLASS} text-right`}
                />
              </FilterTh>
              <FilterTh>
                <input
                  type="date"
                  title="Dernière commande depuis…"
                  value={filters.lastOrderFrom}
                  onChange={e => updateFilter("lastOrderFrom", e.target.value)}
                  className={FILTER_CLASS}
                />
              </FilterTh>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={boutique === "ALL" ? 8 : 7} className="px-4 py-12 text-center text-fg-subtle">
                  Aucun client ne correspond aux filtres.
                </td>
              </tr>
            ) : (
              paginated.map(c => (
                <tr
                  key={c.customer_id}
                  className="border-b border-border hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/client/${encodeURIComponent(c.customer_id)}`)}
                >
                  <td className="py-2 px-2 font-medium text-blue-700 dark:text-blue-300">{c.customer_name}</td>
                  {boutique === "ALL" && (
                    <td className="py-2 px-2">
                      {c.presence === "both" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Les deux
                        </span>
                      )}
                      {c.presence === "sed_only" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                          Sédaine
                        </span>
                      )}
                      {c.presence === "hip_only" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                          Fashion Center
                        </span>
                      )}
                      {!c.presence && <span className="text-xs text-fg-subtle">—</span>}
                    </td>
                  )}
                  <td className="py-2 px-2 text-fg-muted">{c.dept_code ?? "—"}</td>
                  <td className="py-2 px-2">
                    {(() => {
                      const cfg = SEGMENT_CONFIG[c.segment];
                      return cfg
                        ? <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.classes}`}>{cfg.label}</span>
                        : <span className="text-fg-subtle text-xs">—</span>;
                    })()}
                  </td>
                  <td className={`py-2 px-2 font-medium ${CHURN_COLORS[c.churn_color] ?? ""}`}>
                    {CHURN_LABELS[c.churn_color] ?? c.churn_color}
                  </td>
                  <td className="py-2 px-2 text-right text-fg">{fmtEuros(c.ca_total_ht)}</td>
                  <td className="py-2 px-2 text-right text-fg">{fmtEuros(c.ca_12m_ht)}</td>
                  <td className="py-2 px-2 text-fg-muted">{fmtDate(c.last_order_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        total={sorted.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[20, 50, 100]}
        itemLabel="clients"
      />
    </div>
  );
}
