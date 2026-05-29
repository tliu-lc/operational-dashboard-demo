"""Gold layer: build mart_* tables from silver views."""
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "db" / "demo.duckdb"
REF_DIR = ROOT / "data" / "ref"


def run(con: duckdb.DuckDBPyConnection) -> None:
    print("Gold — calcul des tables mart_*")
    _create_mart_customer_rfm(con)
    _create_mart_item_top5(con)
    _create_mart_churn_alerts(con)
    _create_mart_stock_status(con)
    _create_mart_geo_sales(con)
    _create_mart_item_perf_by_season(con)
    _create_mart_customer_detail(con)
    _create_mart_customers_by_dept(con)
    _create_mart_geo_international(con)
    _create_mart_item_catalog(con)
    _create_mart_item_clients(con)
    con.execute("DROP VIEW IF EXISTS mart_item_perf_by_season_all")


def _create_mart_customer_rfm(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_customer_rfm AS

    WITH valid_orders_24m AS (
        -- Distinct dates per customer (CL-2: same-day orders deduplicated)
        SELECT DISTINCT
            customer_key,
            boutique_id,
            customer_id,
            document_date
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
          AND document_date IS NOT NULL
          AND document_date >= CURRENT_DATE - INTERVAL 24 MONTHS
    ),

    order_stats AS (
        SELECT
            customer_key,
            boutique_id,
            customer_id,
            COUNT(*)            AS order_count_24m,
            MAX(document_date)  AS last_order_date
        FROM valid_orders_24m
        GROUP BY customer_key, boutique_id, customer_id
    ),

    order_intervals AS (
        SELECT
            customer_key,
            DATEDIFF('day',
                LAG(document_date) OVER (PARTITION BY customer_key ORDER BY document_date),
                document_date
            ) AS interval_days
        FROM valid_orders_24m
    ),

    median_freq AS (
        SELECT
            customer_key,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY interval_days)
                AS median_frequency_days
        FROM order_intervals
        -- interval_days IS NULL for the first row per customer (no lag)
        WHERE interval_days IS NOT NULL AND interval_days > 0
        GROUP BY customer_key
    ),

    stats_12m AS (
        SELECT
            customer_key,
            COUNT(DISTINCT id)      AS frequency_12m,
            SUM(amount_ht)          AS monetary_12m
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
          AND document_date IS NOT NULL
          AND document_date >= CURRENT_DATE - INTERVAL 12 MONTHS
        GROUP BY customer_key
    ),

    base AS (
        SELECT
            os.customer_key,
            os.boutique_id,
            os.customer_id,
            c.name                                  AS customer_name,
            os.order_count_24m,
            os.last_order_date,
            mf.median_frequency_days,
            CASE
                WHEN mf.median_frequency_days IS NOT NULL
                THEN os.last_order_date
                     + CAST(ROUND(mf.median_frequency_days) AS INTEGER)
                ELSE NULL
            END                                     AS next_expected_date,
            DATEDIFF('day', os.last_order_date, CURRENT_DATE) AS recency_days,
            COALESCE(s12.frequency_12m, 0)          AS frequency_12m,
            COALESCE(s12.monetary_12m, 0)           AS monetary_12m
        FROM order_stats os
        LEFT JOIN stg_customers c  ON c.customer_key  = os.customer_key
        LEFT JOIN median_freq   mf ON mf.customer_key = os.customer_key
        LEFT JOIN stats_12m    s12 ON s12.customer_key = os.customer_key
    ),

    with_status AS (
        SELECT
            *,
            CASE
                WHEN next_expected_date IS NOT NULL
                THEN DATEDIFF('day', next_expected_date, CURRENT_DATE)
                ELSE NULL
            END AS days_overdue,
            CASE
                WHEN order_count_24m < 3 OR next_expected_date IS NULL
                    THEN 'insuffisant'
                WHEN DATEDIFF('day', next_expected_date, CURRENT_DATE) > 7
                    THEN 'en_retard'
                WHEN DATEDIFF('day', next_expected_date, CURRENT_DATE) BETWEEN 0 AND 7
                    THEN 'du_semaine'
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
    """)

    count = con.execute("SELECT COUNT(*) FROM mart_customer_rfm").fetchone()[0]
    print(f"  ✓ mart_customer_rfm : {count:,} lignes")
    _print_reorder_summary(con)


def _print_reorder_summary(con: duckdb.DuckDBPyConnection) -> None:
    rows = con.execute("""
        SELECT reorder_status, COUNT(*) AS n
        FROM mart_customer_rfm
        GROUP BY reorder_status
        ORDER BY n DESC
    """).fetchall()
    for status, n in rows:
        print(f"      {status}: {n:,}")


def _create_mart_item_top5(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_item_top5_by_customer AS

    WITH valid_lines AS (
        SELECT
            sd.customer_key,
            sd.boutique_id,
            sl.document_id,
            sl.item_id,
            sl.quantity
        FROM stg_sale_lines sl
        JOIN stg_sale_documents sd
            ON sd.id = sl.document_id
           AND sd.boutique_id = sl.boutique_id
        WHERE sd.is_valid_sale = TRUE
          AND sd.document_date IS NOT NULL
          AND sd.document_date >= CURRENT_DATE - INTERVAL 12 MONTHS
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
            i.caption                                                       AS item_caption,
            agg.total_qty_12m,
            agg.order_count_item,
            agg.total_qty_12m / NULLIF(agg.order_count_item, 0)            AS avg_qty_per_order,
            ROW_NUMBER() OVER (
                PARTITION BY agg.customer_key
                ORDER BY agg.total_qty_12m DESC
            )                                                               AS rank
        FROM agg
        LEFT JOIN stg_items i
            ON i.id = agg.item_id
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
    """)

    count = con.execute("SELECT COUNT(*) FROM mart_item_top5_by_customer").fetchone()[0]
    print(f"  ✓ mart_item_top5_by_customer : {count:,} lignes")


