"use client";
import { useState } from "react";

interface InfoTooltipProps {
  text: string;
  position?: "bottom" | "top" | "right" | "left";
  className?: string;
  tone?: "default" | "onDark";
}

export default function InfoTooltip({ text, position = "bottom", className = "", tone = "default" }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);

  const posClass = {
    bottom: "top-full mt-1.5 left-1/2 -translate-x-1/2",
    top: "bottom-full mb-1.5 left-1/2 -translate-x-1/2",
    right: "left-full ml-1.5 top-1/2 -translate-y-1/2",
    left: "right-full mr-1.5 top-1/2 -translate-y-1/2",
  }[position];

  const toneCls = tone === "onDark"
    ? "text-blue-300 hover:text-blue-100"
    : "text-blue-400 hover:text-blue-600";

  return (
    <span className={`relative inline-flex items-center group ml-1.5 ${className}`}>
      <span
        role="button"
        tabIndex={0}
        aria-label={text}
        className={`${toneCls} cursor-help transition-colors`}
        onClick={e => { e.stopPropagation(); setVisible(v => !v); }}
        onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); setVisible(v => !v); } }}
        onBlur={() => setVisible(false)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-1 3h2v5H7V7z" />
        </svg>
      </span>
      <span
        role="tooltip"
        className={`
          absolute z-50 w-64 px-3 py-2 text-xs text-surface bg-fg rounded-lg shadow-lg
          pointer-events-none transition-opacity duration-150
          ${visible ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
          ${posClass}
        `}
      >
        {text}
      </span>
    </span>
  );
}
