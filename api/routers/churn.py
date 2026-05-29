from fastapi import APIRouter, Depends
import pandas as pd
import threading
from cachetools import TTLCache
from api.bq import run_query, dtm, p
from api.dependencies import valid_boutique, boutique_param

router = APIRouter()

_cache = TTLCache(maxsize=50, ttl=300)
_lock  = threading.Lock()


def _fetch_churn(boutique: str):
    df = run_query(
        f"""SELECT a.customer_key, a.boutique_id, a.customer_name,
                   a.last_order_date, a.recency_days, a.monetary_12m,
                   a.ca_trend, a.ca_trend_pct, a.churn_level, a.churn_signals,
                   d.ca_total_ht
            FROM {dtm('mart_churn_alerts')} a
            LEFT JOIN {dtm('mart_customer_detail')} d
              ON d.customer_key = a.customer_key AND d.boutique_id = a.boutique_id
            WHERE a.boutique_id IN UNNEST(@boutiques)""",
        [boutique_param(boutique)],
    )

    alerts = []
    for _, r in df.iterrows():
        signals = list(r["churn_signals"]) if r["churn_signals"] is not None else []
        alerts.append({
            "customer_key":  str(r["customer_key"]),
            "customer_name": str(r["customer_name"]),
            "last_order_date": r["last_order_date"].isoformat() if pd.notna(r["last_order_date"]) else None,
            "recency_days":    int(r["recency_days"]) if pd.notna(r["recency_days"]) else None,
            "monetary_12m":    float(r["monetary_12m"]) if pd.notna(r["monetary_12m"]) else None,
            "ca_trend":        str(r["ca_trend"]) if pd.notna(r["ca_trend"]) else None,
            "ca_trend_pct":    float(r["ca_trend_pct"]) if pd.notna(r["ca_trend_pct"]) else None,
            "churn_level":     str(r["churn_level"]),
            "churn_signals":   signals,
            "ca_total_ht":     float(r["ca_total_ht"]) if pd.notna(r["ca_total_ht"]) else None,
        })
    return {"alerts": alerts}


@router.get("/api/churn")
def get_churn(boutique: str = Depends(valid_boutique)):
    with _lock:
        key = f"churn:{boutique}"
        if key not in _cache:
            _cache[key] = _fetch_churn(boutique)
        return _cache[key]
