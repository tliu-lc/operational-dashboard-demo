import logging
from fastapi import APIRouter, Depends
import pandas as pd
from api.bq import run_query, dtm, dwh, p
from google.cloud import bigquery
from api.dependencies import valid_boutique, boutique_param

router = APIRouter()

MART_TABLES = [
    "mart_customer_rfm",
    "mart_churn_alerts",
    "mart_stock_status",
    "mart_geo_sales",
    "mart_item_perf_by_season",
]


@router.get("/api/monitoring/health")
def get_health():
    try:
        from api.bq import get_bq, PROJECT, DWH
        bq = get_bq()

        row_df = run_query(
            f"""SELECT MAX(document_date) AS last_doc_date,
                       DATE_DIFF(CURRENT_DATE(), MAX(document_date), DAY) AS days_ago
                FROM {dwh('stg_sale_documents')}
                WHERE document_type = 2""",
        )
        last_doc_date = row_df["last_doc_date"].iloc[0] if not row_df.empty else None
        days_ago_raw  = row_df["days_ago"].iloc[0]     if not row_df.empty else None
        days_ago = int(days_ago_raw) if pd.notna(days_ago_raw) else None

        if days_ago is None:
            freshness_level = "rouge"
        elif days_ago < 7:
            freshness_level = "vert"
        elif days_ago <= 30:
            freshness_level = "orange"
        else:
            freshness_level = "rouge"

        mart_counts: dict = {}
        for table in MART_TABLES:
            try:
                count_df = run_query(f"SELECT COUNT(*) AS n FROM {dtm(table)}")
                count = int(count_df["n"].iloc[0])
                mart_counts[table] = {"exists": True, "count": count}
            except Exception:
                mart_counts[table] = {"exists": False, "count": None}

        return {
            "bq_status": "ok",
            "bq_error":  None,
            "last_document_date":   last_doc_date.isoformat() if last_doc_date and pd.notna(last_doc_date) else None,
            "days_since_last_doc":  days_ago,
            "freshness_level":      freshness_level,
            "mart_counts":          mart_counts,
        }

    except Exception as e:
        logging.exception("BQ error")
        return {
            "bq_status": "error",
            "bq_error":  "Erreur de chargement des données",
            "last_document_date":  None,
            "days_since_last_doc": None,
            "freshness_level":     None,
            "mart_counts":         None,
        }


@router.get("/api/monitoring/summary")
def get_summary(boutique: str = Depends(valid_boutique)):
    churn = None
    try:
        df = run_query(
            f"""SELECT churn_level, COUNT(*) AS count
                FROM {dtm('mart_churn_alerts')}
                WHERE boutique_id IN UNNEST(@boutiques)
                GROUP BY churn_level""",
            [boutique_param(boutique)],
        )
        churn = {
            "critique":    int(df.loc[df["churn_level"] == "critique",    "count"].sum()),
            "modere":      int(df.loc[df["churn_level"] == "modere",      "count"].sum()),
            "surveillance": int(df.loc[df["churn_level"] == "surveillance", "count"].sum()),
        }
    except Exception:
        pass

    stock = None
    try:
        df = run_query(
            f"""SELECT urgency_rank, COUNT(*) AS count
                FROM {dtm('mart_stock_status')}
                WHERE boutique_id IN UNNEST(@boutiques)
                GROUP BY urgency_rank""",
            [boutique_param(boutique)],
        )
        stock = {
            "rupture": int(df.loc[df["urgency_rank"] == 0, "count"].sum()),
            "surstock": int(df.loc[df["urgency_rank"] == 1, "count"].sum()),
            "dormant":  int(df.loc[df["urgency_rank"] == 2, "count"].sum()),
        }
    except Exception:
        pass

    reorder = None
    try:
        df = run_query(
            f"""SELECT reorder_status, COUNT(*) AS count
                FROM {dtm('mart_customer_rfm')}
                WHERE boutique_id IN UNNEST(@boutiques)
                  AND reorder_status IN ('en_retard', 'du_semaine')
                GROUP BY reorder_status""",
            [boutique_param(boutique)],
        )
        reorder = {
            "en_retard":  int(df.loc[df["reorder_status"] == "en_retard",  "count"].sum()),
            "du_semaine": int(df.loc[df["reorder_status"] == "du_semaine", "count"].sum()),
        }
    except Exception:
        pass

    return {"boutique_id": boutique, "churn": churn, "stock": stock, "reorder": reorder}


