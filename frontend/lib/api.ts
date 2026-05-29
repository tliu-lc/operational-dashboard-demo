const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, public detail: string, path: string) {
    super(`API error ${status}: ${path} — ${detail}`);
  }
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const detail = (json as { detail?: string; error?: string })?.detail
                ?? (json as { error?: string })?.error
                ?? text
                ?? "Erreur inconnue";
    throw new ApiError(res.status, String(detail), path);
  }
  return (json as T);
}

// ---------- Types ----------

export interface RFMCustomer {
  customer_key: string;
  customer_id: string;
  customer_name: string;
  last_order_date: string | null;
  median_frequency_days: number | null;
  days_overdue: number | null;
  reorder_status: "en_retard" | "du_semaine" | "a_venir" | "insuffisant";
  order_count_24m: number;
  top5: { rank: number; item_id: string; item_caption: string | null; avg_qty_per_order: number | null }[];
}

export interface ChurnAlert {
  customer_key: string;
  customer_name: string;
  last_order_date: string | null;
  recency_days: number | null;
  monetary_12m: number | null;
  ca_trend: "hausse" | "baisse" | "stable" | null;
  ca_trend_pct: number | null;
  churn_level: "critique" | "modere" | "surveillance";
  churn_signals: string[];
  ca_total_ht: number | null;
}

export interface ClientListItem {
  customer_id: string;
  customer_name: string;
  boutique_id: string | null;
  dept_code: string | null;
  city: string | null;
  churn_color: "vert" | "orange" | "rouge" | "gris";
  segment: "vip" | "actif" | "saisonnier" | "nouveau" | "endormi" | "inactif";
  ca_total_ht: number | null;
  ca_12m_ht: number | null;
  last_order_date: string | null;
  recency_days: number | null;
  presence: "both" | "sed_only" | "hip_only" | null;
}

export interface BoutiqueSource {
  boutique_id: string;
  customer_id: string;
  customer_name: string;
  address1: string | null;
  address2: string | null;
  zip_code: string | null;
  city: string | null;
  country_iso_code: string | null;
  email: string | null;
  phone: string | null;
  ca_total_ht: number | null;
  ca_12m_ht: number | null;
  last_order_date: string | null;
}

export interface ClientDetail {
  customer_id: string;
  customer_key: string;
  customer_name: string;
  boutique_id: string;
  churn_color: string;
  ca_total_ht: number | null;
  ca_12m_ht: number | null;
  nb_orders_total: number | null;
  avg_basket_ht: number | null;
  last_order_date: string | null;
  recency_days: number | null;
  ca_trend_6m_pct: number | null;
  dept_code: string | null;
  city: string | null;
  address1: string | null;
  address2: string | null;
  zip_code: string | null;
  country_iso_code: string | null;
  is_france: boolean;
  email: string | null;
  phone: string | null;
  siren: string | null;
  vat_number: string | null;
  naf_code: string | null;
  total_overdue_ht: number | null;
  nb_invoices_overdue: number | null;
  overdue_invoices: OverdueInvoice[];
  presence?: "both" | "sed_only" | "hip_only" | null;
  boutique_sources?: BoutiqueSource[];
  unified_key?: string | null;
}

export interface OverdueInvoice {
  document_number: string;
  document_date: string | null;
  amount_ttc: number | null;
  balance_due: number | null;
  amount_paid: number | null;
  partial: boolean;
}

export interface MonthlyCA {
  month: string;
  ca_ht: number;
}

export interface Top5Item {
  rank: number;
  item_id: string;
  item_caption: string | null;
  total_qty_12m: number | null;
  order_count_item: number | null;
}

export interface LastOrder {
  document_date: string | null;
  amount_ht: number | null;
  document_number: string | null;
  nb_refs: number | null;
}

export interface ClientDetailResponse {
  detail: ClientDetail;
  monthly_ca: MonthlyCA[];
  full_history: MonthlyCA[];
  top5: Top5Item[];
  last_orders: LastOrder[];
}

export interface GeoDept {
  dept_code: string;
  dept_name: string;
  revenue_ht: number | null;
  active_customers: number;
  order_count: number;
  avg_basket_ht: number | null;
}

