"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useBoutique } from "@/context/BoutiqueContext";
import {
  fetchAnalyseCaParJour,
  fetchAnalyseCaParMois,
  fetchAnalyseVentesParSemaine,
  fetchAnalyseTopClients,
} from "@/lib/api";
import type { CaParJourPoint, CaParMoisPoint, VentesSemainePoint, TopClient } from "@/lib/api";
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import ErrorState from "@/components/ErrorState";
import DateRangePicker, { type DateRange, type Preset } from "@/components/DateRangePicker";
import { useChartColors } from "@/lib/useChartColors";

const PRESETS_JOUR: Preset[] = [
  { value: 30,  label: "30j"    },
  { value: 60,  label: "60j"    },
  { value: 90,  label: "90j"    },
  { value: 180, label: "6 mois" },
  { value: 365, label: "1 an"   },
];

const PRESETS_MOIS: Preset[] = [
  { value: 180,  label: "6 mois"  },
  { value: 365,  label: "12 mois" },
  { value: 730,  label: "24 mois" },
  { value: 1095, label: "36 mois" },
  { value: 0,    label: "Tout"    },
];

const PRESETS_SEMAINE: Preset[] = [
  { value: 90,  label: "3 mois"  },
  { value: 180, label: "6 mois"  },
  { value: 365, label: "12 mois" },
  { value: 730, label: "24 mois" },
];

const DOW_LABELS_FULL  = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DOW_LABELS_SHORT = ["D", "L", "M", "M", "J", "V", "S"];

function fmtK(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M€`;
  if (val >= 1_000)     return `${(val / 1_000).toFixed(1)}k€`;
  return `${val.toFixed(0)}€`;
}

function fmtEur(val: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(val);
}

function fmtRangeLabel(range: DateRange, presets: Preset[]): string {
  if (range.mode === "preset") {
    return presets.find(p => p.value === range.preset)?.label ?? "";
  }
  const [yF, mF, dF] = range.from.split("-");
  const [yT, mT, dT] = range.to.split("-");
  return `${dF}/${mF}/${yF.slice(2)} → ${dT}/${mT}/${yT.slice(2)}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-3">{children}</h2>;
}

// Tooltip personnalisé pour le graph "CA par jour" — affiche le jour de la semaine
function DayTooltip({ active, payload, colors }: { active?: boolean; payload?: { payload: CaParJourPoint }[]; colors: ReturnType<typeof useChartColors> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const d = new Date(p.date);
  const dow = DOW_LABELS_FULL[d.getDay()];
  const [y, m, day] = p.date.split("-");
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ background: colors.tooltipBg, borderColor: colors.tooltipBorder, color: colors.tooltipText }}
    >
      <p style={{ fontWeight: 600 }}>{dow} {day}/{m}/{y}</p>
      <p style={{ opacity: 0.85 }}>CA HT : {fmtEur(p.ca)}</p>
      <p style={{ opacity: 0.85 }}>{p.nb_orders} commande{p.nb_orders > 1 ? "s" : ""}</p>
    </div>
  );
}

