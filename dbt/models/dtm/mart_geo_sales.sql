-- Revenue and customer counts by French département (last 12 months)
-- IMPORTANT : exclure les clients hors France/DOM-TOM pour éviter qu'un zip
-- étranger (ex: ES 41004 Séville) soit classé dans un département français.
WITH customers_geo AS (
    SELECT
        customer_key,
        boutique_id,
        longitude,
        latitude,
        CASE
            WHEN zip_code LIKE '97%' AND LENGTH(TRIM(zip_code)) >= 3
                THEN SUBSTR(TRIM(zip_code), 1, 3)
            WHEN SAFE_CAST(SUBSTR(TRIM(zip_code), 1, 2) AS INT64) IS NOT NULL
                THEN SUBSTR(TRIM(zip_code), 1, 2)
            ELSE NULL
        END AS dept_code
    FROM {{ ref('stg_customers') }}
    WHERE zip_code IS NOT NULL
      AND (country_iso_code IS NULL
           OR country_iso_code IN ('FR','GP','RE','GF','MQ','YT','PM','BL','MF'))
),

sales_12m AS (
    SELECT
        customer_key,
        boutique_id,
        id          AS document_id,
        amount_ht
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE
      AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
      AND customer_key IS NOT NULL
),

dept_by_boutique AS (
    SELECT
        cg.dept_code,
        s.boutique_id,
        SUM(s.amount_ht)               AS revenue_ht_12m,
        COUNT(DISTINCT s.customer_key) AS active_customers_12m,
        COUNT(DISTINCT s.document_id)  AS order_count_12m
    FROM sales_12m s
    JOIN customers_geo cg
        ON  cg.customer_key = s.customer_key
        AND cg.boutique_id  = s.boutique_id
    WHERE cg.dept_code IS NOT NULL
    GROUP BY cg.dept_code, s.boutique_id
)

SELECT
    d.dept_code,
    COALESCE(ref.dept_name, d.dept_code)                            AS dept_name,
    d.boutique_id,
    d.revenue_ht_12m,
    d.active_customers_12m,
    d.order_count_12m,
    CASE
        WHEN d.order_count_12m = 0 THEN NULL
        ELSE ROUND(SAFE_DIVIDE(d.revenue_ht_12m, d.order_count_12m), 2)
    END                                                             AS avg_basket_ht,
    (    (d.dept_code >= '01' AND d.dept_code <= '95')
      OR d.dept_code IN ('2A', '2B')
    )                                                               AS is_metro
FROM dept_by_boutique d
LEFT JOIN {{ ref('ref_departments') }} ref ON ref.dept_code = d.dept_code
ORDER BY boutique_id, revenue_ht_12m DESC