export interface GeoIntl {
  country_iso_code: string;
  country_iso3: string;
  country_name: string;
  nb_customers_total: number;
  nb_customers_actifs: number;
  ca_ht: number | null;
  nb_orders: number;
}

export interface StockItem {
  item_id: string;
  item_caption: string;
  storehouse_id: string;
  storehouse_name: string;
  real_stock: number | null;
  stock_value: number | null;
  coverage_days: number | null;
  urgency_rank: number;
  is_rupture: boolean;
  is_surstock: boolean;
  is_dormant: boolean;
}

export interface MonitoringMartInfo {
  exists: boolean;
  count: number | null;
}

export interface MonitoringHealth {
  bq_status: "ok" | "error";
  bq_error: string | null;
  last_document_date: string | null;
  days_since_last_doc: number | null;
  freshness_level: "vert" | "orange" | "rouge" | null;
  mart_counts: Record<string, MonitoringMartInfo> | null;
}

export interface MonitoringChurnCounts {
  critique: number;
  modere: number;
  surveillance: number;
}

export interface MonitoringStockCounts {
  rupture: number;
  surstock: number;
  dormant: number;
}

export interface MonitoringReorderCounts {
  en_retard: number;
  du_semaine: number;
}

export interface MonitoringSummary {
  boutique_id: string;
  churn: MonitoringChurnCounts | null;
  stock: MonitoringStockCounts | null;
  reorder: MonitoringReorderCounts | null;
}

export interface MonitoringStockCoverage {
  total_articles: number;
  pct_normal: number;
  pct_alerte: number;
}

export interface MonitoringDataQuality {
  pct_clients_suffisant: number;
  pct_articles_coverage_calculable: number;
}

export interface MonitoringKpis {
  boutique_id: string;
  ca_12m: number;
  ca_12m_precedents: number | null;
  ca_trend_pct: number | null;
  clients_actifs_12m: number;
  clients_total: number;
  nb_orders_12m: number;
  panier_moyen: number | null;
  stock_coverage: MonitoringStockCoverage | null;
  data_quality: MonitoringDataQuality | null;
}

export interface PerfItem {
  item_id: string;
  item_caption: string | null;
  type_vetement: string;
  qty_sold_season: number | null;
  revenue_ht_season: number | null;
  margin_ht_season: number | null;
  margin_rate: number | null;
  real_stock_current: number | null;
  is_current_season: boolean;
  revenue_ht_season_n1: number | null;
  ca_trend_season_pct: number | null;
}

export interface ArticleItem {
  item_id: string;
  item_caption: string;
  type_vetement: string;
  qty_sold_season: number;
  ca_season_ht: number | null;
  margin_ht_season: number | null;
  margin_rate: number | null;
  ca_trend_pct: number | null;
  ca_prev_season_ht: number | null;
  nb_clients_season: number;
  current_stock: number | null;
  sell_through_pct: number | null;
}

export interface ArticleClient {
  customer_key: string;
  customer_id: string;
  customer_name: string;
  total_qty: number;
  total_ca_ht: number | null;
  nb_orders: number;
  last_order_date: string | null;
}

export interface DailyFeedOrder {
  document_number: string | null;
  document_date: string | null;
  amount_ht: number;
  customer_id: string;
  customer_name: string;
  nb_refs: number;
}

export interface DailyFeedClient {
  customer_id: string;
  customer_name: string;
  first_order_date: string | null;
  city: string | null;
  ca_total_ht: number;
}

export interface DailyFeedStockout {
  item_id: string;
  item_caption: string;
  type_vetement: string;
  storehouse_id: string;
  storehouse_name: string | null;
}

export interface DailyFeed {
  reference_date: string | null;
  totals: { nb_orders: number; ca_ht: number };
  recent_orders: DailyFeedOrder[];
  new_clients: DailyFeedClient[];
  stockouts: DailyFeedStockout[];
}

// ---------- API functions ----------

export const fetchRFM = (boutique: string) =>
  apiFetch<{ customers: RFMCustomer[] }>(`/api/rfm?boutique=${boutique}`);

export const fetchChurn = (boutique: string) =>
  apiFetch<{ alerts: ChurnAlert[] }>(`/api/churn?boutique=${boutique}`);