@router.get("/api/monitoring/kpis")
def get_kpis(boutique: str = Depends(valid_boutique)):
    try:
     return _compute_kpis(boutique)
    except Exception as e:
        logging.exception("BQ error")
        return {"boutique_id": boutique, "error": "Erreur de chargement des données",
                "ca_12m": None, "ca_12m_precedents": None, "ca_trend_pct": None,
                "clients_actifs_12m": None, "clients_total": None,
                "nb_orders_12m": None, "panier_moyen": None,
                "stock_coverage": None, "data_quality": None}


def _compute_kpis(boutique: str):
    row_df = run_query(
        f"""SELECT SUM(amount_ht) AS ca_12m,
                   COUNT(DISTINCT id) AS nb_orders_12m,
                   COUNT(DISTINCT customer_id) AS clients_actifs_12m
            FROM {dwh('stg_sale_documents')}
            WHERE boutique_id IN UNNEST(@boutiques)
              AND document_type = 2
              AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)""",
        [boutique_param(boutique)],
    )
    ca_12m             = float(row_df["ca_12m"].iloc[0])      if pd.notna(row_df["ca_12m"].iloc[0])             else 0.0
    nb_orders_12m      = int(row_df["nb_orders_12m"].iloc[0]) if pd.notna(row_df["nb_orders_12m"].iloc[0])       else 0
    clients_actifs_12m = int(row_df["clients_actifs_12m"].iloc[0]) if pd.notna(row_df["clients_actifs_12m"].iloc[0]) else 0

    prev_df = run_query(
        f"""SELECT SUM(amount_ht) AS ca_prev
            FROM {dwh('stg_sale_documents')}
            WHERE boutique_id IN UNNEST(@boutiques)
              AND document_type = 2
              AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY)
              AND document_date <  DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)""",
        [boutique_param(boutique)],
    )
    ca_12m_precedents = float(prev_df["ca_prev"].iloc[0]) if pd.notna(prev_df["ca_prev"].iloc[0]) else None

    total_df = run_query(
        f"""SELECT COUNT(DISTINCT id) AS clients_total
            FROM {dwh('stg_customers')}
            WHERE boutique_id IN UNNEST(@boutiques)""",
        [boutique_param(boutique)],
    )
    clients_total = int(total_df["clients_total"].iloc[0]) if pd.notna(total_df["clients_total"].iloc[0]) else 0

    panier_moyen = round(ca_12m / nb_orders_12m, 2) if nb_orders_12m > 0 else None
    ca_trend_pct = None
    if ca_12m_precedents and ca_12m_precedents > 0:
        ca_trend_pct = round((ca_12m - ca_12m_precedents) / ca_12m_precedents * 100, 1)

    stock_coverage = None
    try:
        rs = run_query(
            f"""SELECT COUNT(*) AS total_articles,
                       COUNTIF(urgency_rank IS NULL) AS nb_normal,
                       COUNTIF(urgency_rank IN (0, 1, 2)) AS nb_alerte
                FROM {dtm('mart_stock_status')}
                WHERE boutique_id IN UNNEST(@boutiques)""",
            [boutique_param(boutique)],
        )
        total    = int(rs["total_articles"].iloc[0])
        nb_normal = int(rs["nb_normal"].iloc[0])
        nb_alerte = int(rs["nb_alerte"].iloc[0])
        if total > 0:
            stock_coverage = {
                "total_articles": total,
                "pct_normal": round(nb_normal / total * 100, 1),
                "pct_alerte": round(nb_alerte / total * 100, 1),
            }
        else:
            stock_coverage = {"total_articles": 0, "pct_normal": 0.0, "pct_alerte": 0.0}
    except Exception:
        pass

    data_quality = None
    try:
        rq1 = run_query(
            f"""SELECT COUNT(*) AS total_clients,
                       COUNTIF(reorder_status != 'insuffisant') AS nb_suffisant
                FROM {dtm('mart_customer_rfm')}
                WHERE boutique_id IN UNNEST(@boutiques)""",
            [boutique_param(boutique)],
        )
        rq2 = run_query(
            f"""SELECT COUNT(*) AS total_articles,
                       COUNTIF(coverage_days IS NOT NULL AND coverage_days > 0) AS nb_coverage_ok
                FROM {dtm('mart_stock_status')}
                WHERE boutique_id IN UNNEST(@boutiques)""",
            [boutique_param(boutique)],
        )
        total_clients  = int(rq1["total_clients"].iloc[0])
        nb_suffisant   = int(rq1["nb_suffisant"].iloc[0])
        total_articles = int(rq2["total_articles"].iloc[0])
        nb_coverage_ok = int(rq2["nb_coverage_ok"].iloc[0])
        data_quality = {
            "pct_clients_suffisant":            round(nb_suffisant   / total_clients  * 100, 1) if total_clients  > 0 else 0.0,
            "pct_articles_coverage_calculable": round(nb_coverage_ok / total_articles * 100, 1) if total_articles > 0 else 0.0,
        }
    except Exception:
        pass

    return {
        "boutique_id":        boutique,
        "ca_12m":             ca_12m,
        "ca_12m_precedents":  ca_12m_precedents,
        "ca_trend_pct":       ca_trend_pct,
        "clients_actifs_12m": clients_actifs_12m,
        "clients_total":      clients_total,
        "nb_orders_12m":      nb_orders_12m,
        "panier_moyen":       panier_moyen,
        "stock_coverage":     stock_coverage,
        "data_quality":       data_quality,
    }


