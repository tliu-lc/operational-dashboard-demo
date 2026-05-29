-- RFM model: recency/frequency/monetary scores + reorder status per customer
WITH valid_orders_24m AS (
    SELECT DISTINCT
        customer_key,
        boutique_id,
        customer_id,
        document_date
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE
      AND document_date IS NOT NULL
      AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
),

order_stats AS (
    SELECT
        customer_key,
        boutique_id,
        customer_id,
        COUNT(*)           AS order_count_24m,
        MAX(document_date) AS last_order_date
    FROM valid_orders_24m
    GROUP BY customer_key, boutique_id, customer_id
),

order_intervals AS (
    SELECT
        customer_key,
        DATE_DIFF(
            document_date,
            LAG(document_date) OVER (PARTITION BY customer_key ORDER BY document_date),
            DAY
        ) AS interval_days
    FROM valid_orders_24m
),

-- BigQuery: APPROX_QUANTILES gives approximate median
median_freq AS (
    SELECT
        customer_key,
        APPROX_QUANTILES(interval_days, 2)[SAFE_OFFSET(1)] AS median_frequency_days
    FROM order_intervals
    WHERE interval_days IS NOT NULL AND interval_days > 0
    GROUP BY customer_key
),

stats_12m AS (
    SELECT
        customer_key,
        COUNT(DISTINCT id)  AS frequency_12m,
        SUM(amount_ht)      AS monetary_12m
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE
      AND document_date IS NOT NULL
      AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
    GROUP BY customer_key
),

base AS (
    SELECT
        os.customer_key,
        os.boutique_id,
        os.customer_id,
        c.name                                                          AS customer_name,
        os.order_count_24m,
        os.last_order_date,
        mf.median_frequency_days,
        CASE
            WHEN mf.median_frequency_days IS NOT NULL
            THEN DATE_ADD(os.last_order_date, INTERVAL CAST(ROUND(mf.median_frequency_days) AS INT64) DAY)
            ELSE NULL
        END                                                             AS next_expected_date,
        DATE_DIFF(CURRENT_DATE(), os.last_order_date, DAY)             AS recency_days,
        COALESCE(s12.frequency_12m, 0)                                 AS frequency_12m,
        COALESCE(s12.monetary_12m, 0)                                  AS monetary_12m
    FROM order_stats os
    LEFT JOIN {{ ref('stg_customers') }}  c  ON c.customer_key  = os.customer_key
    LEFT JOIN median_freq                mf  ON mf.customer_key = os.customer_key
    LEFT JOIN stats_12m                 s12  ON s12.customer_key = os.customer_key
),

with_status AS (
    SELECT
        *,
        CASE
            WHEN next_expected_date IS NOT NULL
            THEN DATE_DIFF(CURRENT_DATE(), next_expected_date, DAY)
            ELSE NULL
        END AS days_overdue,
        CASE
            WHEN order_count_24m < 3 OR next_expected_date IS NULL         THEN 'insuffisant'
            WHEN DATE_DIFF(CURRENT_DATE(), next_expected_date, DAY) > 7    THEN 'en_retard'
            WHEN DATE_DIFF(CURRENT_DATE(), next_expected_date, DAY) BETWEEN 0 AND 7 THEN 'du_semaine'
            ELSE 'a_venir'
        END AS reorder_status
    FROM base
),

with_scores AS (
    SELECT
        *,
        NTILE(5) OVER (ORDER BY recency_days DESC)  AS rfm_recency_score,
        NTILE(5) OVER (ORDER BY frequency_12m ASC)  AS rfm_frequency_score,
        NTILE(5) OVER (ORDER BY monetary_12m ASC)   AS rfm_monetary_score
    FROM with_status
)

SELECT
    customer_key,
    boutique_id,
    customer_id,
    customer_name,
    order_count_24m,
    last_order_date,
    median_frequency_days,
    next_expected_date,
    days_overdue,
    reorder_status,
    recency_days,
    frequency_12m,
    monetary_12m,
    rfm_recency_score,
    rfm_frequency_score,
    rfm_monetary_score,
    rfm_recency_score + rfm_frequency_score + rfm_monetary_score AS rfm_global_score,
    recency_days > 60
        AND (rfm_recency_score + rfm_frequency_score + rfm_monetary_score) < 8
        AS churn_alert
FROM with_scores