export const fetchClientList = (boutique: string) =>
  apiFetch<{ customers: ClientListItem[] }>(`/api/client?boutique=${boutique}`);

export const fetchClientSearch = (q: string, boutique: string) =>
  apiFetch<{ customer_id: string; name: string }[]>(`/api/client/search?q=${encodeURIComponent(q)}&boutique=${boutique}`);

export const fetchClientDetail = (id: string, boutique: string) =>
  apiFetch<ClientDetailResponse>(`/api/client/detail?id=${encodeURIComponent(id)}&boutique=${boutique}`);

export interface DateRangeQuery { period?: number; from?: string; to?: string }

function rangeQS(r: DateRangeQuery, defaultPeriod = 12): string {
  if (r.from && r.to) return `from=${r.from}&to=${r.to}`;
  return `period=${r.period ?? defaultPeriod}`;
}

export const fetchGeoFrance = (boutique: string, range: DateRangeQuery = {}) =>
  apiFetch<{ by_dept: GeoDept[]; coverage: { total: number; no_zip: number } }>(
    `/api/geo/france?boutique=${boutique}&${rangeQS(range)}`
  );

export const fetchGeoIntl = (boutique: string, range: DateRangeQuery = {}) =>
  apiFetch<GeoIntl[]>(`/api/geo/international?boutique=${boutique}&${rangeQS(range)}`);

export const fetchGeoDept = (dept_code: string, boutique: string, range: DateRangeQuery = {}) =>
  apiFetch<{ customer_id: string; customer_name: string; city: string | null; ca_total_ht: number | null; ca_12m_ht: number | null }[]>(
    `/api/geo/dept/${dept_code}?boutique=${boutique}&${rangeQS(range)}`
  );

export const fetchAllCountries = () =>
  apiFetch<{ iso2: string; iso3: string; name: string }[]>("/api/geo/countries-all");

export const fetchGeoCountry = (country_iso2: string, boutique: string, range: DateRangeQuery = {}) =>
  apiFetch<{ customer_id: string; customer_name: string; city: string | null; ca_total_ht: number | null; ca_12m_ht: number | null; churn_color: string }[]>(
    `/api/geo/country/${country_iso2}?boutique=${boutique}&${rangeQS(range)}`
  );

export const fetchStock = (boutique: string) =>
  apiFetch<{ items: StockItem[]; summary: { n_rupture: number; n_surstock: number; n_dormant: number } }>(
    `/api/stock?boutique=${boutique}`
  );

export const fetchPerfSeasons = (boutique: string) =>
  apiFetch<{ season_label: string; is_current: boolean }[]>(`/api/perf-saison/seasons?boutique=${boutique}`);

export const fetchPerfSaison = (boutique: string, season: string) =>
  apiFetch<{ items: PerfItem[]; types: string[] }>(
    `/api/perf-saison?boutique=${boutique}&season=${encodeURIComponent(season)}`
  );

export const fetchMonitoringHealth = () =>
  apiFetch<MonitoringHealth>("/api/monitoring/health");

export const fetchMonitoringSummary = (boutique: string) =>
  apiFetch<MonitoringSummary>(`/api/monitoring/summary?boutique=${boutique}`);

export const fetchMonitoringKpis = (boutique: string) =>
  apiFetch<MonitoringKpis>(`/api/monitoring/kpis?boutique=${boutique}`);

export const fetchMonitoringFeed = (boutique: string) =>
  apiFetch<DailyFeed>(`/api/monitoring/feed?boutique=${boutique}`);

export const fetchArticles = (boutique: string, params?: { type?: string; sort?: string; search?: string }) => {
  const p = new URLSearchParams({ boutique });
  if (params?.type) p.set("type_vetement", params.type);
  if (params?.sort) p.set("sort", params.sort);
  if (params?.search) p.set("search", params.search);
  return apiFetch<{ season_label: string | null; types: string[]; items: ArticleItem[] }>(`/api/articles?${p}`);
};

export const fetchArticleClients = (itemId: string, boutique: string) =>
  apiFetch<ArticleClient[]>(`/api/articles/${encodeURIComponent(itemId)}/clients?boutique=${boutique}`);

