"""
Tests des calculs métier critiques (KPIs, fréquence, statuts de réassort).
"""
import pytest
from datetime import date, timedelta
import duckdb


@pytest.fixture(scope="module")
def con():
    con = duckdb.connect(":memory:")
    _seed_test_data(con)
    return con


def _seed_test_data(con: duckdb.DuckDBPyConnection) -> None:
    today = date.today()

    con.execute("""
    CREATE TABLE stg_sale_documents (
        customer_key VARCHAR,
        boutique_id  VARCHAR,
        customer_id  VARCHAR,
        document_date DATE,
        is_valid_sale BOOLEAN,
        id           VARCHAR,
        amount_ht    DECIMAL(12,2)
    )
    """)

    # Customer A: 4 orders, 30-day cadence — should be 'a_venir' or overdue depending on today
    base = today - timedelta(days=120)
    for i in range(4):
        order_date = base + timedelta(days=i * 30)
        con.execute(
            "INSERT INTO stg_sale_documents VALUES (?,?,?,?,?,?,?)",
            ["HIP|A", "HIP", "A", order_date, True, f"doc-a-{i}", 1000.0],
        )

    # Customer B: 2 orders only — should be 'insuffisant'
    con.execute(
        "INSERT INTO stg_sale_documents VALUES (?,?,?,?,?,?,?)",
        ["HIP|B", "HIP", "B", today - timedelta(days=60), True, "doc-b-1", 500.0],
    )
    con.execute(
        "INSERT INTO stg_sale_documents VALUES (?,?,?,?,?,?,?)",
        ["HIP|B", "HIP", "B", today - timedelta(days=10), True, "doc-b-2", 500.0],
    )

    # Customer C: 3 orders, last one very recent (3 days ago), 15-day cadence
    for i, delta in enumerate([33, 18, 3]):
        con.execute(
            "INSERT INTO stg_sale_documents VALUES (?,?,?,?,?,?,?)",
            ["HIP|C", "HIP", "C", today - timedelta(days=delta), True, f"doc-c-{i}", 200.0],
        )

    # Customer D: avoir (invalid) + 3 valid orders — avoirs excluded
    con.execute(
        "INSERT INTO stg_sale_documents VALUES (?,?,?,?,?,?,?)",
        ["HIP|D", "HIP", "D", today - timedelta(days=100), False, "doc-d-avoir", 0.0],
    )
    for i in range(3):
        con.execute(
            "INSERT INTO stg_sale_documents VALUES (?,?,?,?,?,?,?)",
            ["HIP|D", "HIP", "D", today - timedelta(days=90 - i * 30), True, f"doc-d-{i}", 300.0],
        )

    con.execute("""
    CREATE TABLE stg_customers (
        customer_key VARCHAR,
        boutique_id  VARCHAR,
        id           VARCHAR,
        name         VARCHAR
    )
    """)
    for cust_id, name in [("A", "CLIENT A"), ("B", "CLIENT B"), ("C", "CLIENT C"), ("D", "CLIENT D")]:
        con.execute(
            "INSERT INTO stg_customers VALUES (?,?,?,?)",
            [f"HIP|{cust_id}", "HIP", cust_id, name],
        )

    # stg_sale_lines + stg_items for mart_item_top5_by_customer tests
    # Customer A orders: I001=28 (rank1), I002=5 (r2), I003=4 (r3), I004=3 (r4), I005=2 (r5), I006=1 (r6 excluded)
    con.execute("""
    CREATE TABLE stg_sale_lines (
        document_id VARCHAR,
        boutique_id VARCHAR,
        item_id     VARCHAR,
        quantity    DECIMAL(10,2)
    )
    """)
    for doc_id, item_id, qty in [
        ("doc-a-0", "I001", 10), ("doc-a-0", "I002", 5),
        ("doc-a-1", "I001", 8),  ("doc-a-1", "I003", 4),
        ("doc-a-2", "I001", 6),  ("doc-a-2", "I004", 3),
        ("doc-a-3", "I001", 4),  ("doc-a-3", "I005", 2), ("doc-a-3", "I006", 1),
    ]:
        con.execute("INSERT INTO stg_sale_lines VALUES (?,?,?,?)", [doc_id, "HIP", item_id, qty])

    con.execute("CREATE TABLE stg_items (id VARCHAR, boutique_id VARCHAR, caption VARCHAR)")
    for iid in ["I001", "I002", "I003", "I004", "I005", "I006"]:
        con.execute("INSERT INTO stg_items VALUES (?,?,?)", [iid, "HIP", f"Item {iid}"])


