-- Identifie pour chaque établissement SIRENE 47.71Z s'il est un prospect (= non-client)
-- ou un client déjà connu, en appliquant les règles de matching M2/M3.
-- Spec : vault/Data/DATA-014.md §3.2 (matching) + US-027 (règle d'identification)
WITH sirene AS (
  SELECT * FROM {{ ref('stg_prospects_sirene') }}
),

-- Référentiel clients consolidé toutes boutiques (ligne agrégée boutique_id='HIPP')
-- Filtre France pour aligner le périmètre avec SIRENE (France seulement).
clients AS (
  SELECT
    customer_key                                                              AS client_unified_key,
    customer_id                                                               AS client_id_top_boutique,
    customer_name                                                             AS client_name,
    siren                                                                     AS client_siren,
    zip_code                                                                  AS client_zip,
    -- Même normalisation que sirene.denomination_normalized (cf stg_prospects_sirene)
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          UPPER(COALESCE(customer_name, '')),
          r'[.,/_\-]', ''
        ),
        r'\s+(SARLU?|SASU?|SCEA|SCOP|EIRL|SCI|SCP|SNC|EURL|GAEC|GIE|SCM|EI|SA|SL)\s*$', ''
      ),
      r'\s+', ''
    )                                                                         AS client_name_normalized
  FROM {{ ref('mart_customer_detail') }}
  WHERE boutique_id = 'HIPP'
    AND is_france = TRUE
),

-- M2 : match SIREN (haute confiance) — un SIREN identique = même entreprise
match_m2 AS (
  SELECT
    s.siret,
    c.client_unified_key                                                      AS matched_unified_key,
    'M2_SIREN'                                                                AS match_rule
  FROM sirene s
  JOIN clients c
    ON c.client_siren IS NOT NULL
   AND c.client_siren = s.siren
),

-- M3 : match dénomination normalisée + CP (faible confiance — incertain)
-- Exclut les SIRET déjà matchés en M2 (priorité M2 > M3)
match_m3_candidates AS (
  SELECT
    s.siret,
    c.client_unified_key                                                      AS matched_unified_key,
    'M3_NOM_CP'                                                               AS match_rule
  FROM sirene s
  JOIN clients c
    ON c.client_name_normalized = s.denomination_normalized
   AND c.client_zip              = s.zip_code
   AND c.client_name_normalized != ''
  WHERE s.siret NOT IN (SELECT siret FROM match_m2)
),

match_final AS (
  SELECT * FROM match_m2
  UNION ALL
  SELECT * FROM match_m3_candidates
),

-- Sprint 19 / Filtre B : agrège la blacklist seed en un seul regex pour
-- détecter en un appel REGEXP_CONTAINS si une dénomination matche une
-- chaîne nationale connue. Concatène les ~100 patterns en `pattern1|pattern2|...`
chain_pattern AS (
  SELECT CONCAT(r'\b(', STRING_AGG(pattern, '|'), r')\b') AS regex
  FROM {{ ref('chains_blacklist') }}
)

SELECT
  s.siret,
  s.siren,
  s.nic,
  s.denomination,
  s.adresse_voie,
  s.adresse_complement,
  s.zip_code,
  s.city,
  s.dept_code,
  s.insee_code,
  s.date_creation,
  s.tranche_effectif_code,
  s.tranche_effectif_libelle,
  s.naf_code,
  s.etat_admin,
  s.categorie_juridique,
  s.forme_juridique,
  m.matched_unified_key,
  m.match_rule,
  -- is_prospect : R3 US-027 — les matches M3 (incertains) sont exclus par défaut
  CASE
    WHEN m.match_rule IS NULL      THEN TRUE   -- aucun match → prospect
    WHEN m.match_rule = 'M2_SIREN' THEN FALSE  -- match certain → client
    WHEN m.match_rule = 'M3_NOM_CP' THEN FALSE -- match incertain → exclu par défaut (R3)
    ELSE TRUE
  END                                                                         AS is_prospect,

  -- Sprint 19 / Filtre A : tags type de boutique (heuristique mots-clés).
  -- Une boutique peut avoir 0..N tags. shop_type_tags = [] = "indéterminé".
  -- L'utilisateur peut filtrer en choisissant un ou plusieurs tags + un
  -- toggle "inclure indéterminés" pour ne pas écarter les boutiques sans
  -- mot-clé descriptif (LE PETIT COIN, CHEZ MARIE…).
  ARRAY_CONCAT(
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(FEMME|FEMMES|LADY|LADIES|ELLE|WOMAN|WOMEN|MISS|MADAME|MADEMOISELLE|GIRL|GIRLS)\b'),
       ['femme'], []),
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(HOMME|HOMMES|MEN|GENT|MASCULIN|MR|MISTER)\b'),
       ['homme'], []),
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(ENFANT|ENFANTS|KIDS|BABY|BEBE|JUNIOR|MINI|MOMES|BAMBINI|MAMAN)\b'),
       ['enfant'], []),
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(SPORT|FITNESS|RUNNING|GYM|JOGGING|OUTDOOR|TRAIL|YOGA)\b'),
       ['sport'], []),
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(MARIAGE|MARIEE|CEREMONIE|NUPTIAL|EPOUS|WEDDING)\b'),
       ['mariage'], []),
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(FRIPERIE|VINTAGE|TROC|DEPOT.?VENTE|SECONDE.?MAIN|OCCASION)\b'),
       ['friperie'], []),
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(LINGERIE|SOUS.?VETEMENT|INTIM|CORSET|BUSTIER)\b'),
       ['lingerie'], []),
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(LUXE|LUXURY|COUTURE|HAUTE.?COUTURE|PREMIUM)\b'),
       ['luxe'], []),
    IF(REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')),
       r'\b(GRANDE.?TAILLE|XXL|CURVE|PLUS.?SIZE|RONDE|RONDES)\b'),
       ['grande_taille'], [])
  )                                                                           AS shop_type_tags,

  -- Sprint 19 / Filtre B : booléen "appartient à une chaîne nationale connue".
  -- Match strict word-boundary sur la dénomination, contre le regex aggrégé
  -- depuis le seed `chains_blacklist`. Activable côté API via include_chains.
  COALESCE(
    REGEXP_CONTAINS(UPPER(COALESCE(s.denomination, '')), (SELECT regex FROM chain_pattern)),
    FALSE
  )                                                                           AS is_chain,

  -- Sprint 19 / Filtre D : score prospect 0-100 (heuristique multi-signaux).
  -- +30 si tranche d'effectif > 0 salarié (= vrai commerce, pas micro/solo)
  -- +20 si entreprise > 2 ans (stable, pas en cours de création/fermeture)
  -- +30 si société commerciale (SARL/SAS = a fait l'effort juridique vs EI)
  -- +20 si dénomination utilisable (non NULL, non [ND])
  -- Permet de trier/filtrer par score → cibler les top X% de leads qualifiés.
  (
    CASE WHEN s.tranche_effectif_code IS NOT NULL
              AND s.tranche_effectif_code NOT IN ('NN', '00') THEN 30 ELSE 0 END
    + CASE WHEN s.date_creation IS NOT NULL
                AND s.date_creation < DATE_SUB(CURRENT_DATE(), INTERVAL 2 YEAR) THEN 20 ELSE 0 END
    + CASE WHEN s.forme_juridique = 'societe' THEN 30 ELSE 0 END
    + CASE WHEN s.denomination IS NOT NULL
                AND TRIM(s.denomination) NOT IN ('', '[ND]') THEN 20 ELSE 0 END
  )                                                                           AS score_prospect
FROM sirene s
LEFT JOIN match_final m USING (siret)
