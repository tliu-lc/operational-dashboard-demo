import type { ProspectDept } from "@/lib/api";
import type { MetriqueCarte } from "./SelecteurMetrique";

// Codes département DROM (3 chiffres) — exclus de la carte métropole, affichés en encarts
export const DROM_CODES = new Set(["971", "972", "973", "974", "976"]);

// Palette Linen — quintiles amber 100 → 700 (UX-023)
export const AMBER_PALETTE = [
  "#fef3c7", // amber-100
  "#fde68a", // amber-200
  "#fcd34d", // amber-300
  "#f59e0b", // amber-500
  "#b45309", // amber-700
] as const;

export const NO_DATA_FILL = "#f5f5f4"; // stone-100

export function valueForMetrique(d: ProspectDept, m: MetriqueCarte): number | null {
  switch (m) {
    case "prospects_nets":   return d.nb_prospects_nets;
    case "taux_penetration": return d.taux_penetration_pct;
    case "total_marche":     return d.nb_sirene_total;
  }
}

/** Quantiles 20/40/60/80 sur les valeurs non-nulles ET > 0. */
export function computeQuintiles(values: number[]): number[] {
  const sorted = values.filter(v => v != null && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0, 0];
  const quantile = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[idx];
  };
  return [quantile(0.2), quantile(0.4), quantile(0.6), quantile(0.8)];
}

/** Calcule les quintiles sur la métropole uniquement (DROM exclus). */
export function quintilesForMetrique(data: ProspectDept[], m: MetriqueCarte): number[] {
  const vals = data
    .filter(d => !DROM_CODES.has(d.code_departement) && d.nb_sirene_total > 0)
    .map(d => valueForMetrique(d, m))
    .filter((v): v is number => v != null);
  return computeQuintiles(vals);
}

export function colorForValue(value: number | null, quintiles: number[]): string {
  if (value == null || value <= 0) return NO_DATA_FILL;
  if (value <= quintiles[0]) return AMBER_PALETTE[0];
  if (value <= quintiles[1]) return AMBER_PALETTE[1];
  if (value <= quintiles[2]) return AMBER_PALETTE[2];
  if (value <= quintiles[3]) return AMBER_PALETTE[3];
  return AMBER_PALETTE[4];
}
