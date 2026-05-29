"use client";
import { useMemo } from "react";
import type { Prospect, ProspectStatut } from "@/lib/api";
import { fmtInt, fmtSiret, googleMapsUrl } from "@/lib/api";
import SortableTh from "@/components/SortableTh";
import Pagination from "@/components/Pagination";
import StatutBadge, { STATUT_LABELS } from "./StatutBadge";
import CompteursStatut from "./CompteursStatut";
import ExportCSVButton from "./ExportCSVButton";
import FiltresAvances from "./FiltresAvances";
import type { ProspectListQuery } from "@/lib/api";

type SortKey = "denomination" | "zip_code" | "dept_code" | "date_creation" | "statut" | "dernier_contact" | "score_prospect";

interface Props {
  items: Prospect[];
  total: number;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  sort: SortKey;
  dir: "asc" | "desc";
  onSortChange: (sort: SortKey, dir: "asc" | "desc") => void;
  counts: { a_contacter: number; contacte: number; pas_interesse: number };
  search: string;
  onSearchChange: (q: string) => void;
  selectedStatuts: ProspectStatut[];
  onStatutsChange: (s: ProspectStatut[]) => void;
  selectedTranches: string[];
  onTranchesChange: (t: string[]) => void;
  trancheOptions: { code: string; label: string }[];
  selectedDept: string | null;
  onClearDept: () => void;
  deptName: string | null;
  onSelectProspect: (p: Prospect) => void;
  onQuickStatusChange: (p: Prospect, newStatut: ProspectStatut) => void;
  onResetFilters: () => void;
  exportQuery: ProspectListQuery;

  // Filtres avancés
  cpPrefix: string;
  onCpPrefixChange: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  regionOptions: string[];
  selectedRegions: string[];
  onRegionsChange: (r: string[]) => void;
  shopTypeOptions: string[];
  selectedShopTypes: string[];
  onShopTypesChange: (t: string[]) => void;
  includeChains: boolean;
  onIncludeChainsChange: (v: boolean) => void;
  scoreMin: number;
  onScoreMinChange: (v: number) => void;
  hasDenomination: boolean;
  onHasDenominationChange: (v: boolean) => void;
  onResetAdvanced: () => void;
}

function scoreClass(score: number): string {
  if (score >= 80) return "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300";
  if (score >= 60) return "bg-amber-100  dark:bg-amber-950/40  text-amber-800  dark:text-amber-300";
  if (score >= 40) return "bg-surface-3                          text-fg-muted";
  return                  "bg-stone-100  dark:bg-stone-900/40    text-fg-subtle";
}

// Mêmes libellés que dans FiltresAvances — utilisés pour les badges de tags
// dans la colonne Type de la liste.
const SHOP_TYPE_LABELS: Record<string, string> = {
  femme: "Femme", homme: "Homme", enfant: "Enfant",
  sport: "Sport", mariage: "Mariage", friperie: "Friperie",
  lingerie: "Lingerie", luxe: "Luxe", grande_taille: "Grande taille",
};

const STATUTS_ALL: ProspectStatut[] = ["a_contacter", "contacte", "pas_interesse"];

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

