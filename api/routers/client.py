from fastapi import APIRouter, Depends, HTTPException, Query
import pandas as pd
import numpy as np
import threading
from cachetools import TTLCache
from api.bq import run_query, dtm, dwh, p
from google.cloud import bigquery
from api.dependencies import valid_boutique, boutique_param

router = APIRouter()

_cache = TTLCache(maxsize=500, ttl=300)
_lock  = threading.Lock()


@router.get("/api/client")
def list_clients(boutique: str = Depends(valid_boutique)):
    with _lock:
        key = f"clients:{boutique}"
        if key not in _cache:
            # boutique 'ALL' (Demo) → lignes HIPP du mart (fusionnées par unified_key)
            # autres boutiques → lignes par boutique normales
            if boutique == "ALL":
                where_clause = "boutique_id = 'HIPP'"
                params: list = []
                select_presence = "presence"
            else:
                where_clause = "boutique_id IN UNNEST(@boutiques)"
                params = [boutique_param(boutique)]
                select_presence = "CAST(NULL AS STRING) AS presence"

            df = run_query(
                f"""SELECT customer_id, customer_name, boutique_id, dept_code, city,
                           churn_color, segment, ca_total_ht, ca_12m_ht,
                           last_order_date, recency_days,
                           {select_presence}
                    FROM {dtm('mart_customer_detail')}
                    WHERE {where_clause}
                    ORDER BY customer_name""",
                params,
            )

            def _row(r):
                return {
                    "customer_id":   str(r["customer_id"]),
                    "customer_name": str(r["customer_name"]),
                    "boutique_id":   str(r["boutique_id"]) if pd.notna(r["boutique_id"]) else None,
                    "dept_code":     str(r["dept_code"]) if pd.notna(r["dept_code"]) else None,
                    "city":          str(r["city"]) if pd.notna(r["city"]) else None,
                    "churn_color":   str(r["churn_color"]) if pd.notna(r["churn_color"]) else "vert",
                    "segment":       str(r["segment"]) if pd.notna(r["segment"]) else "inactif",
                    "ca_total_ht":   float(r["ca_total_ht"]) if pd.notna(r["ca_total_ht"]) else None,
                    "ca_12m_ht":     float(r["ca_12m_ht"]) if pd.notna(r["ca_12m_ht"]) else None,
                    "last_order_date": r["last_order_date"].isoformat() if pd.notna(r["last_order_date"]) else None,
                    "recency_days":  int(r["recency_days"]) if pd.notna(r["recency_days"]) else None,
                    "presence":      str(r["presence"]) if pd.notna(r["presence"]) else None,
                }

            _cache[key] = {"customers": [_row(r) for _, r in df.iterrows()]}
        return _cache[key]


@router.get("/api/client/search")
def search_clients(q: str = "", boutique: str = Depends(valid_boutique)):
    if not q.strip():
        return []
    pattern = f"%{q.strip()}%"
    from api.bq import get_bq
    bq = get_bq()
    from api.bq import DWH, PROJECT
    query = f"""SELECT id AS customer_id, name
                FROM `{PROJECT}.{DWH}.stg_customers`
                WHERE boutique_id IN UNNEST(@boutiques)
                  AND (LOWER(name) LIKE LOWER(@pattern) OR LOWER(id) LIKE LOWER(@pattern))
                ORDER BY name LIMIT 20"""
    job_config = bigquery.QueryJobConfig(query_parameters=[
        boutique_param(boutique),
        p("pattern", pattern),
    ])
    rows = bq.query(query, job_config=job_config).result()
    return [{"customer_id": str(r.customer_id), "name": str(r.name)} for r in rows]


@router.get("/api/client/detail")
def get_client_by_query(id: str = Query(...), boutique: str = Depends(valid_boutique)):
    return _get_client_detail(id, boutique)


@router.get("/api/client/{customer_id:path}")
def get_client(customer_id: str, boutique: str = Depends(valid_boutique)):
    return _get_client_detail(customer_id, boutique)


