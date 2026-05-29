"use client";
import { useRouter } from "next/navigation";
import { DailyFeed, fmtEuros } from "@/lib/api";

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

interface Props {
  data: DailyFeed | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function DailyFeedSection({ data, loading, error, onRetry }: Props) {
  const router = useRouter();

  if (loading) return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
      <div className="h-5 bg-surface-3 rounded w-48 animate-pulse" />
      <div className="grid grid-cols-3 gap-3">
        {[0,1,2].map(i => <div key={i} className="h-20 bg-surface-3 rounded-lg animate-pulse" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-center justify-between">
      <p className="text-sm text-red-600 dark:text-red-400">Impossible de charger le fil d'actualité.</p>
      <button onClick={onRetry} className="text-sm text-red-600 dark:text-red-400 underline ml-4">Réessayer</button>
    </div>
  );

  if (!data) return null;

  const { reference_date, totals, recent_orders, new_clients, stockouts } = data;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-amber-900">Résumé du jour</h2>
          {reference_date && (
            <p className="text-xs text-amber-700 dark:text-amber-300 capitalize">{fmtDay(reference_date)}</p>
          )}
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-xl font-bold text-amber-900">{totals.nb_orders}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">commande{totals.nb_orders > 1 ? "s" : ""}</p>
          </div>
          <div>
            <p className="text-xl font-bold text-amber-900">{fmtEuros(totals.ca_ht)}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">CA HT</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">

        {/* Commandes du jour */}
        <div className="bg-surface-2 rounded-lg border border-amber-100 p-3">
          <p className="text-xs font-semibold text-fg-muted mb-2">🛒 Clients ayant commandé</p>
          {recent_orders.length === 0 ? (
            <p className="text-xs text-fg-subtle">Aucune commande ce jour.</p>
          ) : (
            <ul className="space-y-1.5">
              {recent_orders.slice(0, 6).map((o, i) => (
                <li key={i} className="flex items-center justify-between">
                  <button
                    onClick={() => router.push(`/client/${encodeURIComponent(o.customer_id)}`)}
                    className="text-xs text-blue-700 dark:text-blue-300 hover:underline truncate max-w-32 text-left"
                  >
                    {o.customer_name}
                  </button>
                  <span className="text-xs font-medium text-fg ml-2 shrink-0">{fmtEuros(o.amount_ht)}</span>
                </li>
              ))}
              {recent_orders.length > 6 && (
                <li className="text-xs text-fg-subtle">+{recent_orders.length - 6} autres…</li>
              )}
            </ul>
          )}
        </div>

        {/* Nouveaux clients */}
        <div className="bg-surface-2 rounded-lg border border-amber-100 p-3">
          <p className="text-xs font-semibold text-fg-muted mb-2">🆕 Nouveaux clients (30 j)</p>
          {new_clients.length === 0 ? (
            <p className="text-xs text-fg-subtle">Aucun nouveau client récemment.</p>
          ) : (
            <ul className="space-y-1.5">
              {new_clients.slice(0, 6).map((c, i) => (
                <li key={i} className="flex items-center justify-between">
                  <button
                    onClick={() => router.push(`/client/${encodeURIComponent(c.customer_id)}`)}
                    className="text-xs text-blue-700 dark:text-blue-300 hover:underline truncate max-w-32 text-left"
                  >
                    {c.customer_name}
                  </button>
                  <span className="text-xs text-fg-muted ml-2 shrink-0">{fmtShort(c.first_order_date)}</span>
                </li>
              ))}
              {new_clients.length > 6 && (
                <li className="text-xs text-fg-subtle">+{new_clients.length - 6} autres…</li>
              )}
            </ul>
          )}
        </div>

        {/* Ruptures */}
        <div className="bg-surface-2 rounded-lg border border-red-100 p-3">
          <p className="text-xs font-semibold text-fg-muted mb-2">
            🔴 Ruptures actives
            {stockouts.length > 0 && <span className="ml-1 bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded px-1">{stockouts.length}</span>}
          </p>
          {stockouts.length === 0 ? (
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Aucune rupture active</p>
          ) : (
            <ul className="space-y-1.5">
              {stockouts.slice(0, 6).map((s, i) => (
                <li key={i} className="text-xs text-red-700 dark:text-red-300 truncate">
                  <span className="font-medium">{s.item_caption}</span>
                  {s.storehouse_name && <span className="text-red-400 ml-1">— {s.storehouse_name}</span>}
                </li>
              ))}
              {stockouts.length > 6 && (
                <li className="text-xs text-fg-subtle">+{stockouts.length - 6} autres…</li>
              )}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
