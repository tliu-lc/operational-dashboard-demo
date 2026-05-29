"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useBoutique } from "@/context/BoutiqueContext";
import { fetchGeoFrance, fetchGeoIntl, fetchGeoDept, fetchGeoCountry, fetchAllCountries, GeoDept, GeoIntl, fmtEuros, apiFetch } from "@/lib/api";
import SkeletonTable from "@/components/SkeletonTable";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import Pagination from "@/components/Pagination";
import InfoTooltip from "@/components/InfoTooltip";
import DateRangePicker, { type DateRange, type Preset } from "@/components/DateRangePicker";
import GeoMap from "@/components/GeoMap";

const PRESETS: Preset[] = [
  { value: 1,  label: "1 mois" },
  { value: 2,  label: "2 mois" },
  { value: 3,  label: "3 mois" },
  { value: 6,  label: "6 mois" },
  { value: 12, label: "12 mois" },
  { value: 24, label: "2 ans" },
  { value: 36, label: "3 ans" },
  { value: 0,  label: "Tout" },
];

// Layouts et config Plotly extraits hors du composant pour éviter les
// re-créations à chaque render (qui corrompent l'état interne de Plotly)
const FRANCE_LAYOUT = {
  geo: {
    visible: false,
    bgcolor: "#fff",
    projection: { type: "mercator" as const },
    lonaxis: { range: [-5.5, 10] },
    lataxis: { range: [41, 51.5] },
  },
  margin: { r: 0, t: 0, l: 0, b: 0 },
  height: 600,
  paper_bgcolor: "#fff",
};

const INTL_LAYOUT = {
  geo: {
    showframe: false,
    showcoastlines: true,
    coastlinecolor: "#D1D5DB",
    showland: true,
    landcolor: "#F9FAFB",
    showocean: true,
    oceancolor: "#EFF6FF",
    bgcolor: "#fff",
    projection: { type: "natural earth" as const },
  },
  margin: { r: 0, t: 0, l: 0, b: 0 },
  height: 420,
  paper_bgcolor: "#fff",
};

const PLOT_CONFIG = {
  displayModeBar: false,
  responsive: true,
  scrollZoom: true,            // zoom à la molette/pinch
  doubleClick: "reset" as const,
};

function rangeLabel(range: DateRange): string {
  if (range.mode === "preset") {
    return PRESETS.find(p => p.value === range.preset)?.label ?? `${range.preset} mois`;
  }
  const [yF, mF, dF] = range.from.split("-");
  const [yT, mT, dT] = range.to.split("-");
  return `${dF}/${mF}/${yF.slice(2)} → ${dT}/${mT}/${yT.slice(2)}`;
}

