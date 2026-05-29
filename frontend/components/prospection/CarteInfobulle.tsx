"use client";
import type { ProspectDept } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/api";

interface Props {
  dept: ProspectDept;
  x: number;
  y: number;
}

export default function CarteInfobulle({ dept, x, y }: Props) {
  const sature = dept.nb_sirene_total > 0 && dept.nb_prospects_nets === 0;
  const sansDonnee = dept.nb_sirene_total === 0;

  return (
    <div
      className="fixed z-50 pointer-events-none bg-surface-2 shadow-md border border-border rounded-lg p-3 text-sm min-w-[220px]"
      style={{ left: x + 12, top: y + 12 }}
    >
      <p className="font-semibold text-fg mb-1">
        {dept.code_departement} — {dept.nom_departement}
      </p>
      <div className="border-t border-border pt-1.5 space-y-0.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-fg-muted">Total SIRENE</span>
          <span className="font-medium text-fg tabular-nums">{fmtInt(dept.nb_sirene_total)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-fg-muted">Clients existants</span>
          <span className="font-medium text-fg tabular-nums">
            {fmtInt(dept.nb_clients)}
            {dept.taux_penetration_pct != null && (
              <span className="text-fg-subtle ml-1">({fmtPct(dept.taux_penetration_pct)})</span>
            )}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-fg-muted">Prospects nets</span>
          <span className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums">{fmtInt(dept.nb_prospects_nets)}</span>
        </div>
        {dept.nb_matches_incertains > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-fg-subtle">Matches incertains</span>
            <span className="text-fg-subtle tabular-nums">{fmtInt(dept.nb_matches_incertains)}</span>
          </div>
        )}
      </div>
      {sature && (
        <p className="mt-1.5 text-[10px] inline-block px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
          Marché saturé
        </p>
      )}
      {sansDonnee && (
        <p className="mt-1.5 text-[10px] text-fg-subtle">Aucune donnée SIRENE</p>
      )}
    </div>
  );
}
