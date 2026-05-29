-- Top 10 clients per item (all time) — used by the article catalogue drill-down
WITH ranked AS (
    SELECT
        l.item_id,
        sd.boutique_id,
        sd.customer_key,
        sd.customer_id,
        c.name                                              AS customer_name,
        SUM(l.quantity)                                     AS total_qty,
        SUM(l.net_amount_ht)                                AS total_ca_ht,
        COUNT(DISTINCT sd.id)                               AS nb_orders,
        MAX(sd.document_date)                               AS last_order_date,
        ROW_NUMBER() OVER (
            PARTITION BY l.item_id, sd.boutique_id
            ORDER BY SUM(l.net_amount_ht) DESC
        )                                                   AS rank
    FROM {{ ref('stg_sale_lines') }} l
    JOIN {{ ref('stg_sale_documents') }} sd
        ON sd.id = l.document_id AND sd.boutique_id = l.boutique_id
    JOIN {{ ref('stg_customers') }} c
        ON c.customer_key = sd.customer_key AND c.boutique_id = sd.boutique_id
    WHERE sd.is_valid_sale = TRUE
    GROUP BY l.item_id, sd.boutique_id, sd.customer_key, sd.customer_id, c.name
)

SELECT * FROM ranked
WHERE rank <= 10
