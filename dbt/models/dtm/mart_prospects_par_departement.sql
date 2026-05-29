-- Agrégat par département pour la carte choroplèthe page /prospection.
-- Spec : vault/Data/DATA-014.md §3.4
--
-- Décision DATA S18-01 : réutilisation du seed existant `ref_departments`
-- (101 lignes, codes 2A/2B + DROM) — pas de nouveau seed_departements_fr.csv
-- pour éviter la duplication de référentiel.
WITH base AS (
  SELECT
    dept_code,
    COUNT(*)                                                                  AS nb_sirene_total,
    COUNTIF(NOT is_prospect)                                                  AS nb_clients,
    COUNTIF(is_prospect)                                                      AS nb_prospects_nets,
    COUNTIF(match_rule = 'M3_NOM_CP')                                         AS nb_matches_incertains
  FROM {{ ref('mart_prospects') }}
  WHERE dept_code IS NOT NULL
  GROUP BY dept_code
),

dept_labels AS (
  SELECT dept_code, dept_name AS nom_departement
  FROM {{ ref('ref_departments') }}
)

SELECT
  b.dept_code                                                                 AS code_departement,
  COALESCE(d.nom_departement, b.dept_code)                                    AS nom_departement,
  b.nb_sirene_total,
  b.nb_clients,
  b.nb_prospects_nets,
  b.nb_matches_incertains,
  CASE
    WHEN b.nb_sirene_total = 0 THEN NULL
    ELSE ROUND(SAFE_DIVIDE(b.nb_clients, b.nb_sirene_total) * 100, 1)
  END                                                                         AS taux_penetration_pct
FROM base b
LEFT JOIN dept_labels d ON d.dept_code = b.dept_code