export default function ListeProspects(props: Props) {
  const {
    items, total, loading, error,
    page, pageSize, onPageChange,
    sort, dir, onSortChange,
    counts, search, onSearchChange,
    selectedStatuts, onStatutsChange,
    selectedTranches, onTranchesChange, trancheOptions,
    selectedDept, onClearDept, deptName,
    onSelectProspect, onQuickStatusChange, onResetFilters, exportQuery,
    cpPrefix, onCpPrefixChange,
    dateFrom, dateTo, onDateFromChange, onDateToChange,
    regionOptions, selectedRegions, onRegionsChange,
    shopTypeOptions, selectedShopTypes, onShopTypesChange,
    includeChains, onIncludeChainsChange,
    scoreMin, onScoreMinChange,
    hasDenomination, onHasDenominationChange,
    onResetAdvanced,
  } = props;

  const sortState = useMemo(() => ({ key: sort, dir }), [sort, dir]);
  const toggleSort = (k: SortKey) => {
    if (sort === k) onSortChange(k, dir === "asc" ? "desc" : "asc");
    else onSortChange(k, "asc");
  };

  const hasFilters =
    selectedDept != null
    || selectedStatuts.length > 0
    || selectedTranches.length > 0
    || selectedRegions.length > 0
    || selectedShopTypes.length > 0
    || includeChains
    || scoreMin > 0
    || search.length > 0
    || cpPrefix.length > 0
    || dateFrom.length > 0
    || dateTo.length > 0
    || !hasDenomination;
  const isEmpty = !loading && items.length === 0;

  return (
    <div className="space-y-4">
      {/* Badge département actif */}
      {selectedDept && (
        <div>
          <span className="inline-flex items-center gap-2 bg-surface-3 text-fg rounded-full px-3 py-1 text-sm">
            Département : {selectedDept}{deptName ? ` — ${deptName}` : ""}
            <button
              type="button"
              onClick={onClearDept}
              className="text-fg-subtle hover:text-fg"
              aria-label="Retirer le filtre département"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      {/* Compteurs par statut */}
      <CompteursStatut counts={counts} />

      {/* Filtres rapides : statut + recherche + export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {STATUTS_ALL.map(s => {
            const active = selectedStatuts.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onStatutsChange(toggle(selectedStatuts, s))}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  active
                    ? "bg-fg text-surface border-fg"
                    : "bg-surface-2 text-fg-muted border-border hover:border-border-strong"
                }`}
              >
                {STATUT_LABELS[s]}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-[220px]">
          <input
            type="search"
            placeholder="Recherche : dénomination / SIRET / ville"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>

        <ExportCSVButton query={exportQuery} />
      </div>

      {/* Filtres avancés : CP, date, région, tranches, type boutique, chaînes, dénomination */}
      <FiltresAvances
        cpPrefix={cpPrefix}
        onCpPrefixChange={onCpPrefixChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={onDateFromChange}
        onDateToChange={onDateToChange}
        regionOptions={regionOptions}
        selectedRegions={selectedRegions}
        onRegionsChange={onRegionsChange}
        trancheOptions={trancheOptions}
        selectedTranches={selectedTranches}
        onTranchesChange={onTranchesChange}
        shopTypeOptions={shopTypeOptions}
        selectedShopTypes={selectedShopTypes}
        onShopTypesChange={onShopTypesChange}
        includeChains={includeChains}
        onIncludeChainsChange={onIncludeChainsChange}
        scoreMin={scoreMin}
        onScoreMinChange={onScoreMinChange}
        hasDenomination={hasDenomination}
        onHasDenominationChange={onHasDenominationChange}
        onResetAll={onResetAdvanced}
      />

      {/* Table */}
      <div className="bg-surface-2 border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border text-xs">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-fg-muted">SIRET</th>
                <SortableTh<SortKey> label="Dénomination" sortKey="denomination" sort={sortState} onToggle={toggleSort} className="px-3 py-2" />
                <th className="px-3 py-2 font-medium text-fg-muted">Adresse</th>
                <th className="px-3 py-2 font-medium text-fg-muted">CP</th>
                <th className="px-3 py-2 font-medium text-fg-muted">Ville</th>
                <SortableTh<SortKey> label="Dpt" sortKey="dept_code" sort={sortState} onToggle={toggleSort} className="px-3 py-2" />
                <SortableTh<SortKey> label="Créé le" sortKey="date_creation" sort={sortState} onToggle={toggleSort} className="px-3 py-2" />
                <th className="px-3 py-2 font-medium text-fg-muted">Effectif</th>
                <SortableTh<SortKey> label="Score" sortKey="score_prospect" sort={sortState} onToggle={toggleSort} className="px-3 py-2" />
                <SortableTh<SortKey> label="Statut" sortKey="statut" sort={sortState} onToggle={toggleSort} className="px-3 py-2" />
                <SortableTh<SortKey> label="Dern. contact" sortKey="dernier_contact" sort={sortState} onToggle={toggleSort} className="px-3 py-2" />
                <th className="px-3 py-2 font-medium text-fg-muted text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border animate-pulse">
                    <td colSpan={12} className="px-3 py-3">
                      <div className="h-4 bg-surface-3 rounded" />
                    </td>
                  </tr>
                ))
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={12} className="px-3 py-6">
                    <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-md p-3 text-sm text-center">
                      {error}
                    </div>
                  </td>
                </tr>
              )}

              {!loading && !error && isEmpty && hasFilters && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center">
                    <p className="text-sm text-fg-muted mb-3">Aucun prospect ne correspond à ces critères.</p>
                    <button
                      type="button"
                      onClick={onResetFilters}
                      className="text-sm text-fg hover:text-fg-muted underline underline-offset-2"
                    >
                      Réinitialiser les filtres
                    </button>
                  </td>
                </tr>
              )}

              {!loading && !error && isEmpty && !hasFilters && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-sm text-fg-muted">
                    Aucun prospect importé — relancer l'import SIRENE depuis la page Admin.
                  </td>
                </tr>
              )}

              {!loading && !error && items.map(p => (
                <tr key={p.siret} className="border-b border-border hover:bg-surface-3/50 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs text-fg-muted whitespace-nowrap">{fmtSiret(p.siret)}</td>
                  <td className="px-3 py-2 text-fg font-medium">
                    <div className="flex flex-col gap-1">
                      {p.denomination ? (
                        <a
                          href={googleMapsUrl(p)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ouvrir dans Google Maps"
                          className="inline-flex items-center gap-1 hover:text-accent hover:underline underline-offset-2"
                        >
                          {p.denomination}
                          <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M11 5H5v14h14v-6" />
                          </svg>
                        </a>
                      ) : "—"}
                      {(p.shop_type_tags.length > 0 || p.is_chain) && (
                        <div className="flex flex-wrap gap-1">
                          {p.is_chain && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-normal" title="Chaîne nationale détectée">
                              Chaîne
                            </span>
                          )}
                          {p.shop_type_tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-fg-muted font-normal" title={`Type détecté : ${tag}`}>
                              {SHOP_TYPE_LABELS[tag] ?? tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-fg-muted text-xs">{p.adresse_voie ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-muted">{p.zip_code ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-muted">{p.city ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-muted">{p.dept_code ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-muted whitespace-nowrap">
                    {p.date_creation ? new Date(p.date_creation).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {p.tranche_effectif_libelle && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-surface-3 text-fg-muted">
                        {p.tranche_effectif_libelle}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium tabular-nums ${scoreClass(p.score_prospect)}`}
                      title={`Score : ${p.score_prospect}/100`}
                    >
                      {p.score_prospect}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatutBadge statut={p.statut} />
                  </td>
                  <td className="px-3 py-2 text-fg-muted whitespace-nowrap">
                    {p.dernier_contact ? new Date(p.dernier_contact).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onQuickStatusChange(p, "pas_interesse")}
                        disabled={p.statut === "pas_interesse"}
                        className="w-7 h-7 inline-flex items-center justify-center rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Marquer pas intéressé (1 clic)"
                        title="Marquer pas intéressé (1 clic)"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickStatusChange(p, "contacte")}
                        disabled={p.statut === "contacte"}
                        className="w-7 h-7 inline-flex items-center justify-center rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Marquer contacté (1 clic)"
                        title="Marquer contacté (1 clic)"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectProspect(p)}
                        className="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-surface-3 text-fg-muted hover:text-fg"
                        aria-label="Modifier statut (note + date)"
                        title="Modifier statut (note + date)"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && total > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <p className="text-xs text-fg-subtle">
              {fmtInt(total)} prospect{total > 1 ? "s" : ""} au total
            </p>
          </div>
        )}
      </div>

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        itemLabel="prospects"
      />
    </div>
  );
}