def _build_rfm(con: duckdb.DuckDBPyConnection) -> dict:
    con.execute("""
    CREATE OR REPLACE TABLE test_rfm AS
    WITH valid_24m AS (
        SELECT DISTINCT customer_key, boutique_id, customer_id, document_date
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
          AND document_date >= CURRENT_DATE - INTERVAL 24 MONTHS
    ),
    order_stats AS (
        SELECT customer_key, boutique_id, customer_id,
               COUNT(*) AS order_count_24m,
               MAX(document_date) AS last_order_date
        FROM valid_24m GROUP BY customer_key, boutique_id, customer_id
    ),
    intervals AS (
        SELECT customer_key,
               DATEDIFF('day',
                   LAG(document_date) OVER (PARTITION BY customer_key ORDER BY document_date),
                   document_date
               ) AS interval_days
        FROM valid_24m
    ),
    median_freq AS (
        SELECT customer_key,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY interval_days)
                   AS median_frequency_days
        FROM intervals
        WHERE interval_days IS NOT NULL AND interval_days > 0
        GROUP BY customer_key
    ),
    base AS (
        SELECT os.customer_key, os.order_count_24m, os.last_order_date,
               mf.median_frequency_days,
               CASE WHEN mf.median_frequency_days IS NOT NULL
                    THEN os.last_order_date + CAST(ROUND(mf.median_frequency_days) AS INTEGER)
                    ELSE NULL END AS next_expected_date
        FROM order_stats os LEFT JOIN median_freq mf USING (customer_key)
    )
    SELECT *,
           CASE WHEN next_expected_date IS NOT NULL
                THEN DATEDIFF('day', next_expected_date, CURRENT_DATE)
                ELSE NULL END AS days_overdue,
           CASE
               WHEN order_count_24m < 3 OR next_expected_date IS NULL THEN 'insuffisant'
               WHEN DATEDIFF('day', next_expected_date, CURRENT_DATE) > 7 THEN 'en_retard'
               WHEN DATEDIFF('day', next_expected_date, CURRENT_DATE) BETWEEN 0 AND 7 THEN 'du_semaine'
               ELSE 'a_venir'
           END AS reorder_status
    FROM base
    """)
    rows = con.execute(
        "SELECT customer_key, order_count_24m, reorder_status, days_overdue, median_frequency_days FROM test_rfm"
    ).fetchall()
    return {r[0]: {"order_count": r[1], "status": r[2], "days_overdue": r[3], "freq": r[4]} for r in rows}


def test_customer_b_insuffisant(con):
    rfm = _build_rfm(con)
    assert rfm["HIP|B"]["status"] == "insuffisant", "< 3 orders must be 'insuffisant'"


def test_customer_a_order_count(con):
    rfm = _build_rfm(con)
    assert rfm["HIP|A"]["order_count"] == 4


def test_customer_a_median_frequency(con):
    rfm = _build_rfm(con)
    # 3 intervals of 30 days → median = 30
    assert abs(rfm["HIP|A"]["freq"] - 30.0) < 1.0, f"Expected ~30, got {rfm['HIP|A']['freq']}"


