-- Churn risk alerts: customers with degraded RFM signals
WITH monetary_prev AS (
    SELECT
        customer_key,
        SUM(amount_ht) AS monetary_prev_12m
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE
      AND document_date IS NOT NULL
      AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
      AND document_date <  DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
    GROUP BY customer_key
),

with_churn AS (
    SELECT
        r.customer_key,
        r.boutique_id,
        r.customer_id,
        r.customer_name,
        r.last_order_date,
        r.recency_days,
        r.frequency_12m,
        r.monetary_12m,
        r.rfm_recency_score,
        r.rfm_frequency_score,
        r.rfm_monetary_score,
        r.rfm_global_score,
        p.monetary_prev_12m,
        CASE
            WHEN r.recency_days > 180 OR r.rfm_global_score <= 5  THEN 'critique'
            WHEN r.recency_days > 90  AND r.rfm_global_score <= 8 THEN 'modere'
            WHEN r.recency_days > 60  AND r.rfm_global_score < 10 THEN 'surveillance'
        END AS churn_level,
        -- Build churn signals array (BQ: ARRAY from unnest of nullable expressions)
        ARRAY(
            SELECT x FROM UNNEST([
                CASE WHEN r.recency_days        > 60 THEN 'inactivite' END,
                CASE WHEN r.rfm_frequency_score <= 2 THEN 'freq_basse' END,
                CASE WHEN r.rfm_monetary_score  <= 2 THEN 'ca_faible'  END
            ]) AS x
            WHERE x IS NOT NULL
        ) AS churn_signals,
        CASE
            WHEN p.monetary_prev_12m IS NULL OR p.monetary_prev_12m = 0 THEN NULL
            WHEN SAFE_DIVIDE(r.monetary_12m - p.monetary_prev_12m, p.monetary_prev_12m) >  0.15 THEN 'hausse'
            WHEN SAFE_DIVIDE(r.monetary_12m - p.monetary_prev_12m, p.monetary_prev_12m) < -0.15 THEN 'baisse'
            ELSE 'stable'
        END AS ca_trend,
        CASE
            WHEN p.monetary_prev_12m IS NULL OR p.monetary_prev_12m = 0 THEN NULL
            ELSE ROUND(SAFE_DIVIDE(r.monetary_12m - p.monetary_prev_12m, p.monetary_prev_12m) * 100, 1)
        END AS ca_trend_pct
    FROM {{ ref('mart_customer_rfm') }} r
    LEFT JOIN monetary_prev p ON p.customer_key = r.customer_key
    WHERE r.order_count_24m >= 3
)

SELECT
    customer_key, boutique_id, customer_id, customer_name,
    last_order_date, recency_days, frequency_12m, monetary_12m,
    rfm_recency_score, rfm_frequency_score, rfm_monetary_score, rfm_global_score,
    monetary_prev_12m, churn_level, churn_signals, ca_trend, ca_trend_pct
FROM with_churn
WHERE churn_level IS NOT NULL
ORDER BY
    CASE churn_level
        WHEN 'critique'     THEN 0
        WHEN 'modere'       THEN 1
        WHEN 'surveillance' THEN 2
    END,
    recency_days DESC
