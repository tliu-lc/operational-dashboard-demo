"use client";
import { useBoutique } from "@/context/BoutiqueContext";

export default function BoutiqueSelector() {
  const { boutique, setBoutique, boutiqueLabels, boutiqueOrder } = useBoutique();

  return (
    <select
      value={boutique}
      onChange={(e) => setBoutique(e.target.value)}
      className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface-2 text-fg font-medium focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors hover:border-border-strong cursor-pointer"
      aria-label="Sélectionner la boutique"
    >
      {boutiqueOrder.map(k => (
        <option key={k} value={k}>{boutiqueLabels[k] ?? k}</option>
      ))}
    </select>
  );
}
