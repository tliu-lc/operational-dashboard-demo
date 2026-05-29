"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchRFM } from "@/lib/api";
import type { RFMCustomer } from "@/lib/api";
import InfoTooltip from "@/components/InfoTooltip";
import ErrorState from "@/components/ErrorState";
import SkeletonTable from "@/components/SkeletonTable";
import Pagination from "@/components/Pagination";
import SortableTh from "@/components/SortableTh";
import { useSortable } from "@/lib/useSortable";

const STATUS_CONFIG = {
  en_retard:   { label: "En retard",      bg: "bg-rose-100 dark:bg-rose-950/40",       text: "text-rose-700 dark:text-rose-300"       },
  du_semaine:  { label: "Cette semaine",  bg: "bg-amber-100 dark:bg-amber-950/40",     text: "text-amber-700 dark:text-amber-300"     },
  a_venir:     { label: "À venir",        bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300" },
  insuffisant: { label: "Insuf. données", bg: "bg-surface-3",                          text: "text-fg-muted"                          },
} as const;

const STATUS_ORDER = ["en_retard", "du_semaine", "a_venir", "insuffisant"] as const;

// Priorité d'affichage par statut (les plus urgents en haut quand tri par statut)
const STATUS_PRIORITY: Record<string, number> = {
  en_retard:   0,
  du_semaine:  1,
  a_venir:     2,
  insuffisant: 3,
};

const FILTER_CLASS =
  "w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg " +
  "placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 " +
  "focus:border-accent transition-colors";

interface Filters {
  name: string;
  lastOrderFrom: string;
  orderCountMin: string;
  freqMax: string;
  status: string;
}

const EMPTY_FILTERS: Filters = {
  name: "", lastOrderFrom: "", orderCountMin: "", freqMax: "", status: "",
};

function FilterTh({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-2 pb-2 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function StatusBadgeRFM({ status }: { status: RFMCustomer["reorder_status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.insuffisant;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

export default function RFMPage() {
  const router = useRouter();
  const { boutique, boutiqueLoaded } = useBoutique();
  const [customers, setCustomers] = useState<RFMCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const updateFilter = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!boutiqueLoaded) return;
    setLoading(true);
    setError(false);
    fetchRFM(boutique)
      .then(({ customers }) => setCustomers(customers))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [boutique, boutiqueLoaded]);

  // Reset à la page 1 quand le filtre, la boutique, ou la taille de page change
  useEffect(() => { setPage(1); }, [filters, boutique, pageSize]);

  // Compteurs par statut (calculés sur la donnée brute, indépendamment des filtres)
  const counts = useMemo(
    () => Object.fromEntries(
      STATUS_ORDER.map(s => [s, customers.filter(c => c.reorder_status === s).length])
    ),
    [customers],
  );

  // Filtrage client-side
  const filtered = useMemo(() => {
    let list = customers;
    const nameQ = filters.name.toLowerCase().trim();
    if (nameQ) list = list.filter(c => c.customer_name.toLowerCase().includes(nameQ));
    if (filters.lastOrderFrom) {
      list = list.filter(c => c.last_order_date != null && c.last_order_date >= filters.lastOrderFrom);
    }
    const orderCountMin = parseInt(filters.orderCountMin, 10);
    if (!isNaN(orderCountMin)) list = list.filter(c => c.order_count_24m >= orderCountMin);
    const freqMax = parseInt(filters.freqMax, 10);
    if (!isNaN(freqMax)) list = list.filter(c => c.median_frequency_days != null && c.median_frequency_days <= freqMax);
    if (filters.status) list = list.filter(c => c.reorder_status === filters.status);
    return list;
  }, [customers, filters]);

  // Tri client-side via useSortable (avec priorité statut comme tri par défaut)
  type ColKey = "customer_name" | "last_order_date" | "order_count_24m" | "median_frequency_days" | "reorder_status";
  const { sorted, sort, toggle } = useSortable<RFMCustomer, ColKey>(filtered, {
    getValue: (row, key) => {
      if (key === "reorder_status") return STATUS_PRIORITY[row.reorder_status] ?? 99;
      return row[key];
    },
    initialKey: "reorder_status",
    initialDir: "asc",
  });

  // Pagination côté client
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const hasActiveFilter = Object.values(filters).some(v => v !== "");

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-fg">Relances clients</h1>
            <InfoTooltip
              text="Pour chaque client, on calcule sa fréquence d'achat habituelle. Le statut indique s'il devrait recommander cette semaine, s'il est en retard, ou si ses données sont insuffisantes pour décider."
              position="right"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-muted">
              {sorted.length.toLocaleString("fr-FR")} client{sorted.length > 1 ? "s" : ""}
              {hasActiveFilter && <span className="text-fg-subtle"> (filtré sur {customers.length.toLocaleString("fr-FR")})</span>}
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
        <p className="text-sm text-fg-muted mt-1">
          Identifiez en un coup d&apos;œil les clients à contacter dès maintenant
        </p>
      </div>

      {loading && <SkeletonTable rows={10} cols={5} />}
      {error && <ErrorState onRetry={() => window.location.reload()} />}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-3">
                {/* Ligne 1 : noms de colonnes (triables) */}
                <tr className="border-b border-border">
                  <SortableTh sortKey="customer_name"         sort={sort} onToggle={toggle} label="Client"        className="py-2 px-2" />
                  <SortableTh sortKey="last_order_date"       sort={sort} onToggle={toggle} label="Dernier achat" className="py-2 px-2" />
                  <SortableTh sortKey="order_count_24m"       sort={sort} onToggle={toggle} align="right"
                    label={<>Commandes<InfoTooltip text="Nombre de commandes du client sur les 24 derniers mois" position="bottom" /></>}
                    className="py-2 px-2" />
                  <SortableTh sortKey="median_frequency_days" sort={sort} onToggle={toggle} align="right"
                    label={<>Fréquence<InfoTooltip text="Intervalle médian entre deux commandes (en jours)" position="bottom" /></>}
                    className="py-2 px-2" />
                  <SortableTh sortKey="reorder_status"        sort={sort} onToggle={toggle} label="Statut"        className="py-2 px-2" />
                </tr>
                {/* Ligne 2 : filtres uniformes */}
                <tr className="border-b border-border">
                  <FilterTh>
                    <input type="text" placeholder="Recherche…" value={filters.name}
                      onChange={e => updateFilter("name", e.target.value)} className={FILTER_CLASS} />
                  </FilterTh>
                  <FilterTh>
                    <input type="date" title="Dernier achat depuis…" value={filters.lastOrderFrom}
                      onChange={e => updateFilter("lastOrderFrom", e.target.value)} className={FILTER_CLASS} />
                  </FilterTh>
                  <FilterTh align="right">
                    <input type="number" inputMode="numeric" placeholder="≥" value={filters.orderCountMin}
                      onChange={e => updateFilter("orderCountMin", e.target.value)} className={`${FILTER_CLASS} text-right`} />
                  </FilterTh>
                  <FilterTh align="right">
                    <input type="number" inputMode="numeric" placeholder="≤ jours" value={filters.freqMax}
                      onChange={e => updateFilter("freqMax", e.target.value)} className={`${FILTER_CLASS} text-right`} />
                  </FilterTh>
                  <FilterTh>
                    <select value={filters.status}
                      onChange={e => updateFilter("status", e.target.value)}
                      className={`${FILTER_CLASS} cursor-pointer`}>
                      <option value="">Tous</option>
                      {STATUS_ORDER.map(s => (
                        <option key={s} value={s}>
                          {STATUS_CONFIG[s].label} ({counts[s] ?? 0})
                        </option>
                      ))}
                    </select>
                  </FilterTh>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-fg-subtle">
                      Aucun client ne correspond aux filtres.
                    </td>
                  </tr>
                )}
                {paginated.map(c => (
                  <tr
                    key={c.customer_key}
                    className="border-b border-border hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer transition-colors"
                    onClick={() => router.push(`/client/${encodeURIComponent(c.customer_id)}`)}
                  >
                    <td className="py-2 px-2 font-medium text-blue-700 dark:text-blue-300">{c.customer_name}</td>
                    <td className="py-2 px-2 text-fg-muted">
                      {c.last_order_date
                        ? new Date(c.last_order_date).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                    <td className="py-2 px-2 text-right text-fg">{c.order_count_24m}</td>
                    <td className="py-2 px-2 text-right text-fg-muted">
                      {c.median_frequency_days != null ? `${c.median_frequency_days}j` : "—"}
                    </td>
                    <td className="py-2 px-2">
                      <StatusBadgeRFM status={c.reorder_status} />
                      {c.days_overdue != null && c.days_overdue > 0 && (
                        <span className="ml-2 text-xs text-rose-500 dark:text-rose-400">+{c.days_overdue}j</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            total={sorted.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[25, 50, 100, 200]}
            itemLabel="clients"
          />
        </>
      )}
    </div>
  );
}