def test_customer_d_invalid_orders_excluded(con):
    rfm = _build_rfm(con)
    # Customer D has 1 avoir (excluded) + 3 valid → order_count_24m = 3
    assert rfm["HIP|D"]["order_count"] == 3, "Avoirs must be excluded from order count"


def test_customer_c_reorder_status(con):
    rfm = _build_rfm(con)
    # C has 3 orders at -33, -18, -3 days
    # intervals: 15, 15 → median = 15 days
    # next expected = (today-3) + 15 = today + 12 → days_overdue = -12 → 'a_venir'
    assert rfm["HIP|C"]["status"] == "a_venir", f"Expected 'a_venir', got {rfm['HIP|C']['status']}"


def test_reorder_status_thresholds():
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE t (days_overdue INTEGER, expected VARCHAR)")
    con.execute("INSERT INTO t VALUES (-5, 'a_venir'), (0, 'du_semaine'), (7, 'du_semaine'), (8, 'en_retard')")
    rows = con.execute("""
        SELECT days_overdue, expected,
               CASE
                   WHEN days_overdue > 7 THEN 'en_retard'
                   WHEN days_overdue BETWEEN 0 AND 7 THEN 'du_semaine'
                   ELSE 'a_venir'
               END AS computed
        FROM t
    """).fetchall()
    for overdue, expected, computed in rows:
        assert computed == expected, f"days_overdue={overdue}: expected {expected}, got {computed}"


def _build_top5(con: duckdb.DuckDBPyConnection) -> list:
    con.execute("""
    CREATE OR REPLACE TABLE test_top5 AS
    WITH valid_lines AS (
        SELECT sd.customer_key, sd.boutique_id, sl.document_id, sl.item_id, sl.quantity
        FROM stg_sale_lines sl
        JOIN stg_sale_documents sd
            ON sd.id = sl.document_id AND sd.boutique_id = sl.boutique_id
        WHERE sd.is_valid_sale = TRUE
          AND sd.document_date IS NOT NULL
          AND sd.document_date >= CURRENT_DATE - INTERVAL 12 MONTHS
          AND sl.quantity > 0
    ),
    agg AS (
        SELECT customer_key, boutique_id, item_id,
               SUM(quantity)               AS total_qty_12m,
               COUNT(DISTINCT document_id) AS order_count_item
        FROM valid_lines
        GROUP BY customer_key, boutique_id, item_id
    ),
    ranked AS (
        SELECT agg.customer_key, agg.boutique_id, agg.item_id,
               i.caption AS item_caption,
               agg.total_qty_12m,
               agg.order_count_item,
               agg.total_qty_12m / NULLIF(agg.order_count_item, 0) AS avg_qty_per_order,
               ROW_NUMBER() OVER (
                   PARTITION BY agg.customer_key ORDER BY agg.total_qty_12m DESC
               ) AS rank
        FROM agg
        LEFT JOIN stg_items i ON i.id = agg.item_id AND i.boutique_id = agg.boutique_id
    )
    SELECT customer_key, boutique_id, rank, item_id, item_caption,
           total_qty_12m, order_count_item, avg_qty_per_order
    FROM ranked
    WHERE rank <= 5
    """)
    return con.execute(
        "SELECT customer_key, rank, item_id, total_qty_12m FROM test_top5 ORDER BY customer_key, rank"
    ).fetchall()


def test_mart_item_top5_by_customer(con):
    rows = _build_top5(con)
    a_rows = [(r[1], r[2], r[3]) for r in rows if r[0] == "HIP|A"]
    assert len(a_rows) == 5, f"Expected 5 items for Customer A, got {len(a_rows)}"
    assert a_rows[0][1] == "I001", f"Rank 1 should be I001, got {a_rows[0][1]}"
    assert abs(float(a_rows[0][2]) - 28.0) < 0.01, f"I001 total qty should be 28, got {a_rows[0][2]}"
    item_ids = [r[1] for r in a_rows]
    assert "I006" not in item_ids, "I006 (rank 6) must be excluded from top5"