export default function GeoPage() {
  const { boutique, boutiqueLoaded } = useBoutique();
  const router = useRouter();
  const [tab, setTab] = useState<"france" | "international">("france");
  const [range, setRange] = useState<DateRange>({ mode: "preset", preset: 12 });
  const [franceDepts, setFranceDepts] = useState<GeoDept[]>([]);
  const [intlData, setIntlData] = useState<GeoIntl[]>([]);
  const [geojson, setGeojson] = useState<object | null>(null);
  const [allCountries, setAllCountries] = useState<{ iso2: string; iso3: string; name: string }[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [deptCustomers, setDeptCustomers] = useState<{ customer_id: string; customer_name: string; city: string | null; ca_total_ht: number | null; ca_12m_ht: number | null }[]>([]);
  const [countryCustomers, setCountryCustomers] = useState<{ customer_id: string; customer_name: string; city: string | null; ca_total_ht: number | null; ca_12m_ht: number | null; churn_color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // pagination France depts
  const [francePage, setFrancePage] = useState(1);
  const FRANCE_PAGE_SIZE = 20;

  // pagination International
  const [intlPage, setIntlPage] = useState(1);
  const INTL_PAGE_SIZE = 20;

  const rangeQuery = useMemo(
    () => range.mode === "preset"
      ? { period: range.preset }
      : { from: range.from, to: range.to },
    [range],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchGeoFrance(boutique, rangeQuery),
      fetchGeoIntl(boutique, rangeQuery),
      apiFetch<object>("/api/geo/geojson"),
    ])
      .then(([france, intl, gj]) => {
        setFranceDepts(france.by_dept);
        setIntlData(intl);
        setGeojson(gj);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [boutique, rangeQuery]);

  useEffect(() => {
    if (!boutiqueLoaded) return;
    load();
    setSelectedDept(null);
    setSelectedCountry(null);
    setFrancePage(1);
    setIntlPage(1);
  }, [boutique, boutiqueLoaded, rangeQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedDept) { setDeptCustomers([]); return; }
    fetchGeoDept(selectedDept, boutique, rangeQuery).then(setDeptCustomers).catch(() => setDeptCustomers([]));
  }, [selectedDept, boutique, rangeQuery]);

  useEffect(() => {
    if (!selectedCountry) { setCountryCustomers([]); return; }
    fetchGeoCountry(selectedCountry, boutique, rangeQuery).then(setCountryCustomers).catch(() => setCountryCustomers([]));
  }, [selectedCountry, boutique, rangeQuery]);

  // Charge une seule fois la liste de tous les pays (pour le hover sur ceux sans clients)
  useEffect(() => {
    fetchAllCountries().then(setAllCountries).catch(() => setAllCountries([]));
  }, []);

  // Handlers click memoizés → références stables pour Plotly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFranceClick = useCallback((e: any) => {
    const pt = e?.points?.[0];
    if (!pt) return;
    const code = pt.customdata?.[0] ?? pt.location;
    if (code) setSelectedDept(String(code));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleIntlClick = useCallback((e: any) => {
    const pt = e?.points?.[0];
    if (!pt) return;
    const found = intlData.find(c => c.country_iso3 === String(pt.location));
    if (found) setSelectedCountry(prev => prev === found.country_iso_code ? null : found.country_iso_code);
  }, [intlData]);

  const periodLabel = rangeLabel(range);

  // Calculs memoizés → refs stables pour Plotly (évite re-init à chaque render)
  const totalCA      = useMemo(() => franceDepts.reduce((s, d) => s + (d.revenue_ht ?? 0), 0), [franceDepts]);
  const totalClients = useMemo(() => franceDepts.reduce((s, d) => s + d.active_customers, 0), [franceDepts]);
  const totalOrders  = useMemo(() => franceDepts.reduce((s, d) => s + d.order_count, 0), [franceDepts]);
  const avgBasket    = totalOrders > 0 ? totalCA / totalOrders : null;
  const maxCA        = useMemo(() => Math.max(...franceDepts.map(d => d.revenue_ht ?? 0), 1), [franceDepts]);

  const allDeptsMerged = useMemo(() => {
    if (!geojson) return [];
    const dataByCode = new Map(franceDepts.map(d => [d.dept_code, d]));
    const features = (geojson as { features: { properties: { code: string; nom: string } }[] }).features ?? [];
    return features.map(f => {
      const code = f.properties.code;
      const name = f.properties.nom;
      const data = dataByCode.get(code);
      return {
        code,
        name: data?.dept_name ?? name,
        revenue: data?.revenue_ht ?? null,
        active: data?.active_customers ?? 0,
        orders: data?.order_count ?? 0,
      };
    });
  }, [geojson, franceDepts]);

  const choroplethTrace = useMemo(() => {
    if (!geojson) return null;
    return {
      type: "choropleth" as const,
      geojson,
      locations: allDeptsMerged.map(d => d.code),
      featureidkey: "properties.code",
      z: allDeptsMerged.map(d => d.revenue ?? 0),
      colorscale: [
        [0,      "#FFFFFF"],
        [0.0001, "#DBEAFE"],
        [0.15,   "#93C5FD"],
        [0.45,   "#3B82F6"],
        [0.75,   "#2563EB"],
        [1,      "#1E3A8A"],
      ] as [number, string][],
      zmin: 0,
      zmax: maxCA,
      customdata: allDeptsMerged.map(d => [
        d.code,
        d.name,
        d.revenue,
        d.active,
        (d.revenue == null || d.revenue === 0) ? "Aucun client" : `${fmtEuros(d.revenue)} · ${d.active} client${d.active > 1 ? "s" : ""} actif${d.active > 1 ? "s" : ""}`,
      ]),
      hovertemplate: `<b>%{customdata[1]}</b> (%{customdata[0]})<br>%{customdata[4]}<extra></extra>`,
      marker: { line: { color: "#d4d4d8", width: 0.5 } },
      colorbar: { title: { text: "CA HT (€)" } },
    };
  }, [geojson, allDeptsMerged, maxCA]);

  const intlTotalCA      = useMemo(() => intlData.reduce((s, c) => s + (c.ca_ht ?? 0), 0), [intlData]);
  const intlActivePays   = useMemo(() => intlData.filter(c => (c.ca_ht ?? 0) > 0).length, [intlData]);
  const intlActiveClients = useMemo(() => intlData.reduce((s, c) => s + c.nb_customers_actifs, 0), [intlData]);

  const intlMerged = useMemo(() => {
    const dataByIso3 = new Map(intlData.map(c => [c.country_iso3, c]));
    const allList = allCountries.length > 0
      ? allCountries
      : intlData.map(c => ({ iso3: c.country_iso3, name: c.country_name }));
    return allList.map(c => {
      const data = dataByIso3.get(c.iso3);
      return {
        iso3:   c.iso3,
        name:   data?.country_name ?? c.name,
        ca:     data?.ca_ht ?? null,
        active: data?.nb_customers_actifs ?? 0,
      };
    });
  }, [intlData, allCountries]);

  const intlChoroplethTrace = useMemo(() => {
    if (intlMerged.length === 0) return null;
    return {
      type: "choropleth" as const,
      locationmode: "ISO-3" as const,
      locations: intlMerged.map(c => c.iso3),
      z: intlMerged.map(c => c.ca ?? 0),
      colorscale: [
        [0,      "#FFFFFF"],
        [0.0001, "#FEF3C7"],
        [0.25,   "#FCD34D"],
        [0.55,   "#F59E0B"],
        [0.80,   "#D97706"],
        [1,      "#92400E"],
      ] as [number, string][],
      zmin: 0,
      customdata: intlMerged.map(c => [
        c.name,
        (c.ca == null || c.ca === 0)
          ? "Aucun client"
          : `${c.active} client${c.active > 1 ? "s" : ""} actif${c.active > 1 ? "s" : ""} · ${fmtEuros(c.ca)}`,
      ]),
      hovertemplate: `<b>%{customdata[0]}</b><br>%{customdata[1]}<extra></extra>`,
      marker: { line: { color: "#d4d4d8", width: 0.5 } },
      colorbar: { title: { text: "CA HT (€)" } },
    };
  }, [intlMerged]);

  if (loading) return (
    <>
      <h1 className="text-2xl font-bold mb-4 flex items-center">Analyse géographique</h1>
      <div className="bg-surface-3 rounded h-96 animate-pulse" />
    </>
  );
  if (error) return (
    <>
      <h1 className="text-2xl font-bold mb-4 flex items-center">Analyse géographique</h1>
      <ErrorState message={error} onRetry={load} />
    </>
  );

  // Pagination France depts
  const francePaginated = franceDepts.slice((francePage - 1) * FRANCE_PAGE_SIZE, francePage * FRANCE_PAGE_SIZE);

  // Pagination International
  const intlPaginated = intlData.slice((intlPage - 1) * INTL_PAGE_SIZE, intlPage * INTL_PAGE_SIZE);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 flex items-center">
        Analyse géographique
        <InfoTooltip
          text="Répartition du chiffre d'affaires par département (France métropolitaine) et par pays (clients internationaux)."
          position="right"
        />
      </h1>

      {/* Sélecteur de période avec plage personnalisée */}
      <div className="mb-4">
        <DateRangePicker presets={PRESETS} value={range} onChange={setRange} />
      </div>

      {/* Onglets France / International */}
      <div className="flex gap-2 mb-4">
        {(["france", "international"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium ${tab === t ? "bg-blue-600 text-white" : "bg-surface-3 text-fg hover:bg-surface-3"}`}>
            {t === "france" ? "🇫🇷 France" : "🌍 International"}
          </button>
        ))}
      </div>

      {tab === "france" && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-surface-3 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-fg-muted">CA France HT — {periodLabel}</p>
              <p className="text-lg font-semibold">{fmtEuros(totalCA)}</p>
            </div>
            <div className="bg-surface-3 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-fg-muted">Clients actifs</p>
              <p className="text-lg font-semibold">{totalClients.toLocaleString("fr-FR")}</p>
            </div>
            <div className="bg-surface-3 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-fg-muted">Panier moyen</p>
              <p className="text-lg font-semibold">{fmtEuros(avgBasket)}</p>
            </div>
          </div>

          {franceDepts.length === 0 ? (
            <EmptyState message="Aucune donnée géographique disponible pour cette boutique." />
          ) : choroplethTrace ? (
            <div className="relative">
              <InfoTooltip
                text="Intensité de couleur proportionnelle au CA HT — plus la teinte est foncée, plus le CA est élevé dans ce département."
                position="bottom"
                className="absolute top-2 right-2 z-10"
              />
              <GeoMap
                trace={choroplethTrace}
                layout={FRANCE_LAYOUT}
                config={PLOT_CONFIG}
                onClick={handleFranceClick}
              />
            </div>
          ) : (
            <div className="bg-surface-3 rounded h-96 animate-pulse" />
          )}

          {selectedDept && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-200">Département {selectedDept}</h3>
                <button onClick={() => setSelectedDept(null)} className="text-sm text-blue-600 dark:text-blue-400 underline">Fermer ×</button>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 italic mb-3 flex items-center">
                Top 20 clients · cliquez sur un client pour voir sa fiche
                <InfoTooltip
                  text="Les 20 clients réalisant le plus fort CA HT dans le département sélectionné."
                  position="right"
                />
              </p>
              {deptCustomers.length === 0 ? (
                <p className="text-sm text-fg-muted">Aucun client pour ce département.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-fg-muted">
                      <th className="pb-1 text-left font-medium">Client</th>
                      <th className="pb-1 text-left font-medium">Ville</th>
                      <th className="pb-1 text-right font-medium">CA Total</th>
                      <th className="pb-1 text-right font-medium">CA 12M</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptCustomers.slice(0, 20).map((c, idx) => (
                      c.customer_id ? (
                        <tr
                          key={`${c.customer_id}-${idx}`}
                          className="border-b border-border cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors"
                          tabIndex={0}
                          onClick={() => router.push(`/client/${encodeURIComponent(c.customer_id)}`)}
                          onKeyDown={e => e.key === "Enter" && router.push(`/client/${encodeURIComponent(c.customer_id)}`)}
                        >
                          <td className="py-1 pr-4 text-blue-700 dark:text-blue-300 font-medium hover:underline">{c.customer_name}</td>
                          <td className="py-1 pr-4 text-fg-muted">{c.city ?? "—"}</td>
                          <td className="py-1 pr-4 text-right text-fg">{fmtEuros(c.ca_total_ht)}</td>
                          <td className="py-1 text-right text-fg">{fmtEuros(c.ca_12m_ht)}</td>
                        </tr>
                      ) : (
                        <tr key={`no-id-${c.customer_name}`} className="border-b border-border cursor-default">
                          <td className="py-1 pr-4 text-fg-subtle">{c.customer_name}</td>
                          <td className="py-1 pr-4 text-fg-muted">{c.city ?? "—"}</td>
                          <td className="py-1 pr-4 text-right text-fg">{fmtEuros(c.ca_total_ht)}</td>
                          <td className="py-1 text-right text-fg">{fmtEuros(c.ca_12m_ht)}</td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {franceDepts.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Classement départements</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-fg-muted text-left">
                      <th className="pb-1 font-medium pr-4">Département</th>
                      <th className="pb-1 font-medium text-right pr-4">CA HT — {periodLabel}</th>
                      <th className="pb-1 font-medium text-right pr-4">Clients actifs</th>
                      <th className="pb-1 font-medium text-right">Panier moyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {francePaginated.map(d => (
                      <tr
                        key={d.dept_code}
                        className={`border-b border-border cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 ${selectedDept === d.dept_code ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                        onClick={() => setSelectedDept(d.dept_code === selectedDept ? null : d.dept_code)}
                      >
                        <td className="py-1.5 pr-4 text-fg">{d.dept_name} ({d.dept_code})</td>
                        <td className="py-1.5 pr-4 text-right text-fg">{fmtEuros(d.revenue_ht)}</td>
                        <td className="py-1.5 pr-4 text-right text-fg-muted">{d.active_customers}</td>
                        <td className="py-1.5 text-right text-fg-muted">{fmtEuros(d.avg_basket_ht)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                total={franceDepts.length}
                page={francePage}
                pageSize={FRANCE_PAGE_SIZE}
                onPageChange={setFrancePage}
                itemLabel="départements"
              />
            </div>
          )}
        </>
      )}

      {tab === "international" && (
        <>
          {intlData.length === 0 ? (
            <EmptyState message="Aucun client international pour cette boutique." />
          ) : (
            <>
              {/* KPIs résumé */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-surface-3 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-fg-muted">CA International HT — {periodLabel}</p>
                  <p className="text-lg font-semibold">{fmtEuros(intlTotalCA)}</p>
                </div>
                <div className="bg-surface-3 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-fg-muted">Pays actifs</p>
                  <p className="text-lg font-semibold">{intlActivePays}</p>
                </div>
                <div className="bg-surface-3 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-fg-muted">Clients actifs — {periodLabel}</p>
                  <p className="text-lg font-semibold">{intlActiveClients.toLocaleString("fr-FR")}</p>
                </div>
              </div>

              {/* Carte internationale */}
              {intlChoroplethTrace ? (
                <div className="relative mb-4">
                  <InfoTooltip
                    text="Répartition mondiale des clients hors France. Intensité de couleur proportionnelle au CA HT par pays."
                    position="bottom"
                    className="absolute top-2 right-2 z-10"
                  />
                  <GeoMap
                    trace={intlChoroplethTrace}
                    layout={INTL_LAYOUT}
                    config={PLOT_CONFIG}
                    onClick={handleIntlClick}
                  />
                </div>
              ) : (
                <div className="bg-surface-3 rounded h-96 animate-pulse mb-4" />
              )}

              {selectedCountry && (() => {
                const country = intlData.find(x => x.country_iso_code === selectedCountry);
                if (!country) return null;
                return (
                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-amber-900 dark:text-amber-200">{country.country_name}</h3>
                      <button onClick={() => setSelectedCountry(null)} className="text-sm text-amber-600 dark:text-amber-400 underline">Fermer ×</button>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 italic mb-3 flex items-center">
                      Top 20 clients · cliquez sur un client pour voir sa fiche
                      <InfoTooltip text="Les 20 clients réalisant le plus fort CA HT dans ce pays." position="right" />
                    </p>
                    {countryCustomers.length === 0 ? (
                      <p className="text-sm text-fg-muted">Aucun client pour ce pays.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-fg-muted">
                            <th className="pb-1 text-left font-medium">Client</th>
                            <th className="pb-1 text-left font-medium">Ville</th>
                            <th className="pb-1 text-right font-medium">CA Total</th>
                            <th className="pb-1 text-right font-medium">CA 12M</th>
                          </tr>
                        </thead>
                        <tbody>
                          {countryCustomers.map((c, idx) => (
                            <tr
                              key={`${c.customer_id}-${idx}`}
                              className="border-b border-border cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors"
                              onClick={() => router.push(`/client/${encodeURIComponent(c.customer_id)}`)}
                            >
                              <td className="py-1 pr-4 text-blue-700 dark:text-blue-300 font-medium hover:underline">{c.customer_name}</td>
                              <td className="py-1 pr-4 text-fg-muted">{c.city ?? "—"}</td>
                              <td className="py-1 pr-4 text-right text-fg">{fmtEuros(c.ca_total_ht)}</td>
                              <td className="py-1 text-right text-fg">{fmtEuros(c.ca_12m_ht)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })()}

              {/* Tableau de détail */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-fg-muted text-left">
                      <th className="py-2 pr-4 font-medium">Pays</th>
                      <th className="py-2 pr-4 font-medium text-right">Clients totaux</th>
                      <th className="py-2 pr-4 font-medium text-right">Clients actifs — {periodLabel}</th>
                      <th className="py-2 pr-4 font-medium text-right">CA HT — {periodLabel}</th>
                      <th className="py-2 font-medium text-right">Commandes — {periodLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intlPaginated.map(c => (
                      <tr key={c.country_iso_code} className={`border-b border-border cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30 ${selectedCountry === c.country_iso_code ? "bg-amber-50 dark:bg-amber-950/30" : ""}`} onClick={() => setSelectedCountry(prev => prev === c.country_iso_code ? null : c.country_iso_code)}>
                        <td className="py-1.5 pr-4 text-fg">{c.country_name}</td>
                        <td className="py-1.5 pr-4 text-right text-fg-muted">{c.nb_customers_total}</td>
                        <td className="py-1.5 pr-4 text-right text-fg-muted">{c.nb_customers_actifs}</td>
                        <td className="py-1.5 pr-4 text-right text-fg">{fmtEuros(c.ca_ht)}</td>
                        <td className="py-1.5 text-right text-fg-muted">{c.nb_orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                total={intlData.length}
                page={intlPage}
                pageSize={INTL_PAGE_SIZE}
                onPageChange={setIntlPage}
                itemLabel="pays"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
