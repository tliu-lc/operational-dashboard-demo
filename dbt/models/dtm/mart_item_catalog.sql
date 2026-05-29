-- Current-season item catalogue with sell-through, margin, client count
WITH current_season_label AS (
    SELECT
        CASE
            WHEN EXTRACT(MONTH FROM CURRENT_DATE()) BETWEEN 3 AND 8
                THEN CONCAT('SS_', CAST(EXTRACT(YEAR FROM CURRENT_DATE()) AS STRING))
            WHEN EXTRACT(MONTH FROM CURRENT_DATE()) BETWEEN 9 AND 12
                THEN CONCAT('AH_', CAST(EXTRACT(YEAR FROM CURRENT_DATE()) AS STRING))
            ELSE CONCAT('AH_', CAST(EXTRACT(YEAR FROM CURRENT_DATE()) - 1 AS STRING))
        END AS season_label
),

nb_clients_season AS (
    SELECT
        l.item_id,
        sd.boutique_id,
        COUNT(DISTINCT sd.customer_key) AS nb_clients_season
    FROM {{ ref('stg_sale_lines') }} l
    JOIN {{ ref('stg_sale_documents') }} sd
        ON sd.id = l.document_id AND sd.boutique_id = l.boutique_id
    CROSS JOIN current_season_label cs
    WHERE sd.is_valid_sale = TRUE
      AND (
        -- SS season: months 3-8 of the season year
        (cs.season_label LIKE 'SS_%'
         AND EXTRACT(MONTH FROM sd.document_date) BETWEEN 3 AND 8
         AND EXTRACT(YEAR FROM sd.document_date) = CAST(SUBSTR(cs.season_label, 4) AS INT64))
        OR
        -- AH season: months 9-12 of year N or months 1-2 of year N+1
        (cs.season_label LIKE 'AH_%'
         AND (
           (EXTRACT(MONTH FROM sd.document_date) BETWEEN 9 AND 12
            AND EXTRACT(YEAR FROM sd.document_date) = CAST(SUBSTR(cs.season_label, 4) AS INT64))
           OR
           (EXTRACT(MONTH FROM sd.document_date) BETWEEN 1 AND 2
            AND EXTRACT(YEAR FROM sd.document_date) = CAST(SUBSTR(cs.season_label, 4) AS INT64) + 1)
         ))
      )
    GROUP BY l.item_id, sd.boutique_id
),

stock_total AS (
    SELECT
        item_id,
        boutique_id,
        SUM(real_stock) AS total_stock
    FROM {{ ref('stg_stock_items') }}
    GROUP BY item_id, boutique_id
)

SELECT
    p.boutique_id,
    p.item_id,
    p.item_caption,
    p.type_vetement,
    p.qty_sold_season,
    p.revenue_ht_season                                             AS ca_season_ht,
    p.margin_ht_season,
    p.margin_rate,
    p.ca_trend_season_pct,
    p.revenue_ht_season_n1                                          AS ca_prev_season_ht,
    COALESCE(nc.nb_clients_season, 0)                               AS nb_clients_season,
    COALESCE(stk.total_stock, p.real_stock_current, 0)              AS current_stock,
    CASE
        WHEN COALESCE(p.qty_sold_season, 0) + COALESCE(stk.total_stock, COALESCE(p.real_stock_current, 0)) > 0
        THEN ROUND(
            SAFE_DIVIDE(
                COALESCE(p.qty_sold_season, 0),
                COALESCE(p.qty_sold_season, 0) + COALESCE(stk.total_stock, COALESCE(p.real_stock_current, 0))
            ) * 100.0, 1)
        ELSE NULL
    END                                                             AS sell_through_pct,
    cs.season_label

FROM {{ ref('mart_item_perf_by_season') }} p
CROSS JOIN current_season_label cs
LEFT JOIN nb_clients_season nc  ON nc.item_id    = p.item_id   AND nc.boutique_id = p.boutique_id
LEFT JOIN stock_total       stk ON stk.item_id   = p.item_id   AND stk.boutique_id = p.boutique_id
WHERE p.season_label = cs.season_label
  AND COALESCE(p.revenue_ht_season, 0) > 0
ORDER BY p.boutique_id, p.revenue_ht_season DESC
