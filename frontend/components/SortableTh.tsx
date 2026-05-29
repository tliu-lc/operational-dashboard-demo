"use client";
import { type SortState } from "@/lib/useSortable";

interface Props<K extends string> {
  label: React.ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onToggle: (k: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
}

export default function SortableTh<K extends string>({
  label, sortKey, sort, onToggle, align = "left", className = "",
}: Props<K>) {
  const active = sort.key === sortKey;
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th className={`${alignClass} font-medium text-fg-muted select-none ${className}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-fg transition-colors cursor-pointer ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-fg" : ""}`}
      >
        <span>{label}</span>
        <span className={`text-[10px] ${active ? "opacity-100" : "opacity-30"}`}>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
