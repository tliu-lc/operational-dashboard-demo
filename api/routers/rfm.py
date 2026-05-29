from fastapi import APIRouter, Depends
import pandas as pd
from cachetools import TTLCache, cached
import threading
from api.bq import run_query, dtm, p
from api.dependencies import valid_boutique, boutique_param

router = APIRouter()

_cache = TTLCache(maxsize=50, ttl=300)
_lock  = threading.Lock()


def _fetch_rfm(boutique: str):
    df_rfm = run_query(
        f"""SELECT customer_key, boutique_id, customer_id, customer_name, last_order_date,
                   median_frequency_days, days_overdue, reorder_status, order_count_24m
            FROM {dtm('mart_customer_rfm')}
            WHERE boutique_id IN UNNEST(@boutiques)""",
        [boutique_param(boutique)],
    )
    df_top5 = run_query(
        f"""SELECT customer_key, rank, item_id, item_caption, avg_qty_per_order
            FROM {dtm('mart_item_top5_by_customer')}
            WHERE boutique_id IN UNNEST(@boutiques)""",
        [boutique_param(boutique)],
    )

    top5_by_key: dict = {}
    for _, r in df_top5.iterrows():
        key = str(r["customer_key"])
        top5_by_key.setdefault(key, []).append({
            "rank":             int(r["rank"]),
            "item_id":          str(r["item_id"]),
            "item_caption":     str(r["item_caption"]) if pd.notna(r["item_caption"]) else None,
            "avg_qty_per_order": float(r["avg_qty_per_order"]) if pd.notna(r["avg_qty_per_order"]) else None,
        })

    customers = []
    for _, r in df_rfm.iterrows():
        ck = str(r["customer_key"])
        customers.append({
            "customer_key":          ck,
            "customer_id":           str(r["customer_id"]),
            "customer_name":         str(r["customer_name"]),
            "last_order_date":       r["last_order_date"].isoformat() if pd.notna(r["last_order_date"]) else None,
            "median_frequency_days": int(r["median_frequency_days"]) if pd.notna(r["median_frequency_days"]) else None,
            "days_overdue":          int(r["days_overdue"]) if pd.notna(r["days_overdue"]) else None,
            "reorder_status":        str(r["reorder_status"]),
            "order_count_24m":       int(r["order_count_24m"]) if pd.notna(r["order_count_24m"]) else 0,
            "top5":                  top5_by_key.get(ck, []),
        })
    return {"customers": customers}


@router.get("/api/rfm")
def get_rfm(boutique: str = Depends(valid_boutique)):
    with _lock:
        key = f"rfm:{boutique}"
        if key not in _cache:
            _cache[key] = _fetch_rfm(boutique)
        return _cache[key]
