type RFMStatus = "en_retard" | "du_semaine" | "a_venir" | "insuffisant";

const STATUS_CONFIG: Record<RFMStatus, { emoji: string; label: string; classes: string }> = {
  en_retard:   { emoji: "🔴", label: "En retard",              classes: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300"           },
  du_semaine:  { emoji: "🟡", label: "Dû cette semaine",       classes: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"   },
  a_venir:     { emoji: "🟢", label: "À venir",                classes: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300" },
  insuffisant: { emoji: "⚫", label: "Historique insuffisant", classes: "bg-surface-3 text-fg-muted"                                              },
};

interface Props {
  status: RFMStatus;
  delayLabel?: string;
}

export default function StatusBadge({ status, delayLabel }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.insuffisant;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${cfg.classes}`}>
      {cfg.emoji} {delayLabel ?? cfg.label}
    </span>
  );
}
