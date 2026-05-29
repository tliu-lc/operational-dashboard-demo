"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  apiFetch,
  fetchProspects,
  fetchProspectsParDepartement,
  fetchProspectsFiltersOptions,
  patchProspectStatus,
  type Prospect,
  type ProspectsParDeptResponse,
  type ProspectsListResponse,
  type ProspectsFiltersOptions,
  type ProspectStatut,
  type ProspectListQuery,
} from "@/lib/api";
import { STATUT_LABELS } from "@/components/prospection/StatutBadge";
import HeaderProspection from "@/components/prospection/HeaderProspection";
import CompteurGlobal from "@/components/prospection/CompteurGlobal";
import SelecteurMetrique, { type MetriqueCarte } from "@/components/prospection/SelecteurMetrique";
import CarteFrance from "@/components/prospection/CarteFrance";
import CarteLegend from "@/components/prospection/CarteLegend";
import ListeProspects from "@/components/prospection/ListeProspects";
import StatutDrawer from "@/components/prospection/StatutDrawer";
import { quintilesForMetrique } from "@/components/prospection/carteColors";

interface GeoJson {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: unknown; properties: { code: string; nom: string } }[];
}

type SortKey = "denomination" | "zip_code" | "dept_code" | "date_creation" | "statut" | "dernier_contact" | "score_prospect";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export default function ProspectionPage() {
  // Carte + totaux
  const [agg, setAgg] = useState<ProspectsParDeptResponse | null>(null);
  const [aggLoading, setAggLoading] = useState(true);
  const [aggError, setAggError] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<GeoJson | null>(null);

  const [metrique, setMetrique] = useState<MetriqueCarte>("prospects_nets");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  // Liste
  const [list, setList] = useState<ProspectsListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>("dept_code");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedStatuts, setSelectedStatuts] = useState<ProspectStatut[]>([]);
  const [selectedTranches, setSelectedTranches] = useState<string[]>([]);

  // Filtres avancés
  const [cpPrefix, setCpPrefix] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  // Défaut "femme" — la majorité des boutiques 47.71Z ciblées par le grossiste
  // (le commercial peut décocher s'il veut voir tous les types)
  const [selectedShopTypes, setSelectedShopTypes] = useState<string[]>(["femme"]);
  const [includeChains, setIncludeChains] = useState(false); // défaut : chaînes EXCLUES (grossiste B2B)
  const [scoreMin, setScoreMin] = useState(0);
  const [hasDenomination, setHasDenomination] = useState(true); // défaut : exclure les [ND]/NULL
  const [filtersOptions, setFiltersOptions] = useState<ProspectsFiltersOptions | null>(null);

  // Drawer
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    msg: string;
    undo?: () => void;
  } | null>(null);

  // Debounce sur la recherche
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // Reset page sur changement de filtres
  const filtersKey = `${selectedDept ?? ""}|${selectedStatuts.join(",")}|${selectedTranches.join(",")}|${debouncedSearch}|${cpPrefix}|${dateFrom}|${dateTo}|${selectedRegions.join(",")}|${selectedShopTypes.join(",")}|${includeChains}|${scoreMin}|${hasDenomination}|${sort}:${dir}`;
  useEffect(() => { setPage(1); }, [filtersKey]);

  const listQuery: ProspectListQuery = useMemo(() => ({
    dept:      selectedDept ?? undefined,
    statut:    selectedStatuts.length > 0 ? selectedStatuts : undefined,
    tranche:   selectedTranches.length > 0 ? selectedTranches : undefined,
    search:    debouncedSearch || undefined,
    cp_prefix: cpPrefix || undefined,
    date_from: dateFrom || undefined,
    date_to:   dateTo   || undefined,
    region:    selectedRegions.length > 0 ? selectedRegions : undefined,
    has_denomination: hasDenomination,
    shop_type: selectedShopTypes.length > 0 ? selectedShopTypes : undefined,
    include_chains: includeChains,
    score_min: scoreMin || undefined,
    sort,
    dir,
    limit:   PAGE_SIZE,
    offset:  (page - 1) * PAGE_SIZE,
  }), [selectedDept, selectedStatuts, selectedTranches, debouncedSearch, cpPrefix, dateFrom, dateTo, selectedRegions, selectedShopTypes, includeChains, scoreMin, hasDenomination, sort, dir, page]);

  // Charge l'agrégat par département + GeoJSON (1x)
  const loadAgg = useCallback(() => {
    setAggLoading(true);
    setAggError(null);
    return Promise.all([
      fetchProspectsParDepartement(),
      geojson ? Promise.resolve(geojson) : apiFetch<GeoJson>("/api/geo/geojson"),
    ])
      .then(([a, gj]) => {
        setAgg(a);
        setGeojson(gj);
      })
      .catch(e => setAggError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAggLoading(false));
  }, [geojson]);

  useEffect(() => { loadAgg(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge les options de filtres (régions + tranches complètes) une seule fois
  useEffect(() => {
    fetchProspectsFiltersOptions()
      .then(setFiltersOptions)
      .catch(() => setFiltersOptions({ regions: [], tranches: [], shop_types: [], formes_juridiques: [] }));
  }, []);

  // Charge la liste à chaque changement de filtre/tri/page
  const loadList = useCallback(() => {
    setListLoading(true);
    setListError(null);
    return fetchProspects(listQuery)
      .then(setList)
      .catch(e => setListError(e instanceof Error ? e.message : String(e)))
      .finally(() => setListLoading(false));
  }, [listQuery]);

  useEffect(() => { loadList(); }, [loadList]);

  // Auto-dismiss toast — fenêtre plus longue (10s) si action undo dispo pour
  // laisser le temps à l'utilisateur de récupérer une mauvaise saisie 1-clic
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const ttl = toast.undo ? 10_000 : 3_500;
    toastTimer.current = setTimeout(() => setToast(null), ttl);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [toast]);

  const handleRefresh = useCallback(() => {
    loadAgg();
    loadList();
  }, [loadAgg, loadList]);

  const handleSelectDept = useCallback((code: string | null) => {
    setSelectedDept(prev => prev === code ? null : code);
    if (code && code !== selectedDept) {
      // Sélection dept = filtre granulaire qui remplace une région (mutuellement exclusifs)
      setSelectedRegions([]);
      // scroll vers la liste sur mobile / desktop
      setTimeout(() => {
        document.getElementById("liste-prospects")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [selectedDept]);

  const handleRegionsChange = useCallback((regions: string[]) => {
    setSelectedRegions(regions);
    if (regions.length > 0) {
      // Sélection région = vue plus large qui remplace un dept (mutuellement exclusifs)
      setSelectedDept(null);
    }
  }, []);

  const handleResetFilters = useCallback(() => {
    setSelectedDept(null);
    setSelectedStatuts([]);
    setSelectedTranches([]);
    setSearch("");
    setCpPrefix("");
    setDateFrom("");
    setDateTo("");
    setSelectedRegions([]);
    setSelectedShopTypes(["femme"]);
    setIncludeChains(false);
    setScoreMin(0);
    setHasDenomination(true);
  }, []);

  const handleResetAdvanced = useCallback(() => {
    setSelectedTranches([]);
    setCpPrefix("");
    setDateFrom("");
    setDateTo("");
    setSelectedRegions([]);
    setSelectedShopTypes(["femme"]);
    setIncludeChains(false);
    setScoreMin(0);
    setHasDenomination(true);
  }, []);

  // Quick action 1-clic depuis la liste — change le statut sans ouvrir le drawer.
  // Preserve la note + dernier_contact existants. Optimistic UI + rollback sur erreur.
  // Toast inclut un bouton "Annuler" (fenêtre 10s) qui restaure l'état exact d'avant.
  const handleQuickStatusChange = useCallback(async (prospect: Prospect, newStatut: ProspectStatut) => {
    const today = new Date().toISOString().slice(0, 10);
    const newDernierContact = newStatut === "a_contacter"
      ? prospect.dernier_contact
      : (prospect.dernier_contact || today);

    // Optimistic update
    setList(prev => prev ? {
      ...prev,
      items: prev.items.map(p =>
        p.siret === prospect.siret
          ? { ...p, statut: newStatut, dernier_contact: newDernierContact }
          : p,
      ),
    } : prev);

    const undoToPrevious = async () => {
      setToast(null);
      // Optimistic revert vers l'état exact d'origine
      setList(prev => prev ? {
        ...prev,
        items: prev.items.map(p => p.siret === prospect.siret ? prospect : p),
      } : prev);
      try {
        await patchProspectStatus(prospect.siret, {
          statut: prospect.statut,
          note: prospect.note,
          dernier_contact: prospect.dernier_contact,
        });
        setToast({ kind: "success", msg: "Modification annulée" });
        loadList();
      } catch (e) {
        setToast({ kind: "error", msg: e instanceof Error ? e.message : "Impossible d'annuler — réessayer" });
      }
    };

    try {
      await patchProspectStatus(prospect.siret, {
        statut: newStatut,
        note: prospect.note,          // preserve existing
        dernier_contact: newDernierContact,
      });
      setToast({
        kind: "success",
        msg: `${prospect.denomination ?? prospect.siret} → ${STATUT_LABELS[newStatut]}`,
        undo: undoToPrevious,
      });
      loadList(); // refetch pour counts globaux
    } catch (e) {
      // Rollback
      setList(prev => prev ? {
        ...prev,
        items: prev.items.map(p =>
          p.siret === prospect.siret
            ? { ...p, statut: prospect.statut, dernier_contact: prospect.dernier_contact }
            : p,
        ),
      } : prev);
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Erreur enregistrement statut" });
    }
  }, [loadList]);

  const handleSaved = useCallback((updated: Prospect) => {
    // Optimistic update : remplace la ligne dans la liste
    setList(prev => {
      if (!prev) return prev;
      const items = prev.items.map(p => p.siret === updated.siret ? updated : p);
      // Recalcule les counts_by_statut
      const counts = { a_contacter: 0, contacte: 0, pas_interesse: 0 };
      items.forEach(p => { counts[p.statut] = (counts[p.statut] ?? 0) + 1; });
      return { ...prev, items };
    });
    setEditingProspect(null);
    setToast({ kind: "success", msg: "Statut enregistré" });
    // Refetch async pour vraies métriques (counts globaux peuvent avoir changé)
    loadList();
  }, [loadList]);

  // Options tranche d'effectif — liste complète serveur (toutes tranches SIRENE,
  // pas uniquement celles présentes dans la page courante)
  const trancheOptions = useMemo(
    () => filtersOptions?.tranches ?? [],
    [filtersOptions],
  );
  const regionOptions = useMemo(
    () => filtersOptions?.regions ?? [],
    [filtersOptions],
  );
  const shopTypeOptions = useMemo(
    () => filtersOptions?.shop_types ?? [],
    [filtersOptions],
  );

  // Quintiles partagés entre carte et légende (cohérence visuelle)
  const quintiles = useMemo(
    () => quintilesForMetrique(agg?.departements ?? [], metrique),
    [agg, metrique],
  );

  const selectedDeptName = useMemo(() => {
    if (!selectedDept || !agg) return null;
    return agg.departements.find(d => d.code_departement === selectedDept)?.nom_departement ?? null;
  }, [selectedDept, agg]);

  return (
    <div className="space-y-6">
      <HeaderProspection
        lastImportDate={agg?.last_import_date ?? null}
        onRefresh={handleRefresh}
        refreshing={aggLoading || listLoading}
      />

      {aggError && (
        <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-md p-3 text-sm flex items-center justify-between">
          <span>Erreur de chargement de la carte : {aggError}</span>
          <button type="button" onClick={loadAgg} className="underline">Réessayer</button>
        </div>
      )}

      <CompteurGlobal totals={agg?.totals ?? null} loading={aggLoading} />

      {/* Section B — Carte */}
      <section className="bg-surface-2 border border-border rounded-xl shadow-sm p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs uppercase tracking-wider text-fg-subtle font-semibold">
            Carte de France
          </p>
          <SelecteurMetrique value={metrique} onChange={setMetrique} />
        </div>

        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <CarteFrance
            geojson={geojson}
            data={agg?.departements ?? []}
            metrique={metrique}
            quintiles={quintiles}
            selectedDept={selectedDept}
            onSelectDept={handleSelectDept}
          />
          <div className="lg:sticky lg:top-4 self-start">
            <CarteLegend metrique={metrique} quintiles={quintiles} />
          </div>
        </div>
      </section>

      {/* Section C — Liste */}
      <section id="liste-prospects" className="space-y-4">
        <h2 className="text-base font-semibold text-fg">Liste des prospects</h2>
        <ListeProspects
          items={list?.items ?? []}
          total={list?.total ?? 0}
          loading={listLoading}
          error={listError}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          sort={sort}
          dir={dir}
          onSortChange={(s, d) => { setSort(s); setDir(d); }}
          counts={list?.counts_by_statut ?? { a_contacter: 0, contacte: 0, pas_interesse: 0 }}
          search={search}
          onSearchChange={setSearch}
          selectedStatuts={selectedStatuts}
          onStatutsChange={setSelectedStatuts}
          selectedTranches={selectedTranches}
          onTranchesChange={setSelectedTranches}
          trancheOptions={trancheOptions}
          selectedDept={selectedDept}
          onClearDept={() => setSelectedDept(null)}
          deptName={selectedDeptName}
          onSelectProspect={setEditingProspect}
          onQuickStatusChange={handleQuickStatusChange}
          onResetFilters={handleResetFilters}
          exportQuery={listQuery}
          cpPrefix={cpPrefix}
          onCpPrefixChange={setCpPrefix}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          regionOptions={regionOptions}
          selectedRegions={selectedRegions}
          onRegionsChange={handleRegionsChange}
          shopTypeOptions={shopTypeOptions}
          selectedShopTypes={selectedShopTypes}
          onShopTypesChange={setSelectedShopTypes}
          includeChains={includeChains}
          onIncludeChainsChange={setIncludeChains}
          scoreMin={scoreMin}
          onScoreMinChange={setScoreMin}
          hasDenomination={hasDenomination}
          onHasDenominationChange={setHasDenomination}
          onResetAdvanced={handleResetAdvanced}
        />
      </section>

      <StatutDrawer
        prospect={editingProspect}
        onClose={() => setEditingProspect(null)}
        onSaved={handleSaved}
      />

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-slide-up flex items-center gap-3 ${
            toast.kind === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900"
              : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900"
          }`}
        >
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={toast.undo}
              className="font-semibold underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
            >
              Annuler
            </button>
          )}
        </div>
      )}
    </div>
  );
}
