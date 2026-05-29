-- Full customer profile: segment, churn color, CA, recency.
-- Ajoute des lignes virtuelles boutique_id='HIPP' qui agrègent SED+HIP par unified_key
-- (clé SIREN → VAT → fallback). presence = 'both' / 'sed_only' / 'hip_only'.

WITH ca_total AS (
    SELECT
        customer_key,
        boutique_id,
        COUNT(DISTINCT id) AS nb_orders_total,
        SUM(amount_ht)     AS ca_total_ht
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE
    GROUP BY customer_key, boutique_id
),

vip_threshold AS (
    SELECT
        boutique_id,
        APPROX_QUANTILES(ca_total_ht, 10)[SAFE_OFFSET(9)] AS ca_p90
    FROM ca_total
    GROUP BY boutique_id
),

ca_6m AS (
    SELECT
        customer_key,
        boutique_id,
        SUM(amount_ht) AS ca_6m_ht
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE
      AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
    GROUP BY customer_key, boutique_id
),

ca_6m_n1 AS (
    SELECT
        customer_key,
        boutique_id,
        SUM(amount_ht) AS ca_6m_n1_ht
    FROM {{ ref('stg_sale_documents') }}
    WHERE is_valid_sale = TRUE
      AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
      AND document_date <  DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
    GROUP BY customer_key, boutique_id
),

-- Lignes par boutique (équivalent du mart précédent + unified_key et presence=NULL)
per_boutique AS (
    SELECT
        c.customer_key,
        c.boutique_id,
        c.id                                                            AS customer_id,
        c.name                                                          AS customer_name,
        c.civility,
        c.address1,
        c.address2,
        c.zip_code,
        c.city,
        c.dept_code,
        c.country_iso_code,
        CASE
            WHEN c.country_iso_code IN ('FR','GP','RE','GF','MQ','YT','PM','BL','MF')
                OR c.country_iso_code IS NULL
            THEN TRUE
            ELSE FALSE
        END                                                             AS is_france,
        c.email,
        c.phone,
        c.siren,
        c.vat_number,
        c.naf_code,
        c.longitude,
        c.latitude,
        c.first_invoice_date,
        c.last_invoice_date,
        COALESCE(ct.nb_orders_total, 0)                                 AS nb_orders_total,
        COALESCE(ct.ca_total_ht, 0)                                     AS ca_total_ht,
        COALESCE(rfm.monetary_12m, 0)                                   AS ca_12m_ht,
        COALESCE(c6.ca_6m_ht, 0)                                        AS ca_6m_ht,
        COALESCE(c6n1.ca_6m_n1_ht, 0)                                   AS ca_6m_n1_ht,
        CASE
            WHEN COALESCE(c6n1.ca_6m_n1_ht, 0) = 0 THEN NULL
            ELSE ROUND(
                SAFE_DIVIDE(COALESCE(c6.ca_6m_ht, 0) - c6n1.ca_6m_n1_ht, c6n1.ca_6m_n1_ht) * 100, 1)
        END                                                             AS ca_trend_6m_pct,
        CASE
            WHEN COALESCE(ct.nb_orders_total, 0) > 0
            THEN ROUND(SAFE_DIVIDE(ct.ca_total_ht, ct.nb_orders_total), 2)
            ELSE 0
        END                                                             AS avg_basket_ht,
        COALESCE(rfm.last_order_date, c.last_invoice_date)              AS last_order_date,
        COALESCE(
            rfm.recency_days,
            DATE_DIFF(CURRENT_DATE(), c.last_invoice_date, DAY)
        )                                                               AS recency_days,
        rfm.churn_alert,
        rfm.reorder_status,
        rfm.rfm_global_score,
        rfm.frequency_12m,
        rfm.rfm_recency_score,
        rfm.rfm_frequency_score,
        rfm.rfm_monetary_score,
        CASE
            WHEN rfm.customer_key IS NULL                                       THEN 'gris'
            WHEN rfm.churn_alert = TRUE AND rfm.recency_days >= 120             THEN 'rouge'
            WHEN rfm.churn_alert = TRUE OR rfm.reorder_status = 'en_retard'     THEN 'orange'
            ELSE 'vert'
        END                                                             AS churn_color,
        CASE
            WHEN rfm.customer_key IS NULL                                       THEN 'inactif'
            WHEN c.first_invoice_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) THEN 'nouveau'
            WHEN rfm.recency_days > 365                                         THEN 'inactif'
            WHEN rfm.recency_days > 180                                         THEN 'endormi'
            WHEN ct.ca_total_ht >= vt.ca_p90
                 AND rfm.frequency_12m >= 3
                 AND rfm.recency_days <= 90                                     THEN 'vip'
            WHEN rfm.frequency_12m >= 2 AND rfm.recency_days <= 90              THEN 'actif'
            ELSE 'saisonnier'
        END                                                             AS segment,
        c.unified_key,
        CAST(NULL AS STRING)                                            AS presence
    FROM {{ ref('stg_customers') }} c
    LEFT JOIN ca_total              ct   ON ct.customer_key  = c.customer_key
                                         AND ct.boutique_id  = c.boutique_id
    LEFT JOIN vip_threshold         vt   ON vt.boutique_id   = c.boutique_id
    LEFT JOIN ca_6m                 c6   ON c6.customer_key  = c.customer_key
                                         AND c6.boutique_id  = c.boutique_id
    LEFT JOIN ca_6m_n1              c6n1 ON c6n1.customer_key = c.customer_key
                                         AND c6n1.boutique_id  = c.boutique_id
    LEFT JOIN {{ ref('mart_customer_rfm') }} rfm ON rfm.customer_key = c.customer_key
                                                 AND rfm.boutique_id  = c.boutique_id
),

