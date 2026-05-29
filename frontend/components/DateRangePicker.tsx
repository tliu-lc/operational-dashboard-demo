"use client";
import { useState, useEffect, useRef } from "react";

export interface Preset { value: number; label: string }

export type DateRange =
  | { mode: "preset"; preset: number }
  | { mode: "custom"; from: string; to: string };

interface Props {
  presets: Preset[];
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtDateShort(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export default function DateRangePicker({ presets, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tmpFrom, setTmpFrom] = useState<string>(
    value.mode === "custom" ? value.from : daysAgoISO(30),
  );
  const [tmpTo, setTmpTo] = useState<string>(
    value.mode === "custom" ? value.to : todayISO(),
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  // Synchronise les inputs si on rouvre le picker
  useEffect(() => {
    if (open && value.mode === "custom") {
      setTmpFrom(value.from);
      setTmpTo(value.to);
    }
  }, [open, value]);

  // Ferme au clic extérieur
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const apply = () => {
    if (tmpFrom && tmpTo) {
      const from = tmpFrom <= tmpTo ? tmpFrom : tmpTo;
      const to   = tmpFrom <= tmpTo ? tmpTo : tmpFrom;
      onChange({ mode: "custom", from, to });
      setOpen(false);
    }
  };

  const customActive = value.mode === "custom";

  return (
    <div className="relative flex gap-1 flex-wrap items-center">
      {presets.map(p => (
        <button
          key={p.value}
          onClick={() => onChange({ mode: "preset", preset: p.value })}
          className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
            value.mode === "preset" && value.preset === p.value
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-surface-2 text-fg-muted border-border-strong hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
          }`}
        >
          {p.label}
        </button>
      ))}

      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border transition-colors ${
          customActive
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-surface-2 text-fg-muted border-border-strong hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
        {customActive
          ? <span>{fmtDateShort(value.from)} → {fmtDateShort(value.to)}</span>
          : <span>Personnalisé</span>}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-1 z-50 bg-surface-2 border border-border rounded-lg shadow-card-hover p-4 animate-slide-up min-w-72"
        >
          <p className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">
            Plage personnalisée
          </p>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-fg-muted block mb-1">Du</span>
              <input
                type="date"
                value={tmpFrom}
                max={tmpTo || todayISO()}
                onChange={e => setTmpFrom(e.target.value)}
                className="w-full text-sm border border-border-strong rounded px-2 py-1.5 bg-surface-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="text-xs text-fg-muted block mb-1">Au</span>
              <input
                type="date"
                value={tmpTo}
                min={tmpFrom}
                max={todayISO()}
                onChange={e => setTmpTo(e.target.value)}
                className="w-full text-sm border border-border-strong rounded px-2 py-1.5 bg-surface-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1 text-xs text-fg-muted hover:text-fg transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={apply}
              disabled={!tmpFrom || !tmpTo}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
