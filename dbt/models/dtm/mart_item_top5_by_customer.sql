-- Top 5 items purchased per customer over the last 12 months
WITH valid_lines AS (
    SELECT
        sd.customer_key,
        sd.boutique_id,
        sl.document_id,
        sl.item_id,
        sl.quantity
    FROM {{ ref('stg_sale_lines') }} sl
    JOIN {{ ref('stg_sale_documents') }} sd
        ON  sd.id          = sl.document_id
        AND sd.boutique_id = sl.boutique_id
    WHERE sd.is_valid_sale = TRUE
      AND sd.document_date IS NOT NULL
      AND sd.document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
      AND sl.quantity > 0
),

agg AS (
    SELECT
        customer_key,
        boutique_id,
        item_id,
        SUM(quantity)               AS total_qty_12m,
        COUNT(DISTINCT document_id) AS order_count_item
    FROM valid_lines
    GROUP BY customer_key, boutique_id, item_id
),

ranked AS (
    SELECT
        agg.customer_key,
        agg.boutique_id,
        agg.item_id,
        i.caption                                                   AS item_caption,
        agg.total_qty_12m,
        agg.order_count_item,
        SAFE_DIVIDE(agg.total_qty_12m, agg.order_count_item)        AS avg_qty_per_order,
        ROW_NUMBER() OVER (
            PARTITION BY agg.customer_key
            ORDER BY agg.total_qty_12m DESC
        )                                                           AS rank
    FROM agg
    LEFT JOIN {{ ref('stg_items') }} i
        ON  i.id          = agg.item_id
        AND i.boutique_id = agg.boutique_id
)

SELECT
    customer_key,
    boutique_id,
    rank,
    item_id,
    item_caption,
    total_qty_12m,
    order_count_item,
    avg_qty_per_order
FROM ranked
WHERE rank <= 5