export default function AnalysePage() {
  const { boutique, boutiqueLoaded } = useBoutique();
  const colors = useChartColors();

  // 3 ranges indépendants : un par graphique avec date picker
  const [rangeJour,    setRangeJour]    = useState<DateRange>({ mode: "preset", preset: 90  });
  const [rangeMois,    setRangeMois]    = useState<DateRange>({ mode: "preset", preset: 730 });
  const [rangeSemaine, setRangeSemaine] = useState<DateRange>({ mode: "preset", preset: 365 });

  const [caJour,     setCaJour]     = useState<CaParJourPoint[]>([]);
  const [caMois,     setCaMois]     = useState<CaParMoisPoint[]>([]);
  const [semaine,    setSemaine]    = useState<VentesSemainePoint[]>([]);
  const [topClients, setTopClients] = useState<TopClient[]>([]);

  const [loadingJour,    setLoadingJour]    = useState(true);
  const [loadingMois,    setLoadingMois]    = useState(true);
  const [loadingSemaine, setLoadingSemaine] = useState(true);
  const [error,          setError]          = useState(false);

  // Query params dérivés des ranges
  const queryJour    = useMemo(() => rangeJour.mode === "preset"    ? { days: rangeJour.preset }    : { from: rangeJour.from,    to: rangeJour.to    }, [rangeJour]);
  const queryMois    = useMemo(() => rangeMois.mode === "preset"    ? { days: rangeMois.preset }    : { from: rangeMois.from,    to: rangeMois.to    }, [rangeMois]);
  const querySemaine = useMemo(() => rangeSemaine.mode === "preset" ? { days: rangeSemaine.preset } : { from: rangeSemaine.from, to: rangeSemaine.to }, [rangeSemaine]);

  // Loads indépendants par graphique pour que la sélection d'un range
  // ne déclenche pas de spinner sur les autres
  const loadJour = useCallback(async () => {
    setLoadingJour(true);
    try {
      const [rJour, rTop] = await Promise.all([
        fetchAnalyseCaParJour(boutique, queryJour),
        fetchAnalyseTopClients(boutique, queryJour),
      ]);
      setCaJour(rJour.data);
      setTopClients(rTop.clients);
    } catch { setError(true); }
    finally  { setLoadingJour(false); }
  }, [boutique, queryJour]);

  const loadMois = useCallback(async () => {
    setLoadingMois(true);
    try {
      const r = await fetchAnalyseCaParMois(boutique, queryMois);
      setCaMois(r.data);
    } catch { setError(true); }
    finally  { setLoadingMois(false); }
  }, [boutique, queryMois]);

  const loadSemaine = useCallback(async () => {
    setLoadingSemaine(true);
    try {
      const r = await fetchAnalyseVentesParSemaine(boutique, querySemaine);
      setSemaine(r.data);
    } catch { setError(true); }
    finally  { setLoadingSemaine(false); }
  }, [boutique, querySemaine]);

  useEffect(() => { if (boutiqueLoaded) loadJour();    }, [boutiqueLoaded, loadJour]);
  useEffect(() => { if (boutiqueLoaded) loadMois();    }, [boutiqueLoaded, loadMois]);
  useEffect(() => { if (boutiqueLoaded) loadSemaine(); }, [boutiqueLoaded, loadSemaine]);

  // Formatter dates DD/MM pour l'axe X
  const fmtDate = (d: string) => {
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  // Formatter mois YYYY-MM → janv., févr., etc.
  const fmtMois = (m: string) => {
    const [year, month] = m.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  };

  // Stats rapides calculées côté client (basées sur le range "Jour")
  const totalCA   = caJour.reduce((s, d) => s + d.ca, 0);
  const totalCdes = caJour.reduce((s, d) => s + d.nb_orders, 0);
  const panierMoy = totalCdes > 0 ? totalCA / totalCdes : 0;
  const meilleurJour = caJour.reduce((best, d) => d.ca > best.ca ? d : best, { date: "", ca: 0, nb_orders: 0 });
  const labelJour = fmtRangeLabel(rangeJour, PRESETS_JOUR);

  // Tick formatter pour le graph CA par jour — ajoute la lettre du jour de semaine
  // sur 2 lignes : "15/01" puis "L" (subtil)
  const dowTickFormatter = (d: string) => {
    const dt = new Date(d);
    const letter = DOW_LABELS_SHORT[dt.getDay()];
    return `${fmtDate(d)}\n${letter}`;
  };

  // Tick custom pour afficher 2 lignes proprement
  const renderDateTick = ({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
    const dt = new Date(payload.value);
    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
    const letter = DOW_LABELS_SHORT[dt.getDay()];
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={11} fill={colors.axis}>
          {fmtDate(payload.value)}
        </text>
        <text x={0} y={0} dy={26} textAnchor="middle" fontSize={9} fontWeight={600}
              fill={isWeekend ? colors.warning : colors.axis} opacity={0.75}>
          {letter}
        </text>
      </g>
    );
  };

  if (error) return (
    <div>
      <ErrorState onRetry={() => { loadJour(); loadMois(); loadSemaine(); }} />
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-fg">Analyse</h1>

      {/* ── KPIs rapides ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: `CA ${labelJour}`, value: loadingJour ? "…" : fmtEur(totalCA)                  },
          { label: "Commandes",        value: loadingJour ? "…" : totalCdes.toLocaleString("fr-FR") },
          { label: "Panier moyen",     value: loadingJour ? "…" : fmtEur(panierMoy)                },
          { label: "Meilleur jour",    value: loadingJour ? "…" : (meilleurJour.date ? fmtDate(meilleurJour.date) : "—") },
        ].map(kpi => (
          <div key={kpi.label} className="bg-surface-2 rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-fg-muted mb-1 truncate">{kpi.label}</p>
            <p className="text-lg font-semibold text-fg">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── CA par jour ────────────────────────────────────────────── */}
      <section className="bg-surface-2 rounded-xl border border-border p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <SectionTitle>Chiffre d&apos;affaires par jour</SectionTitle>
          <DateRangePicker presets={PRESETS_JOUR} value={rangeJour} onChange={setRangeJour} />
        </div>
        <p className="text-xs text-fg-subtle mb-3">
          La lettre sous chaque date indique le jour de la semaine. Les barres orange = weekend.
        </p>
        {loadingJour ? (
          <div className="h-64 bg-surface-3 rounded animate-pulse" />
        ) : caJour.length === 0 ? (
          <p className="text-center text-fg-subtle py-16 text-sm">Aucune donnée</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={caJour} margin={{ top: 4, right: 8, bottom: 16, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tick={renderDateTick}
                interval="preserveStartEnd"
                height={36}
              />
              <YAxis
                tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: colors.axis }}
                width={52}
              />
              <Tooltip content={<DayTooltip colors={colors} />} cursor={{ fill: colors.grid, opacity: 0.3 }} />
              <Bar dataKey="ca" radius={[2, 2, 0, 0]}>
                {caJour.map((entry, i) => {
                  const day = new Date(entry.date).getDay();
                  const isWeekend = day === 0 || day === 6;
                  return (
                    <Cell key={i} fill={isWeekend ? colors.warning : colors.primary} fillOpacity={isWeekend ? 0.8 : 1} />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ── CA mensuel + Ventes par semaine ───────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* CA mensuel */}
        <section className="bg-surface-2 rounded-xl border border-border p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <SectionTitle>CA mensuel</SectionTitle>
            <DateRangePicker presets={PRESETS_MOIS} value={rangeMois} onChange={setRangeMois} />
          </div>
          {loadingMois ? (
            <div className="h-48 bg-surface-3 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={caMois} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="mois"
                  tickFormatter={fmtMois}
                  tick={{ fontSize: 10, fill: colors.axis }}
                  interval={caMois.length > 12 ? 2 : 0}
                />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: colors.axis }} width={48} />
                <Tooltip
                  formatter={(v: number) => [fmtEur(v), "CA HT"]}
                  labelFormatter={fmtMois}
                  contentStyle={{ fontSize: 12, background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 6, color: colors.tooltipText }}
                  itemStyle={{ color: colors.tooltipText }}
                  labelStyle={{ color: colors.tooltipText, fontWeight: 600 }}
                />
                <Bar dataKey="ca" fill={colors.primary} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Moyenne CA par jour de semaine */}
        <section className="bg-surface-2 rounded-xl border border-border p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <SectionTitle>CA moyen par jour de la semaine</SectionTitle>
            <DateRangePicker presets={PRESETS_SEMAINE} value={rangeSemaine} onChange={setRangeSemaine} />
          </div>
          <p className="text-xs text-fg-subtle mb-3">CA total du jour ÷ nombre de jours concernés</p>
          {loadingSemaine ? (
            <div className="h-48 bg-surface-3 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={semaine} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.axis }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: colors.axis }} width={48} />
                <Tooltip
                  formatter={(v: number) => [fmtEur(v), "Moy. CA HT"]}
                  contentStyle={{ fontSize: 12, background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 6, color: colors.tooltipText }}
                  itemStyle={{ color: colors.tooltipText }}
                  labelStyle={{ color: colors.tooltipText, fontWeight: 600 }}
                />
                <Bar dataKey="avg_ca" fill={colors.success} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {/* ── Top 10 clients ─────────────────────────────────────────── */}
      <section className="bg-surface-2 rounded-xl border border-border p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <SectionTitle>Top 10 clients</SectionTitle>
          <DateRangePicker presets={PRESETS_JOUR} value={rangeJour} onChange={setRangeJour} />
        </div>
        {loadingJour ? (
          <div className="h-48 bg-surface-3 rounded animate-pulse" />
        ) : topClients.length === 0 ? (
          <p className="text-center text-fg-subtle py-8 text-sm">Aucune donnée</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-fg-muted">#</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-fg-muted">Client</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-fg-muted">CA HT</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-fg-muted">Commandes</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-fg-muted">Panier moyen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topClients.map((c, i) => (
                  <tr key={c.customer_name} className="hover:bg-surface-3">
                    <td className="py-2 px-3 text-fg-subtle font-mono text-xs">{i + 1}</td>
                    <td className="py-2 px-3 font-medium text-fg">{c.customer_name}</td>
                    <td className="py-2 px-3 text-right font-semibold text-fg">{fmtEur(c.ca)}</td>
                    <td className="py-2 px-3 text-right text-fg-muted">{c.nb_orders}</td>
                    <td className="py-2 px-3 text-right text-fg-muted">{fmtEur(c.panier_moyen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Barre de progression visuelle pour le top clients */}
            <div className="mt-4 space-y-1.5">
              {topClients.map((c) => (
                <div key={c.customer_name + "-bar"} className="flex items-center gap-2">
                  <span className="text-xs text-fg-muted w-32 truncate">{c.customer_name}</span>
                  <div className="flex-1 bg-surface-3 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${(c.ca / topClients[0].ca) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-fg-muted w-20 text-right">{fmtK(c.ca)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
