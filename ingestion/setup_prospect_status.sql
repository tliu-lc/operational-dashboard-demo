-- Setup one-shot pour la page /prospection : crée le dataset éditable
-- hippocampe_prospects et la table prospect_status (UPSERT humain via API).
--
-- Spec : vault/Data/DATA-014.md §4
-- Règles d'usage :
--   R1 — défaut implicite : tout SIRET absent de prospect_status = 'a_contacter'
--   R2 — UPSERT autorisé uniquement si SIRET présent dans mart_prospects avec is_prospect=TRUE (contrôle API)
--   R3 — modifications = MERGE par SIRET (cf endpoint PATCH /api/prospects/{siret}/status)
--   R4 — dernier_contact calculé côté API (jour du PATCH si statut != 'a_contacter')
--
-- ⚠️ NE PAS exécuter via `dbt run` — la table doit PERSISTER entre les imports SIRENE.
-- Si elle était matérialisée par dbt, chaque rebuild écraserait les statuts saisis utilisateur.
--
-- Exécution (à faire UNE seule fois par environnement) :
--   bq --project_id=$GCP_PROJECT_ID query --use_legacy_sql=false < ingestion/setup_prospect_status.sql
-- ou via la console BigQuery (UI > Query editor).

-- 1. Dataset éditable (distinct de hippocampe_dtm, qui est rebuild par dbt)
-- Location alignée sur hippocampe_raw / dwh / dtm (europe-west1) — sinon
-- l'API planterait sur le JOIN cross-location mart_prospects ↔ prospect_status.
CREATE SCHEMA IF NOT EXISTS `hippocampe_prospects`
OPTIONS (
  location = 'europe-west1',
  description = 'Dataset éditable — statuts prospects saisis manuellement via la page /prospection (Sprint 17). Distinct de hippocampe_dtm pour ne JAMAIS être recréé par dbt run.'
);

-- 2. Table prospect_status — schéma DATA-014 §4
-- BigQuery n'a pas de PRIMARY KEY enforced : unicité par SIRET garantie côté API (MERGE).
CREATE TABLE IF NOT EXISTS `hippocampe_prospects.prospect_status` (
  siret           STRING    NOT NULL OPTIONS (description = 'SIRET 14 chiffres — clé logique'),
  statut          STRING    NOT NULL OPTIONS (description = "Énuméré 'a_contacter' | 'contacte' | 'pas_interesse' — contrôle pydantic API"),
  note            STRING             OPTIONS (description = 'Note libre (max 500 caractères — validation API)'),
  dernier_contact DATE               OPTIONS (description = 'Date du dernier changement de statut (≠ a_contacter) — calculée par API'),
  updated_at      TIMESTAMP NOT NULL OPTIONS (description = 'Audit — défaut CURRENT_TIMESTAMP() côté MERGE API'),
  updated_by      STRING             OPTIONS (description = 'Placeholder MVP — toujours NULL (pas d\'auth utilisateur)')
)
OPTIONS (
  description = 'Statuts prospects édités humainement. UPSERT par SIRET via PATCH /api/prospects/{siret}/status.'
);
