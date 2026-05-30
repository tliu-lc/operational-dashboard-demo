{% set boutiques = [('hip', 'HIP'), ('sed', 'SED'), ('hpc', 'HPC'), ('acc', 'ACC')] %}

WITH unioned AS (
{% for code_lower, code_upper in boutiques %}
  SELECT
    '{{ code_upper }}'                                                              AS boutique_id,
    CAST(Id AS STRING)                                                              AS id,
    CAST(DocumentId AS STRING)                                                      AS document_id,
    CAST(ItemId AS STRING)                                                          AS item_id,
    CAST(Description AS STRING)                                                     AS description,
    SAFE_CAST(Quantity AS FLOAT64)                                                  AS quantity,
    SAFE_CAST(SalePriceVatExcluded AS FLOAT64)                                      AS price_ht,
    SAFE_CAST(NetAmountVatExcluded AS FLOAT64)                                      AS net_amount_ht,
    SAFE_CAST(PurchasePrice AS FLOAT64)                                             AS purchase_price,
    -- margin_ht = net revenue - (purchase price × qty)
    COALESCE(SAFE_CAST(NetAmountVatExcluded AS FLOAT64), 0)
      - COALESCE(SAFE_CAST(PurchasePrice AS FLOAT64), 0)
        * COALESCE(SAFE_CAST(Quantity AS FLOAT64), 0)                               AS margin_ht
  FROM `{{ env_var('GCP_PROJECT_ID') }}.demo_raw.raw_{{ code_lower }}_saledocumentline`
  WHERE DocumentId IS NOT NULL AND CAST(DocumentId AS STRING) != ''
    AND ItemId IS NOT NULL AND CAST(ItemId AS STRING) != ''
{% if not loop.last %} UNION ALL {% endif %}
{% endfor %}
)

SELECT * FROM unioned
