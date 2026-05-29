-- Log des matches M3 (dénomination normalisée + CP) — incertains exclus de is_prospect
-- par défaut. Permet à un humain de réviser et requalifier manuellement.
-- Spec : vault/Data/DATA-014.md §3.3
SELECT
  p.siret,
  p.denomination,
  p.zip_code,
  p.city,
  p.dept_code,
  p.matched_unified_key,
  c.customer_name                                                             AS matched_client_name,
  c.zip_code                                                                  AS matched_client_zip,
  -- Score de similarité : 1.0 tant que M3 = match strict après normalisation.
  -- Placeholder pour future Levenshtein/Jaro-Winkler (raffinement post-MVP).
  1.0                                                                         AS similarity_score
FROM {{ ref('mart_prospects') }} p
LEFT JOIN {{ ref('mart_customer_detail') }} c
  ON c.customer_key = p.matched_unified_key
 AND c.boutique_id = 'HIPP'
WHERE p.match_rule = 'M3_NOM_CP'
