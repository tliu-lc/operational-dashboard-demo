-- Item performance aggregated by season (SS_YYYY / AH_YYYY)
WITH docs_with_season AS (
    SELECT
        id          AS document_id,
        boutique_id,
        document_date,
        CASE
            WHEN EXTRACT(MONTH FROM document_date) BETWEEN 3 AND 8
                THEN CONCAT('SS_', CAST(EXTRACT(YEAR FROM document_date) AS STRING))
            WHEN EXTRACT(MONTH FROM document_date) BETWEEN 9 AND 12
                THEN CONCAT('AH_', CAST(EXTRACT(YEAR FROM document_date) AS STRING))
            WHEN EXTRACT(MONTH FROM document_date) BETWEEN 1 AND 2
                THEN CONCAT('AH_', CAST(EXTRACT(YEAR FROM document_date) - 1 AS STRING))
        END AS season_label
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE AND document_date IS NOT NULL
),

season_agg AS (
    SELECT
        d.boutique_id,
        l.item_id,
        d.season_label,
        SUM(l.quantity)      AS qty_sold_season,
        SUM(l.net_amount_ht) AS revenue_ht_season,
        SUM(l.margin_ht)     AS margin_ht_season
    FROM {{ ref('stg_sale_lines') }} l
    JOIN docs_with_season d
        ON  d.document_id = l.document_id
        AND d.boutique_id = l.boutique_id
    WHERE l.quantity > 0
    GROUP BY d.boutique_id, l.item_id, d.season_label
),

seasons_with_n1 AS (
    SELECT
        sa.*,
        CASE
            WHEN sa.season_label LIKE 'SS_%'
                THEN CONCAT('SS_', CAST(CAST(SUBSTR(sa.season_label, 4) AS INT64) - 1 AS STRING))
            WHEN sa.season_label LIKE 'AH_%'
                THEN CONCAT('AH_', CAST(CAST(SUBSTR(sa.season_label, 4) AS INT64) - 1 AS STRING))
        END AS season_n1_label
    FROM season_agg sa
),

current_season AS (
    SELECT
        CASE
            WHEN EXTRACT(MONTH FROM CURRENT_DATE()) BETWEEN 3 AND 8
                THEN CONCAT('SS_', CAST(EXTRACT(YEAR FROM CURRENT_DATE()) AS STRING))
            WHEN EXTRACT(MONTH FROM CURRENT_DATE()) BETWEEN 9 AND 12
                THEN CONCAT('AH_', CAST(EXTRACT(YEAR FROM CURRENT_DATE()) AS STRING))
            WHEN EXTRACT(MONTH FROM CURRENT_DATE()) BETWEEN 1 AND 2
                THEN CONCAT('AH_', CAST(EXTRACT(YEAR FROM CURRENT_DATE()) - 1 AS STRING))
        END AS current_season_label
)

SELECT
    s.boutique_id,
    s.item_id,
    s.season_label,
    i.caption                                                           AS item_caption,
    i.type_vetement,
    s.qty_sold_season,
    s.revenue_ht_season,
    s.margin_ht_season,
    CASE
        WHEN s.revenue_ht_season IS NULL OR s.revenue_ht_season = 0 THEN NULL
        WHEN s.margin_ht_season IS NULL                             THEN NULL
        ELSE ROUND(SAFE_DIVIDE(s.margin_ht_season, s.revenue_ht_season) * 100.0, 1)
    END                                                                 AS margin_rate,
    i.real_stock                                                        AS real_stock_current,
    (s.season_label = cs.current_season_label)                          AS is_current_season,
    n1.revenue_ht_season                                                AS revenue_ht_season_n1,
    CASE
        WHEN n1.revenue_ht_season IS NULL OR n1.revenue_ht_season = 0 THEN NULL
        ELSE ROUND(
            SAFE_DIVIDE(s.revenue_ht_season - n1.revenue_ht_season, n1.revenue_ht_season) * 100.0, 1)
    END                                                                 AS ca_trend_season_pct

FROM seasons_with_n1 s
CROSS JOIN current_season cs
JOIN {{ ref('stg_items') }} i
    ON  i.boutique_id = s.boutique_id
    AND i.id          = s.item_id
LEFT JOIN season_agg n1
    ON  n1.boutique_id  = s.boutique_id
    AND n1.item_id      = s.item_id
    AND n1.season_label = s.season_n1_label

ORDER BY s.boutique_id, s.season_label, s.revenue_ht_season DESC