def _fetch_recent_orders(boutique: str, ref_date) -> list:
    """Return orders placed on the reference date, sorted by amount descending."""
    if not ref_date:
        return []
    df = run_query(
        f"""SELECT d.document_number, d.document_date, d.amount_ht,
                   d.customer_id, c.name AS customer_name,
                   COUNT(l.item_id) AS nb_refs
            FROM {dwh('stg_sale_documents')} d
            JOIN {dwh('stg_customers')} c
                ON c.customer_key = d.customer_key AND c.boutique_id = d.boutique_id
            LEFT JOIN {dwh('stg_sale_lines')} l
                ON l.document_id = d.id AND l.boutique_id = d.boutique_id
            WHERE d.boutique_id IN UNNEST(@boutiques) AND d.is_valid_sale = TRUE AND d.document_date = @ref_date
            GROUP BY d.document_number, d.document_date, d.amount_ht, d.customer_id, c.name
            ORDER BY d.amount_ht DESC
            LIMIT 20""",
        [boutique_param(boutique),
         bigquery.ScalarQueryParameter("ref_date", "DATE", ref_date)],
    )
    return [
        {
            "document_number": str(r["document_number"]) if pd.notna(r["document_number"]) else None,
            "document_date":   r["document_date"].isoformat() if pd.notna(r["document_date"]) else None,
            "amount_ht":       float(r["amount_ht"]) if pd.notna(r["amount_ht"]) else 0.0,
            "customer_id":     str(r["customer_id"]),
            "customer_name":   str(r["customer_name"]),
            "nb_refs":         int(r["nb_refs"]) if pd.notna(r["nb_refs"]) else 0,
        }
        for _, r in df.iterrows()
    ]


