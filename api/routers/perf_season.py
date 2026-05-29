from fastapi import APIRouter, Depends
import pandas as pd
import threading
from cachetools import TTLCache
from api.bq import run_query, dtm, p
from google.cloud import bigquery
from api.dependencies import valid_boutique, boutique_param

router = APIRouter()

_cache = TTLCache(maxsize=100, ttl=300)
_lock  = threading.Lock()


@router.get("/api/perf-saison/seasons")
def get_seasons(boutique: str = Depends(valid_boutique)):
    with _lock:
        key = f"seasons:{boutique}"
        if key not in _cache:
            df = run_query(
                f"""SELECT season_label, LOGICAL_OR(is_current_season) AS is_current
                    FROM {dtm('mart_item_perf_by_season')}
                    WHERE boutique_id IN UNNEST(@boutiques)
                    GROUP BY season_label
                    ORDER BY season_label DESC""",
                [boutique_param(boutique)],
            )
            _cache[key] = [
                {"season_label": str(r["season_label"]), "is_current": bool(r["is_current"])}
                for _, r in df.iterrows()
            ]
        return _cache[key]


@router.get("/api/perf-saison")
def get_perf_saison(boutique: str = Depends(valid_boutique), season: str = ""):
    if not season:
        return {"items": [], "types": []}

    with _lock:
        key = f"perf:{boutique}:{season}"
        if key not in _cache:
            df = run_query(
                f"""SELECT item_id, item_caption, type_vetement,
                           qty_sold_season, revenue_ht_season,
                           margin_ht_season, margin_rate,
                           real_stock_current, is_current_season,
                           revenue_ht_season_n1, ca_trend_season_pct
                    FROM {dtm('mart_item_perf_by_season')}
                    WHERE boutique_id IN UNNEST(@boutiques) AND season_label = @season
                    ORDER BY revenue_ht_season DESC""",
                [boutique_param(boutique), p("season", season)],
            )

            def _sf(v): return float(v) if pd.notna(v) else None
            def _si(v): return int(v)   if pd.notna(v) else None

            items = [
                {
                    "item_id":              str(r["item_id"]),
                    "item_caption":         str(r["item_caption"]) if pd.notna(r["item_caption"]) else None,
                    "type_vetement":        str(r["type_vetement"]) if pd.notna(r["type_vetement"]) else "Autres",
                    "qty_sold_season":      _si(r["qty_sold_season"]),
                    "revenue_ht_season":    _sf(r["revenue_ht_season"]),
                    "margin_ht_season":     _sf(r["margin_ht_season"]),
                    "margin_rate":          _sf(r["margin_rate"]),
                    "real_stock_current":   _si(r["real_stock_current"]),
                    "is_current_season":    bool(r["is_current_season"]) if pd.notna(r["is_current_season"]) else False,
                    "revenue_ht_season_n1": _sf(r["revenue_ht_season_n1"]),
                    "ca_trend_season_pct":  _sf(r["ca_trend_season_pct"]),
                }
                for _, r in df.iterrows()
            ]
            types = sorted({i["type_vetement"] for i in items})
            _cache[key] = {"items": items, "types": types}
        return _cache[key]
