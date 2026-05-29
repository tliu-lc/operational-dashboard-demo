import type { ProspectStatut } from "@/lib/api";

const CFG: Record<ProspectStatut, { label: string; classes: string; dot: string }> = {
  a_contacter:   { label: "À contacter",   classes: "bg-surface-3 text-fg-muted",                                                   dot: "bg-fg-subtle" },
  contacte:      { label: "Contacté",      classes: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",             dot: "bg-blue-500"  },
  pas_interesse: { label: "Pas intéressé", classes: "bg-red-100  dark:bg-red-950/40  text-red-700  dark:text-red-300",              dot: "bg-red-500"   },
};

export const STATUT_LABELS = Object.fromEntries(
  Object.entries(CFG).map(([k, v]) => [k, v.label]),
) as Record<ProspectStatut, string>;

interface Props {
  statut: ProspectStatut;
  withDot?: boolean;
  className?: string;
}

export default function StatutBadge({ statut, withDot = true, className = "" }: Props) {
  const cfg = CFG[statut];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.classes} ${className}`}>
      {withDot && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
      {cfg.label}
    </span>
  );
}
