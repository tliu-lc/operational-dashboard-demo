"use client";
import { useTheme } from "@/context/ThemeContext";

/**
 * Couleurs pour recharts qui s'adaptent au thème.
 * Utilise rgb(var(--...)) au runtime via les valeurs lues du CSS.
 */
export function useChartColors() {
  const { resolved } = useTheme();
  const dark = resolved === "dark";

  return {
    grid:    dark ? "#292524" : "#e7e5e4",   // stone-800 / stone-200
    axis:    dark ? "#a8a29e" : "#78716c",   // stone-400 / stone-500
    primary: dark ? "#60a5fa" : "#2563eb",   // blue-400 / blue-600
    success: dark ? "#34d399" : "#10b981",   // emerald-400 / emerald-500
    warning: dark ? "#fbbf24" : "#f59e0b",   // amber-400 / amber-500
    danger:  dark ? "#fb7185" : "#f43f5e",   // rose-400 / rose-500
    tooltipBg:     dark ? "#1c1917" : "#ffffff",
    tooltipBorder: dark ? "#44403c" : "#e7e5e4",
    tooltipText:   dark ? "#f5f5f4" : "#1c1917",
  };
}
