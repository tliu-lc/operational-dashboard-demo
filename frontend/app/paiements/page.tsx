"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchPaymentsOverdue, PaymentsOverdue, OverdueClient, fmtEuros, fmtDate } from "@/lib/api";
import SkeletonTable from "@/components/SkeletonTable";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import SortableTh from "@/components/SortableTh";
import { useSortable } from "@/lib/useSortable";

const FILTER_CLASS =
  "w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg " +
  "placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 " +
  "focus:border-accent transition-colors";

interface Filters {
  name: string;
  city: string;
  nbInvoicesMin: string;
  amountMin: string;
  oldestFrom: string;
}

const EMPTY_FILTERS: Filters = {
  name: "", city: "", nbInvoicesMin: "", amountMin: "", oldestFrom: "",
};

function FilterTh({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-2 pb-2 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export default function PaiementsPage() {
  const { boutique } = useBoutique();
  const router = useRouter();
  const [data, setData] = useState<PaymentsOverdue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const updateFilter = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(prev => ({ ...prev, [k]: v }));

  const load = () => {
    setLoading(true);
    setError(null);
    fetchPaymentsOverdue(boutique)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [boutique]);

  // Filtrage client-side
  let filtered = data?.clients ?? [];
  const nameQ = filters.name.toLowerCase().trim();
  if (nameQ) filtered = filtered.filter(c => c.customer_name.toLowerCase().includes(nameQ));
  const cityQ = filters.city.toLowerCase().trim();
  if (cityQ) filtered = filtered.filter(c => (c.city ?? "").toLowerCase().includes(cityQ));
  const nbInvoicesMin = parseInt(filters.nbInvoicesMin, 10);
  if (!isNaN(nbInvoicesMin)) filtered = filtered.filter(c => (c.nb_invoices_overdue ?? 0) >= nbInvoicesMin);
  const amountMin = parseFloat(filters.amountMin);
  if (!isNaN(amountMin)) filtered = filtered.filter(c => (c.total_overdue_ht ?? 0) >= amountMin);
  if (filters.oldestFrom) {
    filtered = filtered.filter(c => c.oldest_overdue_date != null && c.oldest_overdue_date >= filters.oldestFrom);
  }

  type ColKey = "customer_name" | "city" | "nb_invoices_overdue" | "total_overdue_ht" | "oldest_overdue_date";
  const { sorted, sort, toggle } = useSortable<OverdueClient, ColKey>(filtered, {
    getValue: (row, key) => row[key], initialKey: "oldest_overdue_date", initialDir: "asc",
  });

  if (loading) return <><h1 className="text-2xl font-bold mb-4">Paiements en retard</h1><SkeletonTable /></>;
  if (error) return <><h1 className="text-2xl font-bold mb-4">Paiements en retard</h1><ErrorState message={error} onRetry={load} /></>;
  if (!data || data.nb_clients === 0) return (
    <>
      <h1 className="text-2xl font-bold mb-4">Paiements en retard</h1>
      <EmptyState message="Aucun client avec des factures impayées pour cette boutique." />
    </>
  );

  const hasActiveFilter = Object.values(filters).some(v => v !== "");

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Paiements en retard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-muted">
            {sorted.length.toLocaleString("fr-FR")} client{sorted.length > 1 ? "s" : ""}
            {hasActiveFilter && <span className="text-fg-subtle"> (filtré sur {data.clients.length.toLocaleString("fr-FR")})</span>}
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

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl shadow-sm p-5 text-center">
          <p className="text-xs text-red-600 dark:text-red-400 mb-1">Total impayé HT</p>
          <p className="text-3xl font-bold text-red-700 dark:text-red-300">{fmtEuros(data.total_overdue_ht)}</p>
        </div>
        <div className="bg-surface-3 border border-border rounded-xl shadow-sm p-5 text-center">
          <p className="text-xs text-fg-muted mb-1">Clients en retard</p>
          <p className="text-3xl font-bold text-fg">{data.nb_clients.toLocaleString("fr-FR")}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-3">
            {/* Ligne 1 : noms de colonnes (triables) */}
            <tr className="border-b border-border">
              <SortableTh sortKey="customer_name"        sort={sort} onToggle={toggle} label="Client"                       className="py-2 px-2" />
              <SortableTh sortKey="city"                 sort={sort} onToggle={toggle} label="Ville"                        className="py-2 px-2" />
              <SortableTh sortKey="nb_invoices_overdue"  sort={sort} onToggle={toggle} align="right" label="Nb factures"    className="py-2 px-2" />
              <SortableTh sortKey="total_overdue_ht"     sort={sort} onToggle={toggle} align="right" label="Montant impayé" className="py-2 px-2" />
              <SortableTh sortKey="oldest_overdue_date"  sort={sort} onToggle={toggle} label="Facture la plus ancienne"     className="py-2 px-2" />
            </tr>
            {/* Ligne 2 : filtres uniformes */}
            <tr className="border-b border-border">
              <FilterTh>
                <input type="text" placeholder="Recherche…" value={filters.name}
                  onChange={e => updateFilter("name", e.target.value)} className={FILTER_CLASS} />
              </FilterTh>
              <FilterTh>
                <input type="text" placeholder="Ville…" value={filters.city}
                  onChange={e => updateFilter("city", e.target.value)} className={FILTER_CLASS} />
              </FilterTh>
              <FilterTh align="right">
                <input type="number" inputMode="numeric" placeholder="≥" value={filters.nbInvoicesMin}
                  onChange={e => updateFilter("nbInvoicesMin", e.target.value)} className={`${FILTER_CLASS} text-right`} />
              </FilterTh>
              <FilterTh align="right">
                <input type="number" inputMode="numeric" placeholder="≥ € HT" value={filters.amountMin}
                  onChange={e => updateFilter("amountMin", e.target.value)} className={`${FILTER_CLASS} text-right`} />
              </FilterTh>
              <FilterTh>
                <input type="date" title="Facture la plus ancienne depuis…" value={filters.oldestFrom}
                  onChange={e => updateFilter("oldestFrom", e.target.value)} className={FILTER_CLASS} />
              </FilterTh>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-fg-subtle">
                  Aucun client ne correspond aux filtres.
                </td>
              </tr>
            ) : (
              sorted.map(c => (
                <tr
                  key={c.customer_key}
                  className="border-b border-border hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/client/${encodeURIComponent(c.customer_id)}`)}
                >
                  <td className="py-2 px-2 font-medium text-blue-700 dark:text-blue-300 hover:underline">{c.customer_name}</td>
                  <td className="py-2 px-2 text-fg-muted">{c.city ?? "—"}</td>
                  <td className="py-2 px-2 text-right text-fg-muted">{c.nb_invoices_overdue ?? "—"}</td>
                  <td className="py-2 px-2 text-right font-semibold text-red-700 dark:text-red-300">{fmtEuros(c.total_overdue_ht)}</td>
                  <td className="py-2 px-2 text-fg-muted">{fmtDate(c.oldest_overdue_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
