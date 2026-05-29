-- Revenue and customer counts by country (excluding France group)
WITH country_sales AS (
    SELECT
        c.country_iso_code,
        c.boutique_id,
        COUNT(DISTINCT c.customer_key)     AS nb_customers_total,
        COUNT(DISTINCT s.customer_key)     AS nb_customers_actifs_12m,
        COALESCE(SUM(s.amount_ht), 0)      AS ca_12m_ht,
        COUNT(DISTINCT s.id)               AS nb_orders_12m
    FROM {{ ref('stg_customers') }} c
    LEFT JOIN {{ ref('stg_sale_documents') }} s
        ON  s.customer_key = c.customer_key
        AND s.boutique_id  = c.boutique_id
        AND s.is_valid_sale = TRUE
        AND s.document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
    WHERE c.country_iso_code IS NOT NULL
      AND c.country_iso_code != ''
    GROUP BY c.country_iso_code, c.boutique_id
)

SELECT
    country_iso_code,
    boutique_id,
    nb_customers_total,
    nb_customers_actifs_12m,
    ca_12m_ht,
    nb_orders_12m,
    CASE
        WHEN country_iso_code IN ('FR','GP','RE','GF','MQ','YT','PM','BL','MF')
        THEN TRUE
        ELSE FALSE
    END AS is_france_group
FROM country_sales
ORDER BY ca_12m_ht DESC
