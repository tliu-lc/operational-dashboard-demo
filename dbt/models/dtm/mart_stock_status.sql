-- Stock health per item/storehouse: rupture, surstock, dormant flags
WITH sales_30d AS (
    SELECT
        l.boutique_id,
        l.item_id,
        d.storehouse_id,
        SUM(l.quantity) AS sales_30d
    FROM {{ ref('stg_sale_lines') }} l
    JOIN {{ ref('stg_sale_documents') }} d
        ON  d.id          = l.document_id
        AND d.boutique_id = l.boutique_id
    WHERE d.is_valid_sale = TRUE
      AND d.document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      AND l.quantity > 0
    GROUP BY l.boutique_id, l.item_id, d.storehouse_id
),

last_moves AS (
    SELECT
        boutique_id,
        item_id,
        MAX(document_date) AS last_movement_date
    FROM {{ ref('stg_stock_movements') }}
    GROUP BY boutique_id, item_id
)

SELECT
    si.boutique_id,
    si.item_id,
    i.caption                                                       AS item_caption,
    si.storehouse_id,
    sh.caption                                                      AS storehouse_name,
    si.real_stock,
    si.stock_value,
    si.min_stock,
    si.max_stock,
    si.virtual_stock,
    COALESCE(s.sales_30d, 0)                                        AS sales_30d,
    lm.last_movement_date,
    CASE
        WHEN si.real_stock = 0                        THEN 0.0
        WHEN COALESCE(s.sales_30d, 0) = 0            THEN NULL
        ELSE ROUND(SAFE_DIVIDE(si.real_stock, COALESCE(s.sales_30d, 0) / 30.0), 0)
    END                                                             AS coverage_days,
    (si.real_stock <= 0 AND si.virtual_stock <= 0)                  AS is_rupture,
    (    si.real_stock  > si.max_stock
     AND si.max_stock   > 0
     AND NOT (si.real_stock <= 0 AND si.virtual_stock <= 0)
    )                                                               AS is_surstock,
    (    si.real_stock > 0
     AND NOT (si.real_stock <= 0 AND si.virtual_stock <= 0)
     AND (lm.last_movement_date IS NULL
          OR lm.last_movement_date < DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    )                                                               AS is_dormant,
    CASE
        WHEN si.real_stock <= 0 AND si.virtual_stock <= 0                           THEN 0
        WHEN si.real_stock  > si.max_stock AND si.max_stock > 0                     THEN 1
        WHEN si.real_stock  > 0
             AND (lm.last_movement_date IS NULL
                  OR lm.last_movement_date < DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)) THEN 2
        ELSE 3
    END                                                             AS urgency_rank

FROM {{ ref('stg_stock_items') }} si
LEFT JOIN {{ ref('stg_items') }}      i  ON i.boutique_id = si.boutique_id AND i.id  = si.item_id
LEFT JOIN {{ ref('stg_storehous') }}  sh ON sh.boutique_id = si.boutique_id AND sh.id = si.storehouse_id
LEFT JOIN sales_30d                   s  ON s.boutique_id = si.boutique_id
                                        AND s.item_id     = si.item_id
                                        AND s.storehouse_id = si.storehouse_id
LEFT JOIN last_moves                  lm ON lm.boutique_id = si.boutique_id AND lm.item_id = si.item_id