export interface OverdueClient {
  customer_key: string;
  customer_id: string;
  customer_name: string;
  city: string | null;
  nb_invoices_overdue: number | null;
  total_overdue_ht: number | null;
  oldest_overdue_date: string | null;
  latest_overdue_date: string | null;
}

export interface PaymentsOverdue {
  boutique_id: string;
  total_overdue_ht: number;
  nb_clients: number;
  clients: OverdueClient[];
}

export const fetchPaymentsOverdue = (boutique: string) =>
  apiFetch<PaymentsOverdue>(`/api/payments/overdue?boutique=${boutique}`);

// ---------- Analyse ----------

export interface CaParJourPoint { date: string; ca: number; nb_orders: number }
export interface CaParMoisPoint  { mois: string; ca: number; nb_orders: number; nb_clients: number }
export interface VentesSemainePoint { dow: number; label: string; avg_ca: number; total_ca: number; nb_orders: number }
export interface TopClient { customer_name: string; ca: number; nb_orders: number; panier_moyen: number }

export interface DaysRangeQuery { days?: number; from?: string; to?: string }

function daysRangeQS(r: DaysRangeQuery, defaultDays = 90): string {
  if (r.from && r.to) return `from=${r.from}&to=${r.to}`;
  return `days=${r.days ?? defaultDays}`;
}

export const fetchAnalyseCaParJour = (boutique: string, range: DaysRangeQuery = {}) =>
  apiFetch<{ from: string; to: string; data: CaParJourPoint[] }>(
    `/api/analyse/ca-par-jour?boutique=${boutique}&${daysRangeQS(range)}`
  );

export const fetchAnalyseCaParMois = (boutique: string, range: DaysRangeQuery = {}) =>
  apiFetch<{ from?: string; to?: string; data: CaParMoisPoint[] }>(
    `/api/analyse/ca-par-mois?boutique=${boutique}&${daysRangeQS(range, 730)}`
  );

export const fetchAnalyseVentesParSemaine = (boutique: string, range: DaysRangeQuery = {}) =>
  apiFetch<{ from?: string; to?: string; data: VentesSemainePoint[] }>(
    `/api/analyse/ventes-par-semaine?boutique=${boutique}&${daysRangeQS(range, 365)}`
  );

export const fetchAnalyseTopClients = (boutique: string, range: DaysRangeQuery = {}) =>
  apiFetch<{ from: string; to: string; clients: TopClient[] }>(
    `/api/analyse/top-clients?boutique=${boutique}&${daysRangeQS(range)}`
  );

// ---------- Formatters ----------

export function fmtEuros(val: number | null | undefined, decimals = 0): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);
}

export function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("fr-FR");
  } catch {
    return val;
  }
}

