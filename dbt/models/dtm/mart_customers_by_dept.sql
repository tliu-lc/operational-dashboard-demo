-- Customers enriched with dept code and CA — used by the geo drill-down
WITH ca_total AS (
    SELECT
        customer_key,
        boutique_id,
        COUNT(DISTINCT id) AS nb_orders_total,
        SUM(amount_ht)     AS ca_total_ht
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE
    GROUP BY customer_key, boutique_id
)

SELECT
    c.customer_key,
    c.boutique_id,
    c.id                                        AS customer_id,
    c.name                                      AS customer_name,
    c.city,
    c.dept_code,
    COALESCE(ct.ca_total_ht, 0)                 AS ca_total_ht,
    COALESCE(rfm.monetary_12m, 0)               AS ca_12m_ht,
    rfm.last_order_date,
    rfm.recency_days,
    rfm.churn_alert,
    rfm.reorder_status,
    CASE
        WHEN rfm.customer_key IS NULL                                       THEN 'gris'
        WHEN rfm.churn_alert = TRUE AND rfm.recency_days >= 120             THEN 'rouge'
        WHEN rfm.churn_alert = TRUE OR rfm.reorder_status = 'en_retard'    THEN 'orange'
        ELSE 'vert'
    END                                         AS churn_color
FROM {{ ref('stg_customers') }} c
LEFT JOIN ca_total              ct  ON ct.customer_key = c.customer_key
                                   AND ct.boutique_id  = c.boutique_id
LEFT JOIN {{ ref('mart_customer_rfm') }} rfm ON rfm.customer_key = c.customer_key
                                             AND rfm.boutique_id  = c.boutique_id
WHERE c.dept_code IS NOT NULL
  -- Exclure les clients étrangers dont le zip ressemble à un dept français
  -- (ex: ES 41004 → dept 41 Loir-et-Cher = bug si on n'exclut pas)
  AND (c.country_iso_code IS NULL
       OR c.country_iso_code IN ('FR','GP','RE','GF','MQ','YT','PM','BL','MF'))
ORDER BY c.dept_code, COALESCE(ct.ca_total_ht, 0) DESC
