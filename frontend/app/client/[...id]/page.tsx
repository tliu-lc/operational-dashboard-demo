"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useBoutique, BOUTIQUE_LABELS } from "@/context/BoutiqueContext";
import { fetchClientDetail, ClientDetailResponse, fmtDate, fmtEuros, fmtMonthLabel } from "@/lib/api";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorState from "@/components/ErrorState";
import InfoTooltip from "@/components/InfoTooltip";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useChartColors } from "@/lib/useChartColors";

const CHURN_STYLES: Record<string, { label: string; classes: string }> = {
  vert:   { label: "● Fidèle",     classes: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" },
  orange: { label: "● À risque",   classes: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"         },
  rouge:  { label: "● En fuite",   classes: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300"                 },
  gris:   { label: "● Sans achat", classes: "bg-surface-3 text-fg-subtle"                                                   },
};

const CHURN_TOOLTIPS: Record<string, string> = {
  vert:   "Client actif et régulier — aucun signal de risque détecté.",
  orange: "Signaux faibles de churn détectés — fréquence ou CA en baisse.",
  rouge:  "Inactivité prolongée ou forte chute du CA — risque élevé de perte.",
};

function KpiCard({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="bg-surface-3 border border-border rounded-lg p-4 text-center">
      <p className="text-xs text-fg-muted mb-1 flex items-center justify-center gap-1">
        {label}
        {tooltip && <InfoTooltip text={tooltip} position="bottom" />}
      </p>
      <p className="text-xl font-semibold text-fg">{value}</p>
    </div>
  );
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-fg-subtle text-lg font-semibold">Données insuffisantes</span>;
  if (pct > 5) return <span className="text-green-600 dark:text-green-400 text-lg font-semibold">↗ +{pct.toFixed(1)} %</span>;
  if (pct < -5) return <span className="text-red-600 dark:text-red-400 text-lg font-semibold">↘ {pct.toFixed(1)} %</span>;
  return <span className="text-fg-muted text-lg font-semibold">→ {pct.toFixed(1)} %</span>;
}

export default function ClientDetailPage() {
  const { boutique, boutiqueLoaded } = useBoutique();
  const chartColors = useChartColors();
  const router = useRouter();
  const params = useParams();
  const id = decodeURIComponent(Array.isArray(params.id) ? (params.id as string[]).join("/") : (params.id as string));

  const [data, setData] = useState<ClientDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchClientDetail(id, boutique)
      .then(setData)
      .catch(e => {
        if (e.message.includes("404")) setError("404");
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!boutiqueLoaded) return;
    load();
  }, [id, boutique, boutiqueLoaded]);

  if (loading) return <LoadingOverlay />;
  if (error === "404") return (
    <div className="text-center py-16">
      <p className="text-xl font-semibold text-fg mb-4">Client introuvable.</p>
      <button onClick={() => router.push("/client")} className="text-blue-600 dark:text-blue-400 underline">← Retour à la liste</button>
    </div>
  );
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { detail, monthly_ca, full_history, top5, last_orders } = data;
  const churnStyle = CHURN_STYLES[detail.churn_color] ?? CHURN_STYLES.vert;
  const boutiqueName = BOUTIQUE_LABELS[boutique] ?? boutique;

  const chartData = monthly_ca.map(m => ({ name: fmtMonthLabel(m.month), ca: m.ca_ht }));
  const historyData = full_history.map(m => ({ name: fmtMonthLabel(m.month), ca: m.ca_ht }));

  // Construction de l'adresse postale formatée
  const addressLines: string[] = [];
  if (detail.address1) addressLines.push(detail.address1);
  if (detail.address2) addressLines.push(detail.address2);
  const cityLine = [detail.zip_code, detail.city].filter(Boolean).join(" ");
  if (cityLine) addressLines.push(cityLine);
  const countryLabel = detail.is_france ? "France" : (detail.country_iso_code ?? "—");
  addressLines.push(countryLabel);

  // Lien Google Maps si on a une adresse minimale
  const mapsQuery = [detail.address1, detail.zip_code, detail.city, countryLabel]
    .filter(Boolean).join(", ");
  const mapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null;

  return (
    <div>
      <button onClick={() => router.push("/client")} className="text-blue-600 dark:text-blue-400 text-sm underline mb-4 block">
        ← Nouvelle recherche
      </button>

      {/* Header — identité + adresse + contact */}
      <div className="bg-surface-2 border border-border rounded-lg p-5 mb-5">
        {/* Ligne 1 : nom + badges (présence HIPP + churn) */}
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-fg">{detail.customer_name}</h1>
            {detail.presence === "both" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                🔗 Multi-boutiques
              </span>
            )}
            {detail.presence === "sed_only" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Lyon Presqu'île uniquement
              </span>
            )}
            {detail.presence === "hip_only" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> Paris Marais uniquement
              </span>
            )}
          </div>
          <span className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-semibold ${churnStyle.classes}`}>
            {churnStyle.label}
            <InfoTooltip
              text={CHURN_TOOLTIPS[detail.churn_color] ?? ""}
              position="left"
              className="ml-0"
            />
          </span>
        </div>

        {/* Ligne 2 : grille 3 colonnes (Adresse / Contact / Identifiants) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">

          {/* Adresse postale */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-1.5">Adresse</p>
            {addressLines.length > 1 ? (
              <div className="text-fg leading-tight space-y-0.5">
                {addressLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                {detail.dept_code && detail.is_france && (
                  <p className="text-xs text-fg-muted mt-1">Département : {detail.dept_code}</p>
                )}
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1.5">
                    🗺️ Voir sur Google Maps
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-fg-subtle italic">Adresse non renseignée</p>
            )}
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-1.5">Contact</p>
            <div className="space-y-1">
              {detail.phone ? (
                <a href={`tel:${detail.phone}`} className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline">
                  📞 {detail.phone}
                </a>
              ) : <p className="text-xs text-fg-subtle italic">Pas de téléphone</p>}
              {detail.email ? (
                <a href={`mailto:${detail.email}`} className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline break-all">
                  ✉️ {detail.email}
                </a>
              ) : <p className="text-xs text-fg-subtle italic">Pas d&apos;email</p>}
            </div>
          </div>

          {/* Identifiants */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-1.5">Identifiants</p>
            <div className="space-y-1 text-fg-muted">
              <p><span className="text-fg-subtle">Boutique :</span> <span className="text-fg">{boutiqueName}</span></p>
              {detail.siren && (
                <p><span className="text-fg-subtle">SIREN :</span> <span className="font-mono text-xs text-fg">{detail.siren}</span></p>
              )}
              {detail.vat_number && (
                <p><span className="text-fg-subtle">N° TVA :</span> <span className="font-mono text-xs text-fg">{detail.vat_number}</span></p>
              )}
              {detail.naf_code && (
                <p><span className="text-fg-subtle">Code NAF :</span> <span className="font-mono text-xs text-fg">{detail.naf_code}</span></p>
              )}
              {detail.country_iso_code && !detail.is_france && (
                <p><span className="text-fg-subtle">Code pays :</span> <span className="font-mono text-xs text-fg">{detail.country_iso_code}</span></p>
              )}
            </div>
          </div>
        </div>

        {/* Adresses par boutique source (uniquement pour les clients présents dans plusieurs boutiques) */}
        {detail.boutique_sources && detail.boutique_sources.length > 1 && (
          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-3">
              Détail par boutique
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {detail.boutique_sources.map(src => {
                const bLabel = src.boutique_id === "SED" ? "Lyon Presqu'île" : src.boutique_id === "HIP" ? "Paris Marais" : src.boutique_id === "HPC" ? "Marseille Prado" : src.boutique_id === "ACC" ? "Nantes Commerce" : src.boutique_id;
                const bColor = src.boutique_id === "SED"
                  ? "bg-violet-100 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300"
                  : "bg-cyan-100 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300";
                const lines = [src.address1, src.address2, [src.zip_code, src.city].filter(Boolean).join(" ")].filter(Boolean);
                return (
                  <div key={src.boutique_id} className="bg-surface-3 border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${bColor}`}>{bLabel}</span>
                      <span className="text-xs text-fg-muted">{fmtEuros(src.ca_total_ht)} CA total</span>
                    </div>
                    <p className="font-medium text-fg mb-1">{src.customer_name}</p>
                    {lines.length > 0 ? (
                      <div className="text-xs text-fg-muted leading-tight">
                        {lines.map((l, i) => <p key={i}>{l}</p>)}
                      </div>
                    ) : (
                      <p className="text-xs text-fg-subtle italic">Adresse non renseignée</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs">
                      {src.phone && (
                        <a href={`tel:${src.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">📞 {src.phone}</a>
                      )}
                      {src.email && (
                        <a href={`mailto:${src.email}`} className="text-blue-600 dark:text-blue-400 hover:underline break-all">✉️ {src.email}</a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* KPIs row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard label="CA Total HT" value={fmtEuros(detail.ca_total_ht)} tooltip="Chiffre d'Affaires Hors Taxe — montant total des ventes hors TVA sur toute la période." />
        <KpiCard label="CA 12 mois HT" value={fmtEuros(detail.ca_12m_ht)} tooltip="Chiffre d'Affaires cumulé sur les 12 derniers mois glissants." />
        <KpiCard label="Nb commandes" value={String(detail.nb_orders_total ?? "—")} />
        <KpiCard label="Panier moyen HT" value={fmtEuros(detail.avg_basket_ht)} tooltip="Montant moyen par commande sur les 12 derniers mois." />
      </div>

      {/* KPIs row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Dernière commande" value={fmtDate(detail.last_order_date)} />
        <KpiCard label="Jours sans commande" value={detail.recency_days != null ? `${detail.recency_days} jours` : "—"} tooltip="Nombre de jours écoulés depuis la dernière commande enregistrée." />
        <div className="bg-surface-3 border border-border rounded-lg p-4 text-center">
          <p className="text-xs text-fg-muted mb-1 flex items-center justify-center gap-1">
            Tendance CA 6 mois
            <InfoTooltip text="Variation du CA entre les 6 derniers mois et les 6 mois précédents (en %). Une valeur positive indique une croissance." position="bottom" />
          </p>
          <TrendBadge pct={detail.ca_trend_6m_pct} />
        </div>
      </div>

      {/* Factures impayées */}
      {detail.overdue_invoices && detail.overdue_invoices.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">
            Factures impayées
            <span className="ml-2 text-sm font-normal text-red-600 dark:text-red-400">
              {detail.nb_invoices_overdue} facture{detail.nb_invoices_overdue !== 1 ? "s" : ""} · {fmtEuros(detail.total_overdue_ht ?? 0)} restant
            </span>
          </h2>
          <div className="bg-surface-2 rounded-xl border border-border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-3 border-b border-border">
                <tr>
                  <th className="text-left py-2 px-4 font-medium text-fg-muted">N° Facture</th>
                  <th className="text-left py-2 px-4 font-medium text-fg-muted">Date</th>
                  <th className="text-right py-2 px-4 font-medium text-fg-muted">Montant TTC</th>
                  <th className="text-right py-2 px-4 font-medium text-fg-muted">Déjà réglé</th>
                  <th className="text-right py-2 px-4 font-medium text-fg-muted">Reste dû</th>
                  <th className="text-center py-2 px-4 font-medium text-fg-muted">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.overdue_invoices.map((inv) => (
                  <tr key={inv.document_number} className="hover:bg-surface-3">
                    <td className="py-2 px-4 font-mono text-fg">{inv.document_number}</td>
                    <td className="py-2 px-4 text-fg-muted">{fmtDate(inv.document_date)}</td>
                    <td className="py-2 px-4 text-right text-fg">{fmtEuros(inv.amount_ttc)}</td>
                    <td className="py-2 px-4 text-right text-emerald-700 dark:text-emerald-300">{fmtEuros(inv.amount_paid)}</td>
                    <td className="py-2 px-4 text-right font-semibold text-red-700 dark:text-red-300">{fmtEuros(inv.balance_due)}</td>
                    <td className="py-2 px-4 text-center">
                      {inv.partial ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950/40 text-amber-800">
                          Partiel
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950/40 text-red-800">
                          Impayée
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-3 border-t border-border font-semibold">
                <tr>
                  <td colSpan={4} className="py-2 px-4 text-right text-fg">Total restant dû</td>
                  <td className="py-2 px-4 text-right text-red-700 dark:text-red-300">{fmtEuros(detail.total_overdue_ht)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* CA mensuel 12 mois + Top 5 */}
      <div className="grid md:grid-cols-5 gap-6 mb-6">
        <div className="md:col-span-3">
          <h2 className="text-lg font-semibold mb-3">CA mensuel — 12 derniers mois</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-fg-muted">Aucune commande sur les 12 derniers mois.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtEuros(v)} />
                <Bar dataKey="ca" fill={chartColors.primary} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Top 5 références (12 mois)</h2>
          {top5.length === 0 ? (
            <p className="text-sm text-fg-muted">Aucun article trouvé sur 12 mois.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-fg-muted"><th className="pb-1 text-left font-medium">Référence</th><th className="pb-1 text-right font-medium">Qté</th></tr></thead>
              <tbody>
                {top5.map(item => (
                  <tr key={item.rank} className="border-b border-border">
                    <td className="py-1 pr-2">{item.item_caption ?? `(ID: ${item.item_id})`}</td>
                    <td className="py-1 text-right text-fg-muted">{item.total_qty_12m ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Timeline 10 dernières commandes */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">10 dernières commandes</h2>
        {last_orders.length === 0 ? (
          <p className="text-sm text-fg-muted">Aucune commande enregistrée.</p>
        ) : (
          <div className="relative">
            {/* Ligne verticale */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-surface-3" />
            <div className="space-y-3">
              {last_orders.map((o, i) => {
                const maxAmt = Math.max(...last_orders.map(x => x.amount_ht ?? 0), 1);
                const pct = Math.round(((o.amount_ht ?? 0) / maxAmt) * 100);
                return (
                  <div key={i} className="flex items-start gap-4 pl-8 relative">
                    {/* Dot */}
                    <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-surface-2 ${i === 0 ? "bg-blue-600" : "bg-border-strong"}`} />
                    <div className="flex-1 bg-surface-3 rounded-lg px-3 py-2 border border-border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-fg">{fmtDate(o.document_date)}</span>
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{fmtEuros(o.amount_ht)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-fg-muted shrink-0">{o.nb_refs ?? "—"} réf.{o.document_number ? ` · ${o.document_number}` : ""}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Historique complet */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Dépenses par mois — historique complet</h2>
        {historyData.length === 0 ? (
          <p className="text-sm text-fg-muted">Aucun historique disponible.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={historyData}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmtEuros(v)} />
              <Bar dataKey="ca" fill={chartColors.primary} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