-- Boutique gagnante par unified_key (plus gros CA total) — utilisée pour choisir
-- les champs d'identité (nom, adresse, contact) à mettre sur la ligne HIPP
top_boutique_per_key AS (
    SELECT
        unified_key,
        ARRAY_AGG(boutique_id ORDER BY ca_total_ht DESC LIMIT 1)[OFFSET(0)] AS top_boutique
    FROM per_boutique
    WHERE boutique_id IN ('SED', 'HIP')
      AND NOT STARTS_WITH(unified_key, 'FALLBACK:')
    GROUP BY unified_key
),

-- Lignes HIPP fusionnées : 1 par unified_key (SIREN ou VAT), agrège SED+HIP
hipp_merged AS (
    SELECT
        -- Identité prise depuis la boutique au plus gros CA
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.customer_name END)  AS customer_name,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.civility END)       AS civility,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.address1 END)       AS address1,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.address2 END)       AS address2,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.zip_code END)       AS zip_code,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.city END)           AS city,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.dept_code END)      AS dept_code,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.country_iso_code END) AS country_iso_code,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.is_france END)      AS is_france,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.email END)          AS email,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.phone END)          AS phone,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.siren END)          AS siren,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.vat_number END)     AS vat_number,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.naf_code END)       AS naf_code,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.longitude END)      AS longitude,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.latitude END)       AS latitude,
        -- ID réel de la boutique gagnante (pas de préfixe HIPP-)
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.customer_id END)    AS top_customer_id,
        ANY_VALUE(CASE WHEN p.boutique_id = t.top_boutique THEN p.customer_key END)   AS top_customer_key,
        MIN(p.first_invoice_date)                                                     AS first_invoice_date,
        MAX(p.last_invoice_date)                                                      AS last_invoice_date,
        -- Agrégations numériques
        SUM(p.nb_orders_total)                                                        AS nb_orders_total,
        SUM(p.ca_total_ht)                                                            AS ca_total_ht,
        SUM(p.ca_12m_ht)                                                              AS ca_12m_ht,
        SUM(p.ca_6m_ht)                                                               AS ca_6m_ht,
        SUM(p.ca_6m_n1_ht)                                                            AS ca_6m_n1_ht,
        SUM(COALESCE(p.frequency_12m, 0))                                             AS frequency_12m_sum,
        -- Dates
        MAX(p.last_order_date)                                                        AS last_order_date,
        MIN(p.recency_days)                                                           AS recency_days,
        -- Statuts : pire (le plus alarmant) des deux boutiques
        LOGICAL_OR(p.churn_alert)                                                     AS churn_alert,
        p.unified_key,
        -- Flag présence
        CASE
            WHEN COUNT(DISTINCT p.boutique_id) > 1 THEN 'both'
            WHEN MIN(p.boutique_id) = 'SED'        THEN 'sed_only'
            ELSE                                        'hip_only'
        END                                                                           AS presence,
        -- Compte de présence par boutique pour debug
        ARRAY_AGG(p.boutique_id ORDER BY p.boutique_id)                               AS source_boutiques
    FROM per_boutique p
    JOIN top_boutique_per_key t USING (unified_key)
    WHERE p.boutique_id IN ('SED', 'HIP')
      AND NOT STARTS_WITH(p.unified_key, 'FALLBACK:')
    GROUP BY p.unified_key
),

