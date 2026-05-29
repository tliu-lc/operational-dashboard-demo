"use client";
import InfoTooltip from "@/components/InfoTooltip";

export type MetriqueCarte = "prospects_nets" | "taux_penetration" | "total_marche";

export const METRIQUE_LABELS: Record<MetriqueCarte, string> = {
  prospects_nets:   "Prospects nets",
  taux_penetration: "Taux pénétration",
  total_marche:     "Total marché",
};

const METRIQUE_HELP: Record<MetriqueCarte, string> = {
  prospects_nets:   "Boutiques à démarcher par département. Foncé = beaucoup de potentiel.",
  taux_penetration: "Part déjà cliente par département (clients ÷ SIRENE). Foncé = forte pénétration.",
  total_marche:     "Total des boutiques actives par département (clients + prospects).",
};

interface Props {
  value: MetriqueCarte;
  onChange: (m: MetriqueCarte) => void;
}

export default function SelecteurMetrique({ value, onChange }: Props) {
  return (
    <div className="inline-flex gap-1 p-1 bg-surface-2 border border-border rounded-lg">
      {(Object.keys(METRIQUE_LABELS) as MetriqueCarte[]).map(m => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors inline-flex items-center ${
              active
                ? "bg-fg text-surface"
                : "text-fg-muted hover:bg-surface-3 hover:text-fg"
            }`}
          >
            {METRIQUE_LABELS[m]}
            <InfoTooltip
              position="bottom"
              tone={active ? "onDark" : "default"}
              text={METRIQUE_HELP[m]}
            />
          </button>
        );
      })}
    </div>
  );
}
