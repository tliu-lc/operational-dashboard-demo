"use client";
import { fmtInt } from "@/lib/api";
import { STATUT_LABELS } from "./StatutBadge";
import InfoTooltip from "@/components/InfoTooltip";

interface Props {
  counts: { a_contacter: number; contacte: number; pas_interesse: number };
}

const DOTS: Record<keyof Props["counts"], string> = {
  a_contacter:   "bg-stone-400",
  contacte:      "bg-blue-500",
  pas_interesse: "bg-red-500",
};

const STATUT_HELP: Record<keyof Props["counts"], string> = {
  a_contacter:   "Pas encore approché.",
  contacte:      "Déjà contacté — date enregistrée pour suivi.",
  pas_interesse: "A décliné — gardé pour traçabilité, plus relancé.",
};

export default function CompteursStatut({ counts }: Props) {
  return (
    <div className="flex items-center gap-4 text-sm text-fg-muted flex-wrap">
      {(Object.keys(counts) as (keyof Props["counts"])[]).map(k => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${DOTS[k]}`} />
          {STATUT_LABELS[k]} : <span className="font-medium text-fg tabular-nums">{fmtInt(counts[k])}</span>
          <InfoTooltip position="top" text={STATUT_HELP[k]} />
        </span>
      ))}
    </div>
  );
}