-- Clients sans SIREN/VAT : 1 ligne HIPP par client SED ou HIP (pas de fusion possible)
hipp_fallback AS (
    SELECT
        customer_name,
        civility,
        address1,
        address2,
        zip_code,
        city,
        dept_code,
        country_iso_code,
        is_france,
        email,
        phone,
        siren,
        vat_number,
        naf_code,
        longitude,
        latitude,
        first_invoice_date,
        last_invoice_date,
        nb_orders_total,
        ca_total_ht,
        ca_12m_ht,
        ca_6m_ht,
        ca_6m_n1_ht,
        COALESCE(frequency_12m, 0)                                                    AS frequency_12m_sum,
        last_order_date,
        recency_days,
        churn_alert,
        unified_key,
        CASE WHEN boutique_id = 'SED' THEN 'sed_only' ELSE 'hip_only' END             AS presence,
        [boutique_id]                                                                 AS source_boutiques,
        boutique_id                                                                   AS source_bid,
        customer_id                                                                   AS source_cid
    FROM per_boutique
    WHERE boutique_id IN ('SED', 'HIP')
      AND STARTS_WITH(unified_key, 'FALLBACK:')
),

-- Format final HIPP (merged) : on garde l'ID réel de la boutique gagnante
-- (= 1 client = 1 URL, qu'on soit sur Hippocampe ou sur sa boutique d'origine)
hipp_merged_final AS (
    SELECT
        top_customer_key                                                                AS customer_key,
        'HIPP'                                                                          AS boutique_id,
        top_customer_id                                                                 AS customer_id,
        customer_name, civility, address1, address2, zip_code, city, dept_code,
        country_iso_code, is_france, email, phone, siren, vat_number, naf_code,
        longitude, latitude, first_invoice_date, last_invoice_date,
        nb_orders_total, ca_total_ht, ca_12m_ht, ca_6m_ht, ca_6m_n1_ht,
        CASE
            WHEN ca_6m_n1_ht = 0 THEN NULL
            ELSE ROUND(SAFE_DIVIDE(ca_6m_ht - ca_6m_n1_ht, ca_6m_n1_ht) * 100, 1)
        END                                                                            AS ca_trend_6m_pct,
        CASE WHEN nb_orders_total > 0
             THEN ROUND(SAFE_DIVIDE(ca_total_ht, nb_orders_total), 2)
             ELSE 0
        END                                                                            AS avg_basket_ht,
        last_order_date,
        recency_days,
        churn_alert,
        CAST(NULL AS STRING)                                                           AS reorder_status,
        CAST(NULL AS INT64)                                                            AS rfm_global_score,
        frequency_12m_sum                                                              AS frequency_12m,
        CAST(NULL AS INT64) AS rfm_recency_score,
        CAST(NULL AS INT64) AS rfm_frequency_score,
        CAST(NULL AS INT64) AS rfm_monetary_score,
        -- Churn color recomputé : rouge si alerte + > 120j, orange si alerte, sinon vert
        CASE
            WHEN ca_total_ht = 0                                                       THEN 'gris'
            WHEN churn_alert AND recency_days >= 120                                   THEN 'rouge'
            WHEN churn_alert                                                           THEN 'orange'
            ELSE 'vert'
        END                                                                            AS churn_color,
        -- Segment recomputé sur valeurs agrégées
        CASE
            WHEN ca_total_ht = 0                                                       THEN 'inactif'
            WHEN first_invoice_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)       THEN 'nouveau'
            WHEN recency_days > 365                                                    THEN 'inactif'
            WHEN recency_days > 180                                                    THEN 'endormi'
            WHEN frequency_12m_sum >= 3 AND recency_days <= 90                         THEN 'vip'
            WHEN frequency_12m_sum >= 2 AND recency_days <= 90                         THEN 'actif'
            ELSE 'saisonnier'
        END                                                                            AS segment,
        unified_key,
        presence
    FROM hipp_merged
),