def _fetch_new_clients(boutique: str, ref_date) -> list:
    """Return customers whose first purchase falls within 30 days before the reference date."""
    if not ref_date:
        return []
    df = run_query(
        f"""SELECT c.id AS customer_id, c.name AS customer_name,
                   c.first_invoice_date, c.city,
                   ct.ca_total_ht
            FROM {dwh('stg_customers')} c
            JOIN (
                SELECT customer_key, boutique_id, SUM(amount_ht) AS ca_total_ht
                FROM {dwh('stg_sale_documents')} WHERE is_valid_sale = TRUE
                GROUP BY customer_key, boutique_id
            ) ct ON ct.customer_key = c.customer_key AND ct.boutique_id = c.boutique_id
            WHERE c.boutique_id IN UNNEST(@boutiques)
              AND c.first_invoice_date >= DATE_SUB(@ref_date, INTERVAL 30 DAY)
              AND c.first_invoice_date <= @ref_date
            ORDER BY c.first_invoice_date DESC
            LIMIT 10""",
        [boutique_param(boutique),
         bigquery.ScalarQueryParameter("ref_date", "DATE", ref_date)],
    )
    return [
        {
            "customer_id":      str(r["customer_id"]),
            "customer_name":    str(r["customer_name"]),
            "first_order_date": r["first_invoice_date"].isoformat() if pd.notna(r["first_invoice_date"]) else None,
            "city":             str(r["city"]) if pd.notna(r["city"]) else None,
            "ca_total_ht":      float(r["ca_total_ht"]) if pd.notna(r["ca_total_ht"]) else 0.0,
        }
        for _, r in df.iterrows()
    ]


def _fetch_stockouts(boutique: str) -> list:
    """Return active items with real_stock <= 0 that had sales in the last 90 days."""
    df = run_query(
        f"""SELECT si.item_id, i.caption AS item_caption, i.type_vetement,
                   si.storehouse_id, s.caption AS storehouse_name
            FROM {dwh('stg_stock_items')} si
            JOIN {dwh('stg_items')} i ON i.id = si.item_id AND i.boutique_id = si.boutique_id
            JOIN {dwh('stg_storehous')} s ON s.id = si.storehouse_id AND s.boutique_id = si.boutique_id
            WHERE si.boutique_id IN UNNEST(@boutiques)
              AND si.real_stock <= 0
              AND i.active_state = 1
              AND EXISTS (
                  SELECT 1 FROM {dwh('stg_sale_lines')} l
                  JOIN {dwh('stg_sale_documents')} d
                      ON d.id = l.document_id AND d.boutique_id = l.boutique_id
                  WHERE l.item_id = si.item_id AND l.boutique_id = si.boutique_id
                    AND d.is_valid_sale = TRUE
                    AND d.document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
              )
            ORDER BY i.caption
            LIMIT 20""",
        [boutique_param(boutique)],
    )
    return [
        {
            "item_id":         str(r["item_id"]),
            "item_caption":    str(r["item_caption"]),
            "type_vetement":   str(r["type_vetement"]),
            "storehouse_id":   str(r["storehouse_id"]),
            "storehouse_name": str(r["storehouse_name"]) if pd.notna(r["storehouse_name"]) else None,
        }
        for _, r in df.iterrows()
    ]


@router.get("/api/monitoring/feed")
def get_daily_feed(boutique: str = Depends(valid_boutique)):
    try:
        return _compute_daily_feed(boutique)
    except Exception as e:
        logging.exception("BQ error")
        return {"boutique_id": boutique, "error": "Erreur de chargement des données",
                "reference_date": None, "totals": None,
                "recent_orders": [], "new_clients": [], "stockouts": []}


def _compute_daily_feed(boutique: str):
    ref_row = run_query(
        f"""SELECT MAX(document_date) AS ref_date
            FROM {dwh('stg_sale_documents')}
            WHERE boutique_id IN UNNEST(@boutiques) AND is_valid_sale = TRUE""",
        [boutique_param(boutique)],
    )
    ref_date = ref_row["ref_date"].iloc[0] if not ref_row.empty else None

    recent_orders = _fetch_recent_orders(boutique, ref_date)
    new_clients   = _fetch_new_clients(boutique, ref_date)
    stockouts     = _fetch_stockouts(boutique)

    # Aggregate totals for the reference day
    totals = {"nb_orders": len(recent_orders), "ca_ht": sum(o["amount_ht"] for o in recent_orders)}

    return {
        "reference_date": ref_date.isoformat() if ref_date and pd.notna(ref_date) else None,
        "totals":         totals,
        "recent_orders":  recent_orders,
        "new_clients":    new_clients,
        "stockouts":      stockouts,
    }
