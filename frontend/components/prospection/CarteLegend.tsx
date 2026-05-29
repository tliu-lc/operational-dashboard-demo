"use client";
import { fmtInt, fmtPct } from "@/lib/api";
import { AMBER_PALETTE } from "./carteColors";
import type { MetriqueCarte } from "./SelecteurMetrique";
import { METRIQUE_LABELS } from "./SelecteurMetrique";

interface Props {
  metrique: MetriqueCarte;
  quintiles: number[]; // 4 seuils (Q1→Q2, Q2→Q3, Q3→Q4, Q4→Q5)
}

function fmt(metrique: MetriqueCarte, v: number): string {
  return metrique === "taux_penetration" ? fmtPct(v) : fmtInt(v);
}

export default function CarteLegend({ metrique, quintiles }: Props) {
  const labels = [
    `> ${fmt(metrique, quintiles[3])}`,
    `${fmt(metrique, quintiles[2])} – ${fmt(metrique, quintiles[3])}`,
    `${fmt(metrique, quintiles[1])} – ${fmt(metrique, quintiles[2])}`,
    `${fmt(metrique, quintiles[0])} – ${fmt(metrique, quintiles[1])}`,
    `≤ ${fmt(metrique, quintiles[0])}`,
  ];
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-4 shadow-sm w-full">
      <p className="text-xs font-semibold text-fg uppercase tracking-wider mb-3">
        {METRIQUE_LABELS[metrique]}
      </p>
      <ul className="space-y-1.5">
        {AMBER_PALETTE.slice().reverse().map((color, i) => (
          <li key={color} className="flex items-center gap-2 text-xs text-fg-muted">
            <span
              className="inline-block w-4 h-4 rounded border border-border"
              style={{ backgroundColor: color }}
            />
            <span>{labels[i]}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs text-fg-subtle pt-1 border-t border-border mt-2">
          <span className="inline-block w-4 h-4 rounded border border-border bg-surface-3" />
          <span>Sans donnée</span>
        </li>
      </ul>
    </div>
  );
}
