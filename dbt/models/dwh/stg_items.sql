{% set boutiques = [('sed', 'SED'), ('acc', 'ACC')] %}

WITH unioned AS (
{% for code_lower, code_upper in boutiques %}
  SELECT
    '{{ code_upper }}'                                            AS boutique_id,
    CAST(Id AS STRING)                                            AS id,
    CAST(Caption AS STRING)                                       AS caption,
    CAST(FamilyId AS STRING)                                      AS family_id,
    CAST(SubFamilyId AS STRING)                                   AS sub_family_id,
    CAST(SupplierId AS STRING)                                    AS supplier_id,
    SAFE_CAST(PurchasePrice AS FLOAT64)                           AS purchase_price,
    SAFE_CAST(SalePriceVatExcluded AS FLOAT64)                    AS sale_price_ht,
    SAFE_CAST(RealStock AS FLOAT64)                               AS real_stock,
    SAFE_CAST(StockValue AS FLOAT64)                              AS stock_value,
    SAFE_CAST(ActiveState AS INT64)                               AS active_state,
    CASE
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'ROBE')             THEN 'ROBE'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'VESTE|BLAZER|VEST') THEN 'VESTE'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'PANTALON|PANT\b')  THEN 'PANTALON'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'JUPE')             THEN 'JUPE'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'PULL|PULLOVER|SWEAT') THEN 'PULL'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'CHEMIS')           THEN 'CHEMISIER'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'MANTEAU|PARKA|MANT') THEN 'MANTEAU'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'TOP\b|DEBARDEUR')  THEN 'TOP'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'SHORT')            THEN 'SHORT'
      WHEN REGEXP_CONTAINS(UPPER(CAST(Caption AS STRING)), r'SACS|SAC\b')       THEN 'SAC'
      ELSE 'AUTRE'
    END                                                           AS type_vetement
  FROM `{{ env_var('GCP_PROJECT_ID') }}.demo_raw.raw_{{ code_lower }}_item`
  WHERE Id IS NOT NULL
{% if not loop.last %} UNION ALL {% endif %}
{% endfor %}
)

SELECT * FROM unioned