export function fmtMonthLabel(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

// ---------- Prospection (US-025 / US-026 / US-027) ----------

export type ProspectStatut = "a_contacter" | "contacte" | "pas_interesse";

export interface ProspectDept {
  code_departement: string;
  nom_departement: string;
  nb_sirene_total: number;
  nb_clients: number;
  nb_prospects_nets: number;
  nb_matches_incertains: number;
  taux_penetration_pct: number | null;
}

export interface ProspectTotals {
  nb_sirene_total: number;
  nb_clients: number;
  nb_prospects_nets: number;
  nb_matches_incertains: number;
  taux_penetration_pct: number | null;
}

export interface ProspectsParDeptResponse {
  departements: ProspectDept[];
  totals: ProspectTotals | null;
  last_import_date: string | null;
  error?: string;
}

export interface Prospect {
  siret: string;
  siren: string | null;
  denomination: string | null;
  adresse_voie: string | null;
  adresse_complement: string | null;
  zip_code: string | null;
  city: string | null;
  dept_code: string | null;
  date_creation: string | null;
  tranche_effectif_code: string | null;
  tranche_effectif_libelle: string | null;
  etat_admin: string | null;
  categorie_juridique: string | null;
  forme_juridique: "societe" | "ei" | "autre" | null;
  score_prospect: number;
  shop_type_tags: string[];
  is_chain: boolean;
  statut: ProspectStatut;
  note: string | null;
  dernier_contact: string | null;
  updated_at: string | null;
}

export interface ProspectsListResponse {
  items: Prospect[];
  total: number;
  limit: number;
  offset: number;
  counts_by_statut: { a_contacter: number; contacte: number; pas_interesse: number };
  error?: string;
}

export interface ProspectListQuery {
  dept?: string | null;
  statut?: ProspectStatut[];
  tranche?: string[];
  search?: string;
  cp_prefix?: string;
  date_from?: string;
  date_to?: string;
  region?: string[];
  has_denomination?: boolean;
  shop_type?: string[];
  include_chains?: boolean;
  forme_juridique?: string[];
  score_min?: number;
  sort?: "denomination" | "zip_code" | "dept_code" | "date_creation" | "statut" | "dernier_contact" | "score_prospect";
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ProspectsFiltersOptions {
  regions: string[];
  tranches: { code: string; label: string }[];
  shop_types: string[];
  formes_juridiques: string[];
  error?: string;
}

function prospectsQS(q: ProspectListQuery): string {
  const sp = new URLSearchParams();
  if (q.dept)      sp.set("dept", q.dept);
  q.statut?.forEach(s => sp.append("statut", s));
  q.tranche?.forEach(t => sp.append("tranche", t));
  if (q.search)    sp.set("search", q.search);
  if (q.cp_prefix) sp.set("cp_prefix", q.cp_prefix);
  if (q.date_from) sp.set("date_from", q.date_from);
  if (q.date_to)   sp.set("date_to", q.date_to);
  q.region?.forEach(r => sp.append("region", r));
  // Toujours envoyer has_denomination — défaut backend = true, l'utilisateur peut le désactiver
  if (q.has_denomination === false) sp.set("has_denomination", "false");
  q.shop_type?.forEach(t => sp.append("shop_type", t));
  // include_chains défaut backend = false (chaînes exclues), on n'envoie que si true
  if (q.include_chains === true) sp.set("include_chains", "true");
  q.forme_juridique?.forEach(f => sp.append("forme_juridique", f));
  if (q.score_min != null && q.score_min > 0) sp.set("score_min", String(q.score_min));
  if (q.sort)      sp.set("sort", q.sort);
  if (q.dir)       sp.set("dir", q.dir);
  if (q.limit  != null) sp.set("limit",  String(q.limit));
  if (q.offset != null) sp.set("offset", String(q.offset));
  return sp.toString();
}

export const fetchProspectsParDepartement = () =>
  apiFetch<ProspectsParDeptResponse>("/api/prospects/par-departement");

export const fetchProspects = (q: ProspectListQuery = {}) =>
  apiFetch<ProspectsListResponse>(`/api/prospects?${prospectsQS(q)}`);

export const fetchProspectsFiltersOptions = () =>
  apiFetch<ProspectsFiltersOptions>("/api/prospects/filters/options");

export const exportProspectsUrl = (q: ProspectListQuery = {}) =>
  `${API_BASE}/api/prospects/export?${prospectsQS(q)}`;

export interface ProspectStatusPatch {
  statut: ProspectStatut;
  note: string | null;
  dernier_contact: string | null;
}

export const patchProspectStatus = (siret: string, patch: ProspectStatusPatch) =>
  apiPatch<ProspectStatusPatch & { siret: string }>(`/api/prospects/${encodeURIComponent(siret)}/status`, patch);

export function fmtSiret(siret: string): string {
  if (!siret || siret.length !== 14) return siret;
  return `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9, 14)}`;
}

/** URL Google Maps pour un prospect — denomination + adresse + ville.
 *  Note : la dénomination SIRENE est parfois la raison sociale légale et pas
 *  le nom commercial visible. Préférence USER (2026-05-20) : garder denomination
 *  malgré les mismatches, l'adresse aide Maps à converger quand le nom n'existe pas.
 */
export function googleMapsUrl(p: Pick<Prospect, "denomination" | "adresse_voie" | "zip_code" | "city">): string {
  const parts = [p.denomination, p.adresse_voie, p.zip_code, p.city]
    .filter(v => v && v !== "[ND]")
    .join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts || "boutique vêtements France")}`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(n);
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return `${n.toFixed(decimals).replace(".", ",")} %`;
}
