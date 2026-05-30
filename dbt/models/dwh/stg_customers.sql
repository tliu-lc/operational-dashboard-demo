{% set boutiques = [('hip', 'HIP'), ('sed', 'SED'), ('hpc', 'HPC'), ('acc', 'ACC')] %}

WITH unioned AS (
{% for code_lower, code_upper in boutiques %}
  SELECT
    '{{ code_upper }}'                                                              AS boutique_id,
    CAST(Id AS STRING)                                                              AS id,
    CONCAT('{{ code_upper }}', '|', CAST(Id AS STRING))                             AS customer_key,
    CAST(Name AS STRING)                                                            AS name,
    CAST(Civility AS STRING)                                                        AS civility,
    CAST(MainInvoicingAddress_ZipCode AS STRING)                                    AS zip_code,
    CAST(MainInvoicingAddress_City AS STRING)                                       AS city,
    CAST(MainInvoicingAddress_Address1 AS STRING)                                   AS address1,
    CAST(MainInvoicingAddress_Address2 AS STRING)                                   AS address2,
    SAFE_CAST(MainInvoicingAddress_Longitude AS FLOAT64)                            AS longitude,
    SAFE_CAST(MainInvoicingAddress_Latitude AS FLOAT64)                             AS latitude,
    -- dept_code inferred from zip code
    CASE
      WHEN CAST(MainInvoicingAddress_ZipCode AS STRING) LIKE '97%'
        THEN SUBSTR(CAST(MainInvoicingAddress_ZipCode AS STRING), 1, 3)
      WHEN LENGTH(CAST(MainInvoicingAddress_ZipCode AS STRING)) >= 4
        THEN SUBSTR(CAST(MainInvoicingAddress_ZipCode AS STRING), 1, 2)
      ELSE NULL
    END                                                                             AS dept_code,
    COALESCE(
      NULLIF(CAST(MainInvoicingAddress_CountryIsoCode AS STRING), ''),
      'FR'
    )                                                                               AS country_iso_code,
    CAST(MainInvoicingContact_Email AS STRING)                                      AS email,
    CAST(MainInvoicingContact_Phone AS STRING)                                      AS phone,
    -- Identifiants entreprise (souvent NULL pour particuliers / étrangers)
    -- Champs EBP réels : Siren (9 chiffres), IntracommunityVATNumber, NAF
    SAFE_CAST(Siren                  AS STRING)                                     AS siren,
    SAFE_CAST(IntracommunityVATNumber AS STRING)                                    AS vat_number,
    SAFE_CAST(NAF                    AS STRING)                                     AS naf_code,
    SAFE_CAST(SUBSTR(CAST(FirstInvoicingDate AS STRING), 1, 10) AS DATE)            AS first_invoice_date,
    SAFE_CAST(SUBSTR(CAST(LastInvoicingDate AS STRING), 1, 10) AS DATE)             AS last_invoice_date
  FROM `{{ env_var('GCP_PROJECT_ID') }}.demo_raw.raw_{{ code_lower }}_customer`
  WHERE Id IS NOT NULL
{% if not loop.last %} UNION ALL {% endif %}
{% endfor %}
),

-- Clé brute (SIREN / VAT) + nom normalisé pour détecter les collisions
keyed AS (
  SELECT
    *,
    CASE
      WHEN REGEXP_CONTAINS(REGEXP_REPLACE(COALESCE(siren, ''), r'\s+', ''), r'^\d{9}$')
        THEN 'SIREN:' || REGEXP_REPLACE(siren, r'\s+', '')
      WHEN LENGTH(REGEXP_REPLACE(COALESCE(vat_number, ''), r'\s+', '')) >= 8
        THEN 'VAT:' || UPPER(REGEXP_REPLACE(vat_number, r'\s+', ''))
      ELSE NULL
    END AS raw_key,
    -- Nom normalisé : UPPER, sans accents, ponctuation, suffixe corp ou année à la fin
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            UPPER(COALESCE(name, '')),
            r'[.,/_\-]', ''                              -- ponctuation
          ),
          r'\s+(SARLU?|SASU?|SCEA|SCOP|EIRL|SCI|SCP|SNC|EURL|GAEC|GIE|SCM|EI|SA|SL)\s*$', ''   -- suffixes corp
        ),
        r'\s*\d{4}\s*$', ''                              -- année à la fin (ex 2021)
      ),
      r'\s+', ''                                         -- espaces
    ) AS name_normalized
  FROM unioned
),

-- Compte combien de noms normalisés distincts partagent la même clé brute
key_stats AS (
  SELECT
    raw_key,
    COUNT(DISTINCT name_normalized) AS distinct_names
  FROM keyed
  WHERE raw_key IS NOT NULL
  GROUP BY raw_key
)

-- unified_key final : si raw_key valide ET un seul nom → on fusionne
-- Sinon (clé collision ou pas de clé) → fallback unique par boutique
SELECT
  k.* EXCEPT(raw_key, name_normalized),
  CASE
    WHEN k.raw_key IS NOT NULL AND COALESCE(ks.distinct_names, 0) = 1
      THEN k.raw_key
    ELSE 'FALLBACK:' || k.boutique_id || '|' || k.id
  END AS unified_key
FROM keyed k
LEFT JOIN key_stats ks ON ks.raw_key = k.raw_key
