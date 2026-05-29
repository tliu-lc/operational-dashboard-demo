"use client";
import { useState } from "react";
import InfoTooltip from "@/components/InfoTooltip";

interface Props {
  // Code postal préfixe
  cpPrefix: string;
  onCpPrefixChange: (v: string) => void;

  // Date création
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;

  // Régions
  regionOptions: string[];
  selectedRegions: string[];
  onRegionsChange: (regions: string[]) => void;

  // Tranches d'effectif (liste complète serveur)
  trancheOptions: { code: string; label: string }[];
  selectedTranches: string[];
  onTranchesChange: (tranches: string[]) => void;

  // Type de boutique (heuristique mots-clés sur denomination)
  shopTypeOptions: string[];
  selectedShopTypes: string[];
  onShopTypesChange: (types: string[]) => void;

  // Inclure chaînes nationales (par défaut : exclues)
  includeChains: boolean;
  onIncludeChainsChange: (v: boolean) => void;

  // Score prospect minimum (0-100)
  scoreMin: number;
  onScoreMinChange: (v: number) => void;

  // Exclure prospects sans dénomination
  hasDenomination: boolean;
  onHasDenominationChange: (v: boolean) => void;

  onResetAll: () => void;
}


// Libellés humains pour les tags techniques shop_type
const SHOP_TYPE_LABELS: Record<string, string> = {
  femme:         "Mode femme",
  homme:         "Mode homme",
  enfant:        "Enfant / bébé",
  sport:         "Sport",
  mariage:       "Mariage / cérémonie",
  friperie:      "Friperie / vintage",
  lingerie:      "Lingerie",
  luxe:          "Luxe",
  grande_taille: "Grande taille",
  indetermine:   "Indéterminé (sans mot-clé)",
};

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

