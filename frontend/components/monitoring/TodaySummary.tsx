"use client";
import Link from "next/link";
import type { MonitoringSummary } from "@/lib/api";

interface Props {
  data: MonitoringSummary | null;
  loading: boolean;
}

const Bullet = ({
  count, label, href, severity = "neutral",
}: {
  count: number;
  label: string;
  href: string;
  severity?: "high" | "medium" | "low" | "neutral";
}) => {
  const tone = {
    high:    "bg-rose-50  dark:bg-rose-950/40  text-rose-700  dark:text-rose-300",
    medium:  "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
    low:     "bg-sky-50   dark:bg-sky-950/40   text-sky-700   dark:text-sky-300",
    neutral: "bg-surface-3  text-fg-muted",
  }[severity];

  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-3 transition-colors group"
    >
      <span className={`inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-md text-sm font-semibold ${tone}`}>
        {count}
      </span>
      <span className="text-sm text-fg-muted group-hover:text-fg flex-1">{label}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
};

export default function TodaySummary({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-surface-2 border border-border rounded-xl p-5">
        <div className="h-5 w-48 bg-surface-3 rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-surface-3 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const churnCritique = data.churn?.critique ?? 0;
  const reorderRetard = data.reorder?.en_retard ?? 0;

  const total = churnCritique + reorderRetard;

  return (
    <div className="bg-surface-2 border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4 text-amber-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 0 0 1.84-2.75L13.74 4a2 2 0 0 0-3.5 0L3.16 16.25A2 2 0 0 0 5 19z" />
          </svg>
          <h2 className="text-sm font-semibold text-fg">À traiter aujourd&apos;hui</h2>
        </div>
        <span className="text-xs text-fg-subtle">{total} {total > 1 ? "actions" : "action"}</span>
      </div>

      {total === 0 ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm">Aucune action urgente — tout est sous contrôle</span>
        </div>
      ) : (
        <div className="space-y-1">
          {churnCritique > 0 && (
            <Bullet
              count={churnCritique}
              label={churnCritique > 1 ? "clients à risque critique de départ" : "client à risque critique de départ"}
              href="/churn"
              severity="high"
            />
          )}
          {reorderRetard > 0 && (
            <Bullet
              count={reorderRetard}
              label={reorderRetard > 1 ? "clients à relancer (cycle en retard)" : "client à relancer (cycle en retard)"}
              href="/rfm"
              severity="low"
            />
          )}
        </div>
      )}
    </div>
  );
}