hipp_fallback_final AS (
    SELECT
        source_bid || '|' || source_cid                                                AS customer_key,
        'HIPP'                                                                          AS boutique_id,
        source_cid                                                                      AS customer_id,
        customer_name, civility, address1, address2, zip_code, city, dept_code,
        country_iso_code, is_france, email, phone, siren, vat_number, naf_code,
        longitude, latitude, first_invoice_date, last_invoice_date,
        nb_orders_total, ca_total_ht, ca_12m_ht, ca_6m_ht, ca_6m_n1_ht,
        CASE
            WHEN ca_6m_n1_ht = 0 THEN NULL
            ELSE ROUND(SAFE_DIVIDE(ca_6m_ht - ca_6m_n1_ht, ca_6m_n1_ht) * 100, 1)
        END                                                                            AS ca_trend_6m_pct,
        CASE WHEN nb_orders_total > 0
             THEN ROUND(SAFE_DIVIDE(ca_total_ht, nb_orders_total), 2)
             ELSE 0
        END                                                                            AS avg_basket_ht,
        last_order_date,
        recency_days,
        churn_alert,
        CAST(NULL AS STRING) AS reorder_status,
        CAST(NULL AS INT64)  AS rfm_global_score,
        frequency_12m_sum    AS frequency_12m,
        CAST(NULL AS INT64) AS rfm_recency_score,
        CAST(NULL AS INT64) AS rfm_frequency_score,
        CAST(NULL AS INT64) AS rfm_monetary_score,
        CASE
            WHEN ca_total_ht = 0                                                       THEN 'gris'
            WHEN churn_alert AND recency_days >= 120                                   THEN 'rouge'
            WHEN churn_alert                                                           THEN 'orange'
            ELSE 'vert'
        END                                                                            AS churn_color,
        CASE
            WHEN ca_total_ht = 0                                                       THEN 'inactif'
            WHEN first_invoice_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)       THEN 'nouveau'
            WHEN recency_days > 365                                                    THEN 'inactif'
            WHEN recency_days > 180                                                    THEN 'endormi'
            WHEN frequency_12m_sum >= 3 AND recency_days <= 90                         THEN 'vip'
            WHEN frequency_12m_sum >= 2 AND recency_days <= 90                         THEN 'actif'
            ELSE 'saisonnier'
        END                                                                            AS segment,
        unified_key,
        presence
    FROM hipp_fallback
)

-- Sortie finale : per-boutique + HIPP merged + HIPP fallback
-- Note : on supprime ca_6m_n1_ht de la sortie finale (utilisé seulement pour calculer le trend)
SELECT
    customer_key, boutique_id, customer_id, customer_name, civility,
    address1, address2, zip_code, city, dept_code, country_iso_code, is_france,
    email, phone, siren, vat_number, naf_code, longitude, latitude,
    first_invoice_date, last_invoice_date,
    nb_orders_total, ca_total_ht, ca_12m_ht, ca_6m_ht, ca_trend_6m_pct, avg_basket_ht,
    last_order_date, recency_days,
    churn_alert, reorder_status, rfm_global_score, frequency_12m,
    rfm_recency_score, rfm_frequency_score, rfm_monetary_score,
    churn_color, segment,
    unified_key, presence
FROM per_boutique

UNION ALL

SELECT
    customer_key, boutique_id, customer_id, customer_name, civility,
    address1, address2, zip_code, city, dept_code, country_iso_code, is_france,
    email, phone, siren, vat_number, naf_code, longitude, latitude,
    first_invoice_date, last_invoice_date,
    nb_orders_total, ca_total_ht, ca_12m_ht, ca_6m_ht, ca_trend_6m_pct, avg_basket_ht,
    last_order_date, recency_days,
    churn_alert, reorder_status, rfm_global_score, frequency_12m,
    rfm_recency_score, rfm_frequency_score, rfm_monetary_score,
    churn_color, segment,
    unified_key, presence
FROM hipp_merged_final

UNION ALL

SELECT
    customer_key, boutique_id, customer_id, customer_name, civility,
    address1, address2, zip_code, city, dept_code, country_iso_code, is_france,
    email, phone, siren, vat_number, naf_code, longitude, latitude,
    first_invoice_date, last_invoice_date,
    nb_orders_total, ca_total_ht, ca_12m_ht, ca_6m_ht, ca_trend_6m_pct, avg_basket_ht,
    last_order_date, recency_days,
    churn_alert, reorder_status, rfm_global_score, frequency_12m,
    rfm_recency_score, rfm_frequency_score, rfm_monetary_score,
    churn_color, segment,
    unified_key, presence
FROM hipp_fallback_final
