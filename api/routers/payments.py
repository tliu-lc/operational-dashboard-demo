from fastapi import APIRouter, Depends
import pandas as pd
import threading
from cachetools import TTLCache
from api.bq import run_query, dtm, p
from api.dependencies import valid_boutique, boutique_param

router = APIRouter()

_cache = TTLCache(maxsize=20, ttl=300)
_lock  = threading.Lock()


@router.get("/api/payments/overdue")
def get_overdue(boutique: str = Depends(valid_boutique)):
    with _lock:
        key = f"payments_overdue:{boutique}"
        if key not in _cache:
            df = run_query(
                f"""SELECT customer_key, customer_id, customer_name, city,
                           nb_invoices_overdue, total_overdue_ht,
                           oldest_overdue_date, latest_overdue_date
                    FROM {dtm('mart_customer_overdue')}
                    WHERE boutique_id IN UNNEST(@boutiques)
                    ORDER BY oldest_overdue_date ASC NULLS LAST""",
                [boutique_param(boutique)],
            )

            def _sf(v): return float(v) if pd.notna(v) else None
            def _si(v): return int(v)   if pd.notna(v) else None
            def _ss(v): return str(v)   if pd.notna(v) else None
            def _sd(v): return v.isoformat() if pd.notna(v) else None

            clients = [
                {
                    "customer_key":         str(r["customer_key"]),
                    "customer_id":          str(r["customer_id"]),
                    "customer_name":        str(r["customer_name"]),
                    "city":                 _ss(r["city"]),
                    "nb_invoices_overdue":  _si(r["nb_invoices_overdue"]),
                    "total_overdue_ht":     _sf(r["total_overdue_ht"]),
                    "oldest_overdue_date":  _sd(r["oldest_overdue_date"]),
                    "latest_overdue_date":  _sd(r["latest_overdue_date"]),
                }
                for _, r in df.iterrows()
            ]

            total_overdue = sum(c["total_overdue_ht"] or 0 for c in clients)

            _cache[key] = {
                "boutique_id":      boutique,
                "total_overdue_ht": total_overdue,
                "nb_clients":       len(clients),
                "clients":          clients,
            }
        return _cache[key]
