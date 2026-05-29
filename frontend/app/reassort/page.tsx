"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchRFM, RFMCustomer, fmtDate } from "@/lib/api";
import SkeletonTable from "@/components/SkeletonTable";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import StatusBadge from "@/components/StatusBadge";
import AlertBanner from "@/components/AlertBanner";
import Pagination from "@/components/Pagination";
import InfoTooltip from "@/components/InfoTooltip";

const STATUS_ORDER = { en_retard: 0, du_semaine: 1, a_venir: 2, insuffisant: 3 };
const PAGE_SIZE = 20;

function delayLabel(customer: RFMCustomer): string {
  const { reorder_status: s, days_overdue: d } = customer;
  if (d == null) return "Historique insuffisant";
  if (s === "en_retard") return `En retard de ${d} j`;
  if (s === "du_semaine") return d === 0 ? "À relancer aujourd'hui" : `En retard de ${d} j`;
  if (s === "a_venir") return `Dans ${Math.abs(d)} jours`;
  return "Historique insuffisant";
}

const clientId = (key: string) => key.split("|").slice(1).join("|");

export default function ReassortPage() {
  const { boutique } = useBoutique();
  const router = useRouter();
  const [data, setData] = useState<RFMCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(["en_retard", "du_semaine", "a_venir", "insuffisant"]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchRFM(boutique)
      .then((r) => setData(r.customers))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); setPage(1); }, [boutique]);
  useEffect(() => { setPage(1); }, [nameFilter, statusFilter]);

  if (loading) return <><h1 className="text-2xl font-bold mb-4">Réassort client</h1><SkeletonTable /></>;
  if (error) return <><h1 className="text-2xl font-bold mb-4">Réassort client</h1><ErrorState message={error} onRetry={load} /></>;

  let filtered = [...data]
    .filter(c => c.top5.length > 0)
    .sort((a, b) => (STATUS_ORDER[a.reorder_status] ?? 99) - (STATUS_ORDER[b.reorder_status] ?? 99));
  if (nameFilter) filtered = filtered.filter(c => c.customer_name.toLowerCase().includes(nameFilter.toLowerCase()));
  if (statusFilter.length < 4) filtered = filtered.filter(c => statusFilter.includes(c.reorder_status));

  const nRetard = filtered.filter(c => c.reorder_status === "en_retard").length;
  const nDu = filtered.filter(c => c.reorder_status === "du_semaine").length;
  const nVenir = filtered.filter(c => c.reorder_status === "a_venir").length;

  const ALL_STATUSES = ["en_retard", "du_semaine", "a_venir", "insuffisant"];
  const LABELS: Record<string, string> = { en_retard: "En retard", du_semaine: "Dû cette semaine", a_venir: "À venir", insuffisant: "Insuffisant" };

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleExpanded = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 flex items-center">
        Réassort client
        <InfoTooltip
          text="Identifie les clients à réapprovisionner selon leur historique d'achat. Les statuts sont calculés à partir de la récence et de la fréquence habituelle de commande."
          position="right"
        />
      </h1>
      <AlertBanner count={nRetard} label="clients en retard de réassort" />

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Recherche client…"
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          className="border border-border-strong rounded px-3 py-1.5 text-sm flex-1 min-w-48 bg-surface-2 text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map(s => (
            <label key={s} className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={statusFilter.includes(s)}
                onChange={() => setStatusFilter(prev =>
                  prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                )}
              />
              {LABELS[s]}
              {s === "en_retard" && (
                <InfoTooltip text="La date de réassort estimée est dépassée — ce client n'a pas repassé commande dans son délai habituel." position="bottom" />
              )}
              {s === "du_semaine" && (
                <InfoTooltip text="Ce client est attendu en commande cette semaine selon sa fréquence habituelle." position="bottom" />
              )}
              {s === "a_venir" && (
                <InfoTooltip text="Le prochain réassort estimé est dans plus d'une semaine — aucune action urgente." position="bottom" />
              )}
              {s === "insuffisant" && (
                <InfoTooltip text="Historique de commandes trop court pour calculer une fréquence fiable (moins de 2 commandes)." position="bottom" />
              )}
            </label>
          ))}
        </div>
        <button onClick={() => { setNameFilter(""); setStatusFilter(ALL_STATUSES); }} className="text-sm text-fg-muted underline">
          Réinitialiser
        </button>
      </div>

      <p className="text-sm text-fg-muted mb-2">
        🔴 <strong>{nRetard}</strong> en retard &nbsp;·&nbsp;
        🟡 <strong>{nDu}</strong> dus &nbsp;·&nbsp;
        🟢 <strong>{nVenir}</strong> à venir
      </p>

      {filtered.length === 0 ? (
        <EmptyState message="Aucun client ne correspond aux filtres sélectionnés." />
      ) : (
        <>
          <div className="space-y-2">
            {paginated.map(c => (
              <div key={c.customer_key} className="bg-surface-2 border border-border rounded-lg p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/client/${encodeURIComponent(clientId(c.customer_key))}`)}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-fg">{c.customer_name}</span>
                  <StatusBadge status={c.reorder_status} delayLabel={delayLabel(c)} />
                </div>
                <p className="text-sm text-fg-muted">
                  Dernière commande : {fmtDate(c.last_order_date)}
                </p>
                {c.median_frequency_days && (
                  <p className="text-sm text-fg-muted flex items-center">
                    Fréquence habituelle : toutes les {c.median_frequency_days} j
                    <InfoTooltip text="Délai médian entre deux commandes consécutives, calculé sur les 12 derniers mois." position="right" />
                  </p>
                )}
                {c.top5.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleExpanded(c.customer_key); }}
                      className="text-sm text-blue-600 dark:text-blue-400 underline"
                    >
                      Articles à relancer ({c.top5.length}) {expanded.has(c.customer_key) ? "▲" : "▼"}
                    </button>
                    {expanded.has(c.customer_key) && (
                      <ul className="mt-2 space-y-1">
                        {c.top5.map(item => (
                          <li key={item.rank} className="text-sm text-fg">
                            {item.rank}. {item.item_caption ?? `(Article supprimé — ID:${item.item_id})`}
                            {item.avg_qty_per_order != null && (
                              <span className="text-fg-subtle"> &nbsp;moy. {Math.round(item.avg_qty_per_order)} u.</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[20, 50, 100]}
            itemLabel="clients"
          />
        </>
      )}
    </div>
  );
}
