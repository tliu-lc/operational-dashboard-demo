"use client";
import type { ProspectTotals } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/api";
import InfoTooltip from "@/components/InfoTooltip";

interface Props {
  totals: ProspectTotals | null;
  loading: boolean;
}

export default function CompteurGlobal({ totals, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-surface-2 border border-border rounded-xl shadow-sm p-4 md:p-6">
        <div className="h-8 bg-surface-3 rounded animate-pulse w-2/3 mb-2" />
        <div className="h-4 bg-surface-3 rounded animate-pulse w-1/2" />
      </div>
    );
  }
  if (!totals) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 text-sm text-fg-muted">
        Aucune donnée de prospects disponible.
      </div>
    );
  }
  return (
    <div className="bg-surface-2 border border-border rounded-xl shadow-sm p-4 md:p-6 space-y-2">
      <p className="text-2xl font-bold text-fg tabular-nums">
        {fmtInt(totals.nb_prospects_nets)}
        <span className="ml-2">prospects</span>
        <InfoTooltip
          position="bottom"
          text="Boutiques de vêtements (NAF 47.71Z) actives en France qui ne sont pas tes clients. Calcul : total SIRENE − clients − matches incertains."
        />
        <span className="text-fg-muted font-normal text-base">
          {" "}sur {fmtInt(totals.nb_sirene_total)} boutiques SIRENE
        </span>
      </p>
      <p className="text-sm text-fg-muted">
        — {fmtInt(totals.nb_clients)} clients existants — taux de pénétration national :
        <span className="font-medium text-fg ml-1">{fmtPct(totals.taux_penetration_pct)}</span>
      </p>
      {totals.nb_matches_incertains > 0 && (
        <p className="inline-flex items-center gap-1.5 mt-1 px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {fmtInt(totals.nb_matches_incertains)} matches incertains (M3) exclus
          <InfoTooltip text="Nom + CP qui ressemblent à un client. Exclus par prudence." />
        </p>
      )}
    </div>
  );
}
