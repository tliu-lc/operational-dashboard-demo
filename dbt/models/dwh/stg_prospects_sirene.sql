-- Staging SIRENE NAF 47.71Z — normalise les champs INSEE, infère dept_code,
-- décode trancheEffectifs, prépare denomination_normalized pour matching M3.
-- Sprint 19 phase 2 : JOIN avec raw_sirene_unitelegale (importé séparément)
-- pour récupérer categorieJuridique + raison sociale + nom/prénom EI.
-- Spec : vault/Data/DATA-014.md §3.1
WITH etab AS (
  SELECT * FROM `{{ env_var('GCP_PROJECT_ID') }}.hippocampe_raw.raw_sirene_etab`
),
unitelegale AS (
  SELECT
    siren,
    NULLIF(TRIM(denominationUniteLegale),       '') AS denomination_unite_legale,
    NULLIF(TRIM(categorieJuridiqueUniteLegale), '') AS categorie_juridique,
    NULLIF(TRIM(nomUniteLegale),                '') AS nom_unite_legale,
    NULLIF(TRIM(prenomUsuelUniteLegale),        '') AS prenom_unite_legale
  FROM `{{ env_var('GCP_PROJECT_ID') }}.hippocampe_raw.raw_sirene_unitelegale`
)
SELECT
  CAST(e.siret AS STRING)                                                     AS siret,
  CAST(e.siren AS STRING)                                                     AS siren,
  CAST(e.nic   AS STRING)                                                     AS nic,
  -- Dénomination affichée : enseigne > denom usuelle Etab > raison sociale UL
  -- > raison sociale Etab > NOM PRÉNOM (EI). Le JOIN avec unitelegale remplit
  -- les denominationUniteLegale qui sont absentes du fichier StockEtablissement.
  COALESCE(
    NULLIF(TRIM(e.enseigne1Etablissement),               ''),
    NULLIF(TRIM(e.denominationUsuelleEtablissement),     ''),
    u.denomination_unite_legale,
    NULLIF(TRIM(e.denominationUniteLegale),              ''),  -- fallback (vide en pratique)
    NULLIF(TRIM(CONCAT(COALESCE(u.nom_unite_legale, ''), ' ', COALESCE(u.prenom_unite_legale, ''))), '')
  )                                                                           AS denomination,
  -- Code catégorie juridique INSEE (1XXX = EI, 5XXX = société commerciale,
  -- 6XXX/7XXX = personne morale hors commerce, 9XXX = étrangère)
  u.categorie_juridique                                                       AS categorie_juridique,
  -- Bucket simplifié pour l'UI (Sprint 19 C)
  CASE
    WHEN u.categorie_juridique IS NULL                  THEN 'autre'
    WHEN STARTS_WITH(u.categorie_juridique, '1')        THEN 'ei'
    WHEN STARTS_WITH(u.categorie_juridique, '5')        THEN 'societe'
    ELSE                                                     'autre'
  END                                                                         AS forme_juridique,
  -- Adresse concaténée
  TRIM(CONCAT(
    COALESCE(e.numeroVoieEtablissement, ''), ' ',
    COALESCE(e.typeVoieEtablissement,   ''), ' ',
    COALESCE(e.libelleVoieEtablissement,'')
  ))                                                                          AS adresse_voie,
  e.complementAdresseEtablissement                                            AS adresse_complement,
  e.codePostalEtablissement                                                   AS zip_code,
  e.libelleCommuneEtablissement                                               AS city,
  e.codeCommuneEtablissement                                                  AS insee_code,
  -- dept_code inféré du CP. DROM (97x) sur 3 chiffres. Corse 2A/2B selon
  -- plage INSEE (CP 20000–20199 = Corse-du-Sud, 20200–20620 = Haute-Corse) :
  -- nécessaire pour la jointure avec ref_departments dans mart_prospects_par_departement.
  CASE
    WHEN e.codePostalEtablissement LIKE '97%'
      THEN SUBSTR(e.codePostalEtablissement, 1, 3)
    WHEN e.codePostalEtablissement LIKE '20%'
      THEN CASE
        WHEN SAFE_CAST(SUBSTR(e.codePostalEtablissement, 1, 5) AS INT64) BETWEEN 20000 AND 20199 THEN '2A'
        WHEN SAFE_CAST(SUBSTR(e.codePostalEtablissement, 1, 5) AS INT64) BETWEEN 20200 AND 20620 THEN '2B'
        ELSE '2A'
      END
    WHEN LENGTH(e.codePostalEtablissement) >= 4
      THEN SUBSTR(e.codePostalEtablissement, 1, 2)
    ELSE NULL
  END                                                                         AS dept_code,
  SAFE_CAST(e.dateCreationEtablissement AS DATE)                              AS date_creation,
  e.trancheEffectifsEtablissement                                             AS tranche_effectif_code,
  -- Libellé tranche effectif (table de référence INSEE)
  CASE e.trancheEffectifsEtablissement
    WHEN 'NN' THEN 'Non employeur ou inconnu'
    WHEN '00' THEN '0 salarié'
    WHEN '01' THEN '1 ou 2 salariés'
    WHEN '02' THEN '3 à 5 salariés'
    WHEN '03' THEN '6 à 9 salariés'
    WHEN '11' THEN '10 à 19 salariés'
    WHEN '12' THEN '20 à 49 salariés'
    WHEN '21' THEN '50 à 99 salariés'
    WHEN '22' THEN '100 à 199 salariés'
    WHEN '31' THEN '200 à 249 salariés'
    WHEN '32' THEN '250 à 499 salariés'
    WHEN '41' THEN '500 à 999 salariés'
    WHEN '42' THEN '1 000 à 1 999 salariés'
    WHEN '51' THEN '2 000 à 4 999 salariés'
    WHEN '52' THEN '5 000 à 9 999 salariés'
    WHEN '53' THEN '10 000 salariés et plus'
    ELSE NULL
  END                                                                         AS tranche_effectif_libelle,
  e.activitePrincipaleEtablissement                                           AS naf_code,
  e.etatAdministratifEtablissement                                            AS etat_admin,
  -- Dénomination normalisée pour matching M3 : upper + suppression ponctuation
  -- + suppression formes juridiques (SARL, SAS, ...) + suppression espaces.
  -- Doit être strictement identique au calcul appliqué à mart_customer_detail.customer_name
  -- dans mart_prospects (DATA-014 §3.2).
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        UPPER(COALESCE(
          NULLIF(TRIM(e.denominationUsuelleEtablissement), ''),
          u.denomination_unite_legale,
          NULLIF(TRIM(e.denominationUniteLegale), '')
        )),
        r'[.,/_\-]', ''
      ),
      r'\s+(SARLU?|SASU?|SCEA|SCOP|EIRL|SCI|SCP|SNC|EURL|GAEC|GIE|SCM|EI|SA|SL)\s*$', ''
    ),
    r'\s+', ''
  )                                                                           AS denomination_normalized
FROM etab e
LEFT JOIN unitelegale u ON u.siren = e.siren
WHERE e.etatAdministratifEtablissement = 'A'
  AND e.activitePrincipaleEtablissement = '47.71Z'
  AND e.siret IS NOT NULL