export default function FiltresAvances({
  cpPrefix, onCpPrefixChange,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  regionOptions, selectedRegions, onRegionsChange,
  trancheOptions, selectedTranches, onTranchesChange,
  shopTypeOptions, selectedShopTypes, onShopTypesChange,
  includeChains, onIncludeChainsChange,
  scoreMin, onScoreMinChange,
  hasDenomination, onHasDenominationChange,
  onResetAll,
}: Props) {
  const [open, setOpen] = useState(false);

  const activeCount =
    (cpPrefix ? 1 : 0)
    + (dateFrom ? 1 : 0)
    + (dateTo ? 1 : 0)
    + selectedRegions.length
    + selectedTranches.length
    + selectedShopTypes.length
    + (includeChains ? 1 : 0)        // valeur par défaut = exclues, donc ON compte comme filtre actif
    + (scoreMin > 0 ? 1 : 0)
    + (hasDenomination ? 0 : 1);     // valeur par défaut = ON, donc OFF compte comme filtre actif

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-surface-2 border border-border rounded-xl shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-fg hover:bg-surface-3 rounded-xl transition-colors"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 .8 1.6l-6 8a1 1 0 0 0-.2.6V20l-4-2v-6a1 1 0 0 0-.2-.6l-6-8A1 1 0 0 1 3 4z" />
          </svg>
          Filtres avancés
          {activeCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-fg text-surface text-[10px] font-semibold tabular-nums">
              {activeCount}
            </span>
          )}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Code postal préfixe */}
            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1">
                Code postal (préfixe)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
                value={cpPrefix}
                onChange={e => onCpPrefixChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="ex : 75 = Paris, 7500 = Paris 1-9e"
                className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>

            {/* Date de création */}
            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1">
                Date de création
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || today}
                  onChange={e => onDateFromChange(e.target.value)}
                  className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
                <span className="text-xs text-fg-subtle">→</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  max={today}
                  onChange={e => onDateToChange(e.target.value)}
                  className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* Régions */}
          {regionOptions.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5 gap-2">
                <label className="block text-xs font-medium text-fg-muted">
                  Régions {selectedRegions.length > 0 && <span className="text-fg-subtle">({selectedRegions.length} sélectionnées)</span>}
                </label>
                <span className="text-[11px] text-fg-subtle italic">
                  Mutuellement exclusif avec la sélection département sur la carte
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {regionOptions.map(r => {
                  const active = selectedRegions.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onRegionsChange(toggle(selectedRegions, r))}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        active
                          ? "bg-fg text-surface border-fg"
                          : "bg-surface text-fg-muted border-border hover:border-border-strong"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Type de boutique — heuristique mots-clés */}
          {shopTypeOptions.length > 0 && (
            <div>
              <div className="flex items-center mb-1.5">
                <label className="block text-xs font-medium text-fg-muted">
                  Type de boutique
                  {selectedShopTypes.length > 0 && <span className="text-fg-subtle ml-1">({selectedShopTypes.length})</span>}
                </label>
                <InfoTooltip
                  position="right"
                  text="Détection par mots-clés dans le nom (FEMME, LADY → 'Mode femme'). Imparfait : coche 'Indéterminé' pour voir aussi les non-classifiés."
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...shopTypeOptions, "indetermine"].map(t => {
                  const active = selectedShopTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onShopTypesChange(toggle(selectedShopTypes, t))}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        active
                          ? "bg-fg text-surface border-fg"
                          : t === "indetermine"
                            ? "bg-surface text-fg-subtle border-border border-dashed hover:border-border-strong italic"
                            : "bg-surface text-fg-muted border-border hover:border-border-strong"
                      }`}
                    >
                      {SHOP_TYPE_LABELS[t] ?? t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tranches d'effectif — liste complète serveur */}
          {trancheOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1.5">
                Tranche d&apos;effectif {selectedTranches.length > 0 && <span className="text-fg-subtle">({selectedTranches.length} sélectionnées)</span>}
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {trancheOptions.map(t => {
                  const active = selectedTranches.includes(t.code);
                  return (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => onTranchesChange(toggle(selectedTranches, t.code))}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        active
                          ? "bg-fg text-surface border-fg"
                          : "bg-surface text-fg-muted border-border hover:border-border-strong"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Score prospect minimum — Sprint 19 phase 2 D */}
          <div>
            <div className="flex items-center mb-1.5">
              <label className="block text-xs font-medium text-fg-muted">
                Score prospect minimum {scoreMin > 0 && <span className="text-fg ml-1 tabular-nums">≥ {scoreMin}</span>}
              </label>
              <InfoTooltip
                position="right"
                text="Note 0–100 : +30 si employés, +20 si > 2 ans, +30 si société, +20 si nom valide. ≥ 60 = qualifié, ≥ 80 = top."
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={scoreMin}
                onChange={e => onScoreMinChange(Number(e.target.value))}
                className="flex-1 accent-fg"
              />
              <span className="text-sm font-medium text-fg tabular-nums w-12 text-right">{scoreMin}</span>
            </div>
            <div className="flex justify-between text-[10px] text-fg-subtle mt-1">
              <span>0 (tous)</span>
              <span>60 (qualifiés)</span>
              <span>80 (top)</span>
              <span>100</span>
            </div>
          </div>

          {/* Switches dénomination + chaînes + reset */}
          <div className="pt-2 border-t border-border space-y-2">
            <div className="flex items-center">
              <label className="inline-flex items-center gap-2 text-sm text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasDenomination}
                  onChange={e => onHasDenominationChange(e.target.checked)}
                  className="accent-fg"
                />
                <span>Exclure les prospects sans dénomination <span className="text-fg-subtle">(NULL / [ND])</span></span>
              </label>
              <InfoTooltip
                position="right"
                text="Cache les boutiques sans nom déclaré (souvent des EI). Décoche pour les voir aussi."
              />
            </div>
            <div className="flex items-center">
              <label className="inline-flex items-center gap-2 text-sm text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={!includeChains}
                  onChange={e => onIncludeChainsChange(!e.target.checked)}
                  className="accent-fg"
                />
                <span>Exclure les chaînes nationales <span className="text-fg-subtle">(Zara, H&M, Kiabi, Decathlon…)</span></span>
              </label>
              <InfoTooltip
                position="right"
                text="Exclut ~120 chaînes (Zara, H&M, Kiabi, Decathlon…) qui n'achètent jamais en gros."
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onResetAll}
                disabled={activeCount === 0}
                className="text-xs text-fg-muted hover:text-fg underline underline-offset-2 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              >
                Réinitialiser les filtres avancés
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
