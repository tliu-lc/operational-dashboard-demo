from fastapi import APIRouter, Depends
import pandas as pd
import threading
from cachetools import TTLCache
from api.bq import run_query, dtm, p
from api.dependencies import valid_boutique, boutique_param

router = APIRouter()

_cache = TTLCache(maxsize=50, ttl=300)
_lock  = threading.Lock()


def _fetch_stock(boutique: str):
    df = run_query(
        f"""SELECT boutique_id, item_id, item_caption, storehouse_id, storehouse_name,
                   real_stock, stock_value, min_stock, max_stock,
                   virtual_stock, sales_30d, last_movement_date,
                   coverage_days, is_rupture, is_surstock, is_dormant, urgency_rank
            FROM {dtm('mart_stock_status')}
            WHERE boutique_id IN UNNEST(@boutiques)
            ORDER BY urgency_rank ASC, coverage_days ASC""",
        [boutique_param(boutique)],
    )

    def _sf(v): return float(v) if pd.notna(v) else None
    def _si(v): return int(v)   if pd.notna(v) else None
    def _ss(v): return str(v)   if pd.notna(v) else None

    items = []
    for _, r in df.iterrows():
        items.append({
            "item_id":        str(r["item_id"]),
            "item_caption":   _ss(r["item_caption"]) or f"(ID: {r['item_id']})",
            "storehouse_id":  str(r["storehouse_id"]),
            "storehouse_name": _ss(r["storehouse_name"]) or str(r["storehouse_id"]),
            "real_stock":     _sf(r["real_stock"]),
            "stock_value":    _sf(r["stock_value"]),
            "coverage_days":  _si(r["coverage_days"]),
            "urgency_rank":   _si(r["urgency_rank"]),
            "is_rupture":  bool(r["is_rupture"])  if pd.notna(r["is_rupture"])  else False,
            "is_surstock": bool(r["is_surstock"]) if pd.notna(r["is_surstock"]) else False,
            "is_dormant":  bool(r["is_dormant"])  if pd.notna(r["is_dormant"])  else False,
        })

    return {
        "items": items,
        "summary": {
            "n_rupture": sum(1 for i in items if i["urgency_rank"] == 0),
            "n_surstock": sum(1 for i in items if i["urgency_rank"] == 1),
            "n_dormant":  sum(1 for i in items if i["urgency_rank"] == 2),
        },
    }


@router.get("/api/stock")
def get_stock(boutique: str = Depends(valid_boutique)):
    with _lock:
        key = f"stock:{boutique}"
        if key not in _cache:
            _cache[key] = _fetch_stock(boutique)
        return _cache[key]