def _get_client_detail(customer_id: str, boutique: str):
    with _lock:
        key = f"client_detail:{boutique}:{customer_id}"
        if key in _cache:
            return _cache[key]

    # boutique 'ALL' → lignes HIPP du mart ; sinon → lignes par boutique normales
    if boutique == "ALL":
        df = run_query(
            f"""SELECT * FROM {dtm('mart_customer_detail')}
                WHERE customer_id = @cid AND boutique_id = 'HIPP'
                LIMIT 1""",
            [p("cid", customer_id)],
        )
        # Fallback : si la requête HIPP ne trouve rien (ex: customer_id sans
        # préfixe HIPP- venant d'une vue per-boutique), on cherche dans SED/HIP
        if df.empty:
            df = run_query(
                f"""SELECT * FROM {dtm('mart_customer_detail')}
                    WHERE customer_id = @cid AND boutique_id IN ('SED', 'HIP')
                    LIMIT 1""",
                [p("cid", customer_id)],
            )
    else:
        df = run_query(
            f"""SELECT * FROM {dtm('mart_customer_detail')}
                WHERE customer_id = @cid AND boutique_id IN UNNEST(@boutiques)
                LIMIT 1""",
            [p("cid", customer_id), boutique_param(boutique)],
        )
    if df.empty:
        raise HTTPException(status_code=404, detail="Client introuvable")

    row = df.iloc[0]
    customer_key = str(row["customer_key"])
    is_hipp = boutique == "ALL" or str(row.get("boutique_id", "")) == "HIPP"

    # Pour HIPP : on a besoin des customer_keys sous-jacents (SED, HIP) pour les
    # requêtes sur stg_sale_documents qui sont indexées par customer_key réel
    underlying_keys: list[str] = []
    boutique_sources: list[dict] = []
    if is_hipp:
        unified_key = str(row.get("unified_key", ""))
        if unified_key and not unified_key.startswith("FALLBACK:"):
            df_src = run_query(
                f"""SELECT boutique_id, customer_key, customer_id, customer_name,
                           address1, address2, zip_code, city, country_iso_code,
                           email, phone, ca_total_ht, ca_12m_ht, last_order_date
                    FROM {dtm('mart_customer_detail')}
                    WHERE unified_key = @uk AND boutique_id IN ('SED','HIP')""",
                [p("uk", unified_key)],
            )
            for _, r in df_src.iterrows():
                underlying_keys.append(str(r["customer_key"]))
                boutique_sources.append({
                    "boutique_id":   str(r["boutique_id"]),
                    "customer_id":   str(r["customer_id"]),
                    "customer_name": str(r["customer_name"]),
                    "address1":      str(r["address1"]) if pd.notna(r["address1"]) else None,
                    "address2":      str(r["address2"]) if pd.notna(r["address2"]) else None,
                    "zip_code":      str(r["zip_code"]) if pd.notna(r["zip_code"]) else None,
                    "city":          str(r["city"]) if pd.notna(r["city"]) else None,
                    "country_iso_code": str(r["country_iso_code"]) if pd.notna(r["country_iso_code"]) else None,
                    "email":         str(r["email"]) if pd.notna(r["email"]) else None,
                    "phone":         str(r["phone"]) if pd.notna(r["phone"]) else None,
                    "ca_total_ht":   float(r["ca_total_ht"]) if pd.notna(r["ca_total_ht"]) else None,
                    "ca_12m_ht":     float(r["ca_12m_ht"]) if pd.notna(r["ca_12m_ht"]) else None,
                    "last_order_date": r["last_order_date"].isoformat() if pd.notna(r["last_order_date"]) else None,
                })
        else:
            # Cas FALLBACK : un seul customer_key sous-jacent dérivé du customer_id 'HIPP-SED-123'
            parts = customer_id.replace("HIPP-", "", 1).split("-", 1)
            if len(parts) == 2:
                underlying_keys.append(f"{parts[0]}|{parts[1]}")

    # customer_keys utilisés pour les requêtes downstream
    if is_hipp and underlying_keys:
        ck_param = bigquery.ArrayQueryParameter("cks", "STRING", underlying_keys)
        ck_clause = "customer_key IN UNNEST(@cks)"
    else:
        ck_param = p("ck", customer_key)
        ck_clause = "customer_key = @ck"

    def _safe_float(v): return float(v) if pd.notna(v) else None
    def _safe_int(v):   return int(v)   if pd.notna(v) else None
    def _safe_str(v):   return str(v)   if pd.notna(v) else None
    def _safe_date(v):  return v.isoformat() if pd.notna(v) else None

    def _safe_val(v):
        if hasattr(v, 'isoformat'):        return _safe_date(v)
        if isinstance(v, (bool, np.bool_)): return bool(v)
        if isinstance(v, np.integer):       return int(v) if pd.notna(v) else None
        if isinstance(v, float):            return _safe_float(v)
        return _safe_str(v)

    detail = {k: _safe_val(v) for k, v in row.items()}

    df_monthly = run_query(
        f"""SELECT DATE_TRUNC(document_date, MONTH) AS month, SUM(amount_ht) AS ca_ht
            FROM {dwh('stg_sale_documents')}
            WHERE {ck_clause} AND is_valid_sale = TRUE
              AND document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
            GROUP BY month ORDER BY month""",
        [ck_param],
    )
    monthly_ca = [
        {"month": r["month"].isoformat(), "ca_ht": float(r["ca_ht"])}
        for _, r in df_monthly.iterrows()
    ]

    df_history = run_query(
        f"""SELECT DATE_TRUNC(document_date, MONTH) AS month, SUM(amount_ht) AS ca_ht
            FROM {dwh('stg_sale_documents')}
            WHERE {ck_clause} AND is_valid_sale = TRUE
            GROUP BY month ORDER BY month""",
        [ck_param],
    )
    full_history = [
        {"month": r["month"].isoformat(), "ca_ht": float(r["ca_ht"])}
        for _, r in df_history.iterrows()
    ]

    # Pour HIPP : aggrège les top5 des 2 boutiques par item
    if is_hipp and underlying_keys:
        df_top5 = run_query(
            f"""SELECT item_id, ANY_VALUE(item_caption) AS item_caption,
                       SUM(total_qty_12m)    AS total_qty_12m,
                       SUM(order_count_item) AS order_count_item
                FROM {dtm('mart_item_top5_by_customer')}
                WHERE customer_key IN UNNEST(@cks)
                GROUP BY item_id
                ORDER BY total_qty_12m DESC LIMIT 5""",
            [bigquery.ArrayQueryParameter("cks", "STRING", underlying_keys)],
        )
        top5 = [
            {
                "rank":            i + 1,
                "item_id":         str(r["item_id"]),
                "item_caption":    _safe_str(r["item_caption"]),
                "total_qty_12m":   _safe_int(r["total_qty_12m"]),
                "order_count_item": _safe_int(r["order_count_item"]),
            }
            for i, (_, r) in enumerate(df_top5.iterrows())
        ]
    else:
        df_top5 = run_query(
            f"""SELECT rank, item_id, item_caption, total_qty_12m, order_count_item
                FROM {dtm('mart_item_top5_by_customer')}
                WHERE customer_key = @ck
                ORDER BY rank LIMIT 5""",
            [p("ck", customer_key)],
        )
        top5 = [
            {
                "rank":            int(r["rank"]),
                "item_id":         str(r["item_id"]),
                "item_caption":    _safe_str(r["item_caption"]),
                "total_qty_12m":   _safe_int(r["total_qty_12m"]),
                "order_count_item": _safe_int(r["order_count_item"]),
            }
            for _, r in df_top5.iterrows()
        ]

    df_orders = run_query(
        f"""SELECT d.document_date, d.amount_ht, d.document_number,
                   COUNT(DISTINCT l.item_id) AS nb_refs
            FROM {dwh('stg_sale_documents')} d
            LEFT JOIN {dwh('stg_sale_lines')} l
                ON l.document_id = d.id AND l.boutique_id = d.boutique_id
            WHERE d.{ck_clause} AND d.is_valid_sale = TRUE
            GROUP BY d.id, d.document_date, d.amount_ht, d.document_number
            ORDER BY d.document_date DESC LIMIT 10""",
        [ck_param],
    )
    last_orders = [
        {
            "document_date":   r["document_date"].isoformat() if pd.notna(r["document_date"]) else None,
            "amount_ht":       _safe_float(r["amount_ht"]),
            "document_number": _safe_str(r["document_number"]),
            "nb_refs":         _safe_int(r["nb_refs"]),
        }
        for _, r in df_orders.iterrows()
    ]

    # Pour les impayés en mode HIPP, on filtre sur les boutiques sous-jacentes (SED+HIP)
    overdue_boutique_param = (
        bigquery.ArrayQueryParameter("boutiques", "STRING", ["SED", "HIP"])
        if is_hipp else boutique_param(boutique)
    )
    df_overdue_invoices = run_query(
        f"""SELECT document_number, document_date, amount_ttc, balance_due,
                   GREATEST(amount_ttc - balance_due, 0) AS amount_paid
            FROM {dwh('stg_sale_documents')}
            WHERE {ck_clause}
              AND boutique_id IN UNNEST(@boutiques)
              AND document_type = 2
              AND balance_due > 0
            ORDER BY document_date DESC""",
        [ck_param, overdue_boutique_param],
    )
    overdue_invoices = [
        {
            "document_number": str(r["document_number"]),
            "document_date":   r["document_date"].isoformat() if pd.notna(r["document_date"]) else None,
            "amount_ttc":      _safe_float(r["amount_ttc"]),
            "balance_due":     _safe_float(r["balance_due"]),
            "amount_paid":     _safe_float(r["amount_paid"]),
            "partial":         _safe_float(r["amount_paid"]) is not None and _safe_float(r["amount_paid"]) > 0,
        }
        for _, r in df_overdue_invoices.iterrows()
    ]
    detail["total_overdue_ht"]    = sum(i["balance_due"] or 0 for i in overdue_invoices) or None
    detail["nb_invoices_overdue"] = len(overdue_invoices) or None
    detail["overdue_invoices"]    = overdue_invoices

    # Adresses source des boutiques (uniquement pour les clients HIPP fusionnés)
    detail["boutique_sources"] = boutique_sources

    result = {
        "detail":      detail,
        "monthly_ca":  monthly_ca,
        "full_history": full_history,
        "top5":        top5,
        "last_orders": last_orders,
    }
    with _lock:
        _cache[f"client_detail:{boutique}:{customer_id}"] = result
    return result
