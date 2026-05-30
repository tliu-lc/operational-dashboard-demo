{% set boutiques = [('sed', 'SED'), ('acc', 'ACC')] %}

WITH unioned AS (
{% for code_lower, code_upper in boutiques %}
  SELECT
    '{{ code_upper }}'                                      AS boutique_id,
    CAST(ItemId AS STRING)                                  AS item_id,
    CAST(StorehouseId AS STRING)                            AS storehouse_id,
    SAFE_CAST(RealStock AS FLOAT64)                         AS real_stock,
    SAFE_CAST(StockValue AS FLOAT64)                        AS stock_value,
    SAFE_CAST(MinStock AS FLOAT64)                          AS min_stock,
    SAFE_CAST(MaxStock AS FLOAT64)                          AS max_stock,
    SAFE_CAST(VirtualStock AS FLOAT64)                      AS virtual_stock,
    SAFE_CAST(OrderedQuantity AS FLOAT64)                   AS ordered_quantity,
    SAFE_CAST(SuppliersOrderedQuantity AS FLOAT64)          AS suppliers_ordered_quantity
  FROM `{{ env_var('GCP_PROJECT_ID') }}.demo_raw.raw_{{ code_lower }}_stockitem`
  WHERE ItemId IS NOT NULL
{% if not loop.last %} UNION ALL {% endif %}
{% endfor %}
)

SELECT * FROM unioned