def _create_mart_churn_alerts(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_churn_alerts AS

    WITH monetary_prev AS (
        SELECT
            customer_key,
            SUM(amount_ht) AS monetary_prev_12m
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
          AND document_date IS NOT NULL
          AND document_date >= CURRENT_DATE - INTERVAL '24 months'
          AND document_date <  CURRENT_DATE - INTERVAL '12 months'
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
            list_filter(
                list_value(
                    CASE WHEN r.recency_days        > 60 THEN 'inactivite' END,
                    CASE WHEN r.rfm_frequency_score <= 2 THEN 'freq_basse' END,
                    CASE WHEN r.rfm_monetary_score  <= 2 THEN 'ca_faible'  END
                ),
                x -> x IS NOT NULL
            ) AS churn_signals,
            CASE
                WHEN p.monetary_prev_12m IS NULL OR p.monetary_prev_12m = 0 THEN NULL
                WHEN (r.monetary_12m - p.monetary_prev_12m) / p.monetary_prev_12m >  0.15 THEN 'hausse'
                WHEN (r.monetary_12m - p.monetary_prev_12m) / p.monetary_prev_12m < -0.15 THEN 'baisse'
                ELSE 'stable'
            END AS ca_trend,
            CASE
                WHEN p.monetary_prev_12m IS NULL OR p.monetary_prev_12m = 0 THEN NULL
                ELSE ROUND((r.monetary_12m - p.monetary_prev_12m) / p.monetary_prev_12m * 100, 1)
            END AS ca_trend_pct
        FROM mart_customer_rfm r
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
    """)

    con.execute("CREATE INDEX IF NOT EXISTS idx_churn_boutique ON mart_churn_alerts (boutique_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_churn_level    ON mart_churn_alerts (churn_level)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_churn_recency  ON mart_churn_alerts (recency_days DESC)")

    count = con.execute("SELECT COUNT(*) FROM mart_churn_alerts").fetchone()[0]
    print(f"  ✓ mart_churn_alerts : {count:,} lignes")
    _print_churn_summary(con)


def _print_churn_summary(con: duckdb.DuckDBPyConnection) -> None:
    rows = con.execute("""
        SELECT churn_level, COUNT(*) AS n
        FROM mart_churn_alerts
        GROUP BY churn_level
        ORDER BY CASE churn_level WHEN 'critique' THEN 0 WHEN 'modere' THEN 1 ELSE 2 END
    """).fetchall()
    for level, n in rows:
        print(f"      {level}: {n:,}")


def _create_mart_stock_status(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_stock_status AS

    WITH

    sales_30d AS (
        SELECT
            l.boutique_id,
            l.item_id,
            d.storehouse_id,
            SUM(l.quantity)    AS sales_30d
        FROM stg_sale_lines l
        JOIN stg_sale_documents d
            ON  d.id          = l.document_id
            AND d.boutique_id = l.boutique_id
        WHERE d.is_valid_sale = TRUE
          AND d.document_date >= CURRENT_DATE - INTERVAL '30 days'
          AND l.quantity > 0
        GROUP BY l.boutique_id, l.item_id, d.storehouse_id
    ),

    last_moves AS (
        SELECT
            boutique_id,
            item_id,
            MAX(document_date)  AS last_movement_date
        FROM stg_stock_movements
        GROUP BY boutique_id, item_id
    )

    SELECT
        si.boutique_id,
        si.item_id,
        i.caption                                                    AS item_caption,
        si.storehouse_id,
        sh.caption                                                   AS storehouse_name,
        si.real_stock,
        si.stock_value,
        si.min_stock,
        si.max_stock,
        si.virtual_stock,
        COALESCE(s.sales_30d, 0)                                     AS sales_30d,
        lm.last_movement_date,

        CASE
            WHEN si.real_stock = 0                          THEN 0.0
            WHEN COALESCE(s.sales_30d, 0) = 0              THEN NULL
            ELSE ROUND(si.real_stock / (COALESCE(s.sales_30d, 0) / 30.0), 0)
        END                                                          AS coverage_days,

        (si.real_stock <= 0 AND si.virtual_stock <= 0)               AS is_rupture,
        (    si.real_stock  > si.max_stock
         AND si.max_stock   > 0
         AND NOT (si.real_stock <= 0 AND si.virtual_stock <= 0)
        )                                                            AS is_surstock,
        (    si.real_stock > 0
         AND NOT (si.real_stock <= 0 AND si.virtual_stock <= 0)
         AND (lm.last_movement_date IS NULL
              OR lm.last_movement_date < CURRENT_DATE - INTERVAL '90 days')
        )                                                            AS is_dormant,

        CASE
            WHEN si.real_stock <= 0 AND si.virtual_stock <= 0                           THEN 0
            WHEN si.real_stock  > si.max_stock AND si.max_stock > 0                     THEN 1
            WHEN si.real_stock  > 0
                 AND (lm.last_movement_date IS NULL
                      OR lm.last_movement_date < CURRENT_DATE - INTERVAL '90 days')    THEN 2
            ELSE 3
        END                                                          AS urgency_rank

    FROM stg_stock_items si
    LEFT JOIN stg_items      i  ON  i.boutique_id = si.boutique_id AND i.id  = si.item_id
    LEFT JOIN stg_storehous  sh ON sh.boutique_id = si.boutique_id AND sh.id = si.storehouse_id
    LEFT JOIN sales_30d      s  ON  s.boutique_id = si.boutique_id
                                AND s.item_id     = si.item_id
                                AND s.storehouse_id = si.storehouse_id
    LEFT JOIN last_moves     lm ON lm.boutique_id = si.boutique_id AND lm.item_id = si.item_id
    """)

    con.execute("CREATE INDEX IF NOT EXISTS idx_stock_boutique   ON mart_stock_status (boutique_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_stock_storehouse ON mart_stock_status (boutique_id, storehouse_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_stock_urgency    ON mart_stock_status (urgency_rank, coverage_days)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_stock_rupture    ON mart_stock_status (is_rupture)")

    count = con.execute("SELECT COUNT(*) FROM mart_stock_status").fetchone()[0]
    print(f"  ✓ mart_stock_status : {count:,} lignes")
    rows = con.execute("""
        SELECT
            SUM(CASE WHEN is_rupture  THEN 1 ELSE 0 END) AS rupture,
            SUM(CASE WHEN is_surstock THEN 1 ELSE 0 END) AS surstock,
            SUM(CASE WHEN is_dormant  THEN 1 ELSE 0 END) AS dormant
        FROM mart_stock_status
    """).fetchone()
    print(f"      rupture:{rows[0]} surstock:{rows[1]} dormant:{rows[2]}")


def _create_mart_geo_sales(con: duckdb.DuckDBPyConnection) -> None:
    meta_path = (REF_DIR / "departments_meta.csv").as_posix()
    con.execute(f"""
    CREATE OR REPLACE TABLE ref_departments AS
    SELECT * FROM read_csv('{meta_path}', header=TRUE, delim=',', all_varchar=TRUE)
    """)

    con.execute("""
    CREATE OR REPLACE TABLE mart_geo_sales AS

    WITH

    customers_geo AS (
        SELECT
            customer_key,
            boutique_id,
            longitude,
            latitude,
            CASE
                WHEN zip_code LIKE '97%' AND LENGTH(TRIM(zip_code)) >= 3
                    THEN LEFT(zip_code, 3)
                WHEN TRY_CAST(LEFT(TRIM(zip_code), 2) AS INTEGER) IS NOT NULL
                    THEN LEFT(TRIM(zip_code), 2)
                ELSE NULL
            END AS dept_code
        FROM stg_customers
        WHERE zip_code IS NOT NULL
    ),

    sales_12m AS (
        SELECT
            customer_key,
            boutique_id,
            id          AS document_id,
            amount_ht
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
          AND document_date >= CURRENT_DATE - INTERVAL '12 months'
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
        COALESCE(ref.dept_name, d.dept_code)                         AS dept_name,
        d.boutique_id,
        d.revenue_ht_12m,
        d.active_customers_12m,
        d.order_count_12m,
        CASE
            WHEN d.order_count_12m = 0 THEN NULL
            ELSE ROUND(d.revenue_ht_12m / d.order_count_12m, 2)
        END                                                          AS avg_basket_ht,
        (    (d.dept_code >= '01' AND d.dept_code <= '95')
          OR d.dept_code IN ('2A', '2B')
        )                                                            AS is_metro
    FROM dept_by_boutique d
    LEFT JOIN ref_departments ref ON ref.dept_code = d.dept_code

    ORDER BY boutique_id, revenue_ht_12m DESC
    """)

    con.execute("CREATE INDEX IF NOT EXISTS idx_geo_boutique ON mart_geo_sales (boutique_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_geo_dept     ON mart_geo_sales (dept_code)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_geo_metro    ON mart_geo_sales (is_metro)")

    count = con.execute("SELECT COUNT(*) FROM mart_geo_sales").fetchone()[0]
    print(f"  ✓ mart_geo_sales : {count:,} lignes")


def _create_mart_item_perf_by_season(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_item_perf_by_season AS

    WITH

    docs_with_season AS (
        SELECT
            id          AS document_id,
            boutique_id,
            document_date,
            CASE
                WHEN MONTH(document_date) BETWEEN 3 AND 8
                    THEN 'SS_' || CAST(YEAR(document_date) AS VARCHAR)
                WHEN MONTH(document_date) BETWEEN 9 AND 12
                    THEN 'AH_' || CAST(YEAR(document_date) AS VARCHAR)
                WHEN MONTH(document_date) BETWEEN 1 AND 2
                    THEN 'AH_' || CAST(YEAR(document_date) - 1 AS VARCHAR)
            END AS season_label
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE AND document_date IS NOT NULL
    ),

    season_agg AS (
        SELECT
            d.boutique_id,
            l.item_id,
            d.season_label,
            SUM(l.quantity)       AS qty_sold_season,
            SUM(l.net_amount_ht)  AS revenue_ht_season,
            SUM(l.margin_ht)      AS margin_ht_season
        FROM stg_sale_lines l
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
                    THEN 'SS_' || CAST(CAST(SUBSTR(sa.season_label, 4) AS INTEGER) - 1 AS VARCHAR)
                WHEN sa.season_label LIKE 'AH_%'
                    THEN 'AH_' || CAST(CAST(SUBSTR(sa.season_label, 4) AS INTEGER) - 1 AS VARCHAR)
            END AS season_n1_label
        FROM season_agg sa
    ),

    current_season AS (
        SELECT
            CASE
                WHEN MONTH(CURRENT_DATE) BETWEEN 3 AND 8
                    THEN 'SS_' || CAST(YEAR(CURRENT_DATE) AS VARCHAR)
                WHEN MONTH(CURRENT_DATE) BETWEEN 9 AND 12
                    THEN 'AH_' || CAST(YEAR(CURRENT_DATE) AS VARCHAR)
                WHEN MONTH(CURRENT_DATE) BETWEEN 1 AND 2
                    THEN 'AH_' || CAST(YEAR(CURRENT_DATE) - 1 AS VARCHAR)
            END AS current_season_label
    )

    SELECT
        s.boutique_id,
        s.item_id,
        s.season_label,
        i.caption                                                       AS item_caption,
        i.type_vetement,
        s.qty_sold_season,
        s.revenue_ht_season,
        s.margin_ht_season,

        CASE
            WHEN s.revenue_ht_season IS NULL OR s.revenue_ht_season = 0 THEN NULL
            WHEN s.margin_ht_season IS NULL                             THEN NULL
            ELSE ROUND(s.margin_ht_season / s.revenue_ht_season * 100.0, 1)
        END                                                             AS margin_rate,

        i.real_stock                                                    AS real_stock_current,

        (s.season_label = cs.current_season_label)                      AS is_current_season,

        n1.revenue_ht_season                                            AS revenue_ht_season_n1,

        CASE
            WHEN n1.revenue_ht_season IS NULL OR n1.revenue_ht_season = 0 THEN NULL
            ELSE ROUND(
                (s.revenue_ht_season - n1.revenue_ht_season)
                / n1.revenue_ht_season * 100.0, 1)
        END                                                             AS ca_trend_season_pct,

        CASE s.boutique_id
            WHEN 'HIP' THEN 1
            WHEN 'SED' THEN 2
            WHEN 'HPC' THEN 3
            WHEN 'ACC' THEN 4
            ELSE 9
        END                                                             AS boutique_priority

    FROM seasons_with_n1 s
    CROSS JOIN current_season cs
    JOIN stg_items i
        ON  i.boutique_id = s.boutique_id
        AND i.id          = s.item_id
    LEFT JOIN season_agg n1
        ON  n1.boutique_id  = s.boutique_id
        AND n1.item_id      = s.item_id
        AND n1.season_label = s.season_n1_label

    ORDER BY s.boutique_id, s.season_label, s.revenue_ht_season DESC
    """)

    con.execute("CREATE INDEX IF NOT EXISTS idx_perf_boutique ON mart_item_perf_by_season (boutique_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_perf_season   ON mart_item_perf_by_season (season_label)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_perf_item     ON mart_item_perf_by_season (item_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_perf_revenue  ON mart_item_perf_by_season (revenue_ht_season DESC)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_perf_current  ON mart_item_perf_by_season (is_current_season)")

    count = con.execute("SELECT COUNT(*) FROM mart_item_perf_by_season").fetchone()[0]
    seasons = con.execute("SELECT COUNT(DISTINCT season_label) FROM mart_item_perf_by_season").fetchone()[0]
    print(f"  ✓ mart_item_perf_by_season : {count:,} lignes · {seasons} saisons")


def _create_mart_customer_detail(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_customer_detail AS

    WITH ca_total AS (
        SELECT
            customer_key,
            boutique_id,
            COUNT(DISTINCT id)  AS nb_orders_total,
            SUM(amount_ht)      AS ca_total_ht
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
        GROUP BY customer_key, boutique_id
    ),

    vip_threshold AS (
        SELECT
            boutique_id,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ca_total_ht) AS ca_p90
        FROM ca_total
        GROUP BY boutique_id
    ),

    ca_6m AS (
        SELECT
            customer_key,
            boutique_id,
            SUM(amount_ht) AS ca_6m_ht
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
          AND document_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY customer_key, boutique_id
    ),

    ca_6m_n1 AS (
        SELECT
            customer_key,
            boutique_id,
            SUM(amount_ht) AS ca_6m_n1_ht
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
          AND document_date >= CURRENT_DATE - INTERVAL '12 months'
          AND document_date <  CURRENT_DATE - INTERVAL '6 months'
        GROUP BY customer_key, boutique_id
    )

    SELECT
        c.customer_key,
        c.boutique_id,
        c.id                                                    AS customer_id,
        c.name                                                  AS customer_name,
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
        END                                                     AS is_france,
        c.email,
        c.phone,
        c.longitude,
        c.latitude,
        c.first_invoice_date,
        c.last_invoice_date,
        COALESCE(ct.nb_orders_total, 0)                         AS nb_orders_total,
        COALESCE(ct.ca_total_ht, 0)                             AS ca_total_ht,
        COALESCE(rfm.monetary_12m, 0)                           AS ca_12m_ht,
        COALESCE(c6.ca_6m_ht, 0)                                AS ca_6m_ht,
        CASE
            WHEN COALESCE(c6n1.ca_6m_n1_ht, 0) = 0 THEN NULL
            ELSE ROUND(
                (COALESCE(c6.ca_6m_ht, 0) - c6n1.ca_6m_n1_ht)
                / c6n1.ca_6m_n1_ht * 100, 1
            )
        END                                                     AS ca_trend_6m_pct,
        CASE
            WHEN COALESCE(ct.nb_orders_total, 0) > 0
            THEN ROUND(ct.ca_total_ht / ct.nb_orders_total, 2)
            ELSE 0
        END                                                     AS avg_basket_ht,
        rfm.last_order_date,
        rfm.recency_days,
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
            WHEN rfm.churn_alert = TRUE OR rfm.reorder_status = 'en_retard'    THEN 'orange'
            ELSE 'vert'
        END                                                     AS churn_color,
        CASE
            WHEN rfm.customer_key IS NULL                                       THEN 'inactif'
            WHEN c.first_invoice_date >= CURRENT_DATE - INTERVAL '90 days'     THEN 'nouveau'
            WHEN rfm.recency_days > 365                                         THEN 'inactif'
            WHEN rfm.recency_days > 180                                         THEN 'endormi'
            WHEN ct.ca_total_ht >= vt.ca_p90
                 AND rfm.frequency_12m >= 3
                 AND rfm.recency_days <= 90                                     THEN 'vip'
            WHEN rfm.frequency_12m >= 2 AND rfm.recency_days <= 90             THEN 'actif'
            ELSE 'saisonnier'
        END                                                     AS segment
    FROM stg_customers c
    LEFT JOIN ca_total          ct   ON ct.customer_key  = c.customer_key
                                     AND ct.boutique_id  = c.boutique_id
    LEFT JOIN vip_threshold     vt   ON vt.boutique_id   = c.boutique_id
    LEFT JOIN ca_6m             c6   ON c6.customer_key  = c.customer_key
                                     AND c6.boutique_id  = c.boutique_id
    LEFT JOIN ca_6m_n1          c6n1 ON c6n1.customer_key = c.customer_key
                                     AND c6n1.boutique_id  = c.boutique_id
    LEFT JOIN mart_customer_rfm rfm  ON rfm.customer_key = c.customer_key
                                     AND rfm.boutique_id  = c.boutique_id
    """)

    con.execute("CREATE INDEX IF NOT EXISTS idx_cdet_key      ON mart_customer_detail (customer_key)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_cdet_boutique ON mart_customer_detail (boutique_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_cdet_id       ON mart_customer_detail (customer_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_cdet_dept     ON mart_customer_detail (dept_code)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_cdet_country  ON mart_customer_detail (country_iso_code)")

    count = con.execute("SELECT COUNT(*) FROM mart_customer_detail").fetchone()[0]
    print(f"  ✓ mart_customer_detail : {count:,} lignes")


def _create_mart_customers_by_dept(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_customers_by_dept AS

    WITH ca_total AS (
        SELECT
            customer_key,
            boutique_id,
            COUNT(DISTINCT id) AS nb_orders_total,
            SUM(amount_ht)     AS ca_total_ht
        FROM stg_sale_documents
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
    FROM stg_customers c
    LEFT JOIN ca_total          ct  ON ct.customer_key = c.customer_key
                                   AND ct.boutique_id  = c.boutique_id
    LEFT JOIN mart_customer_rfm rfm ON rfm.customer_key = c.customer_key
                                   AND rfm.boutique_id  = c.boutique_id
    WHERE c.dept_code IS NOT NULL

    ORDER BY c.dept_code, COALESCE(ct.ca_total_ht, 0) DESC
    """)

    con.execute("CREATE INDEX IF NOT EXISTS idx_cbd_dept     ON mart_customers_by_dept (dept_code)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_cbd_boutique ON mart_customers_by_dept (boutique_id)")

    count = con.execute("SELECT COUNT(*) FROM mart_customers_by_dept").fetchone()[0]
    print(f"  ✓ mart_customers_by_dept : {count:,} lignes")


def _create_mart_geo_international(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_geo_international AS

    WITH country_sales AS (
        SELECT
            c.country_iso_code,
            c.boutique_id,
            COUNT(DISTINCT c.customer_key)     AS nb_customers_total,
            COUNT(DISTINCT s.customer_key)     AS nb_customers_actifs_12m,
            COALESCE(SUM(s.amount_ht), 0)      AS ca_12m_ht,
            COUNT(DISTINCT s.id)               AS nb_orders_12m
        FROM stg_customers c
        LEFT JOIN stg_sale_documents s
            ON  s.customer_key = c.customer_key
            AND s.boutique_id  = c.boutique_id
            AND s.is_valid_sale = TRUE
            AND s.document_date >= CURRENT_DATE - INTERVAL '12 months'
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
    """)

    count = con.execute("SELECT COUNT(*) FROM mart_geo_international").fetchone()[0]
    print(f"  ✓ mart_geo_international : {count:,} lignes")


def _create_mart_item_catalog(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
    CREATE OR REPLACE TABLE mart_item_catalog AS

    WITH current_season_label AS (
        SELECT CASE
            WHEN MONTH(CURRENT_DATE) BETWEEN 3 AND 8  THEN 'SS_' || CAST(YEAR(CURRENT_DATE) AS VARCHAR)
            WHEN MONTH(CURRENT_DATE) BETWEEN 9 AND 12 THEN 'AH_' || CAST(YEAR(CURRENT_DATE) AS VARCHAR)
            ELSE                                            'AH_' || CAST(YEAR(CURRENT_DATE) - 1 AS VARCHAR)
        END AS season_label
    ),

    -- nb clients uniques ayant acheté cet article sur la saison courante
    nb_clients_season AS (
        SELECT
            l.item_id,
            sd.boutique_id,
            COUNT(DISTINCT sd.customer_key) AS nb_clients_season
        FROM stg_sale_lines l
        JOIN stg_sale_documents sd
            ON sd.id = l.document_id AND sd.boutique_id = l.boutique_id
        CROSS JOIN current_season_label cs
        WHERE sd.is_valid_sale = TRUE
          AND CASE
                WHEN cs.season_label LIKE 'SS_%'
                    THEN MONTH(sd.document_date) BETWEEN 3 AND 8
                         AND YEAR(sd.document_date) = CAST(SUBSTR(cs.season_label, 4) AS INTEGER)
                WHEN cs.season_label LIKE 'AH_%'
                    THEN (
                        (MONTH(sd.document_date) BETWEEN 9 AND 12
                         AND YEAR(sd.document_date) = CAST(SUBSTR(cs.season_label, 4) AS INTEGER))
                        OR
                        (MONTH(sd.document_date) BETWEEN 1 AND 2
                         AND YEAR(sd.document_date) = CAST(SUBSTR(cs.season_label, 4) AS INTEGER) + 1)
                    )
                ELSE FALSE
              END
        GROUP BY l.item_id, sd.boutique_id
    ),

    -- stock agrégé tous dépôts par article
    stock_total AS (
        SELECT item_id, boutique_id,
               SUM(real_stock) AS total_stock
        FROM stg_stock_items
        GROUP BY item_id, boutique_id
    )

    SELECT
        p.boutique_id,
        p.item_id,
        p.item_caption,
        p.type_vetement,
        p.qty_sold_season,
        p.revenue_ht_season                                         AS ca_season_ht,
        p.margin_ht_season,
        p.margin_rate,
        p.ca_trend_season_pct,
        p.revenue_ht_season_n1                                      AS ca_prev_season_ht,
        COALESCE(nc.nb_clients_season, 0)                           AS nb_clients_season,
        COALESCE(stk.total_stock, p.real_stock_current, 0)          AS current_stock,
        CASE
            WHEN COALESCE(p.qty_sold_season, 0) + COALESCE(stk.total_stock, COALESCE(p.real_stock_current, 0)) > 0
            THEN ROUND(
                COALESCE(p.qty_sold_season, 0) /
                (COALESCE(p.qty_sold_season, 0) + COALESCE(stk.total_stock, COALESCE(p.real_stock_current, 0)))
                * 100.0, 1)
            ELSE NULL
        END                                                         AS sell_through_pct,
        cs.season_label                                             AS season_label
    FROM mart_item_perf_by_season p
    CROSS JOIN current_season_label cs
    LEFT JOIN nb_clients_season nc  ON nc.item_id   = p.item_id   AND nc.boutique_id = p.boutique_id
    LEFT JOIN stock_total       stk ON stk.item_id  = p.item_id   AND stk.boutique_id = p.boutique_id
    WHERE p.season_label = cs.season_label
      AND COALESCE(p.revenue_ht_season, 0) > 0
    ORDER BY p.boutique_id, p.revenue_ht_season DESC
    """)

    con.execute("CREATE INDEX IF NOT EXISTS idx_cat_boutique ON mart_item_catalog (boutique_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_cat_item     ON mart_item_catalog (item_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_cat_type     ON mart_item_catalog (type_vetement)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_cat_ca       ON mart_item_catalog (ca_season_ht DESC)")

    count = con.execute("SELECT COUNT(*) FROM mart_item_catalog").fetchone()[0]
    print(f"  ✓ mart_item_catalog : {count:,} lignes")


def _create_mart_item_clients(con: duckdb.DuckDBPyConnection) -> None:
    """Top 10 clients par article (tous temps) — pour la page catalogue."""
    con.execute("""
    CREATE OR REPLACE TABLE mart_item_clients AS

    WITH ranked AS (
        SELECT
            l.item_id,
            sd.boutique_id,
            sd.customer_key,
            sd.customer_id,
            c.name                                          AS customer_name,
            SUM(l.quantity)                                 AS total_qty,
            SUM(l.net_amount_ht)                            AS total_ca_ht,
            COUNT(DISTINCT sd.id)                           AS nb_orders,
            MAX(sd.document_date)                           AS last_order_date,
            ROW_NUMBER() OVER (
                PARTITION BY l.item_id, sd.boutique_id
                ORDER BY SUM(l.net_amount_ht) DESC
            )                                               AS rank
        FROM stg_sale_lines l
        JOIN stg_sale_documents sd
            ON sd.id = l.document_id AND sd.boutique_id = l.boutique_id
        JOIN stg_customers c
            ON c.customer_key = sd.customer_key AND c.boutique_id = sd.boutique_id
        WHERE sd.is_valid_sale = TRUE
        GROUP BY l.item_id, sd.boutique_id, sd.customer_key, sd.customer_id, c.name
    )

    SELECT * FROM ranked WHERE rank <= 10
    """)

    con.execute("CREATE INDEX IF NOT EXISTS idx_ic_item     ON mart_item_clients (item_id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_ic_boutique ON mart_item_clients (boutique_id)")

    count = con.execute("SELECT COUNT(*) FROM mart_item_clients").fetchone()[0]
    print(f"  ✓ mart_item_clients : {count:,} lignes")


if __name__ == "__main__":
    with duckdb.connect(str(DB_PATH)) as con:
        run(con)
    print("Done.")
