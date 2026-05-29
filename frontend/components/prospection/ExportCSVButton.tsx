"use client";
import { useState } from "react";
import { exportProspectsUrl, type ProspectListQuery } from "@/lib/api";

interface Props {
  query: ProspectListQuery;
}

export default function ExportCSVButton({ query }: Props) {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const res = await fetch(exportProspectsUrl(query), { cache: "no-store" });
      if (!res.ok) throw new Error(`Export error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `prospects_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-fg-muted hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors disabled:opacity-60"
    >
      {busy ? (
        <>
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" />
          </svg>
          Préparation...
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
          </svg>
          Exporter CSV
        </>
      )}
    </button>
  );
}
