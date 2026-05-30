{% set boutiques = [('sed', 'SED'), ('acc', 'ACC')] %}

WITH unioned AS (
{% for code_lower, code_upper in boutiques %}
  SELECT
    '{{ code_upper }}'                                                              AS boutique_id,
    CAST(ItemId AS STRING)                                                          AS item_id,
    SAFE_CAST(SUBSTR(CAST(DocumentDate AS STRING), 1, 10) AS DATE)                 AS document_date,
    CAST(DocumentNumber AS STRING)                                                  AS document_number,
    CAST(DocumentType AS STRING)                                                    AS document_type,
    CAST(DocumentSubType AS STRING)                                                 AS document_sub_type,
    SAFE_CAST(Quantity AS FLOAT64)                                                  AS quantity,
    SAFE_CAST(UnitCost AS FLOAT64)                                                  AS unit_cost,
    SAFE_CAST(Cost AS FLOAT64)                                                      AS cost,
    SAFE_CAST(RealStock AS FLOAT64)                                                 AS real_stock,
    CASE
      WHEN CAST(DocumentType AS STRING) = '0' AND CAST(DocumentSubType AS STRING) = '2' THEN 'achat'
      WHEN CAST(DocumentType AS STRING) = '1' AND CAST(DocumentSubType AS STRING) = '4' THEN 'vente'
      WHEN CAST(DocumentType AS STRING) = '1' AND CAST(DocumentSubType AS STRING) = '5' THEN 'sortie_autre'
      WHEN CAST(DocumentType AS STRING) = '1' AND CAST(DocumentSubType AS STRING) = '6' THEN 'transfert'
      ELSE 'autre'
    END                                                                             AS mouvement_type
  FROM `{{ env_var('GCP_PROJECT_ID') }}.demo_raw.raw_{{ code_lower }}_stockmovement`
  WHERE ItemId IS NOT NULL
{% if not loop.last %} UNION ALL {% endif %}
{% endfor %}
)

SELECT * FROM unioned
