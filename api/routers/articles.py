from fastapi import APIRouter, Depends
import pandas as pd
import threading
from cachetools import TTLCache
from api.bq import run_query, dtm, p
from api.dependencies import valid_boutique, boutique_param, boutique_ids
router = APIRouter()

_cache = TTLCache(maxsize=200, ttl=300)
_lock  = threading.Lock()

_ORDER_MAP = {
    "ca":           "ca_season_ht DESC",
    "qty":          "qty_sold_season DESC",
    "marge":        "margin_rate DESC",
    "sell_through": "sell_through_pct DESC",
    "tendance":     "ca_trend_season_pct DESC",
    "stock":        "current_stock DESC",
}


@router.get("/api/articles")
def list_articles(boutique: str = Depends(valid_boutique), type_vetement: str = "", sort: str = "ca", search: str = ""):
    with _lock:
        key = f"articles:{boutique}:{type_vetement}:{sort}:{search}"
        if key not in _cache:
            _cache[key] = _fetch_articles(boutique, type_vetement, sort, search)
        return _cache[key]


def _fetch_articles(boutique: str, type_vetement: str, sort: str, search: str):
    conditions = ["boutique_id IN UNNEST(@boutiques)"]
    params = [boutique_param(boutique)]

    if type_vetement:
        conditions.append("type_vetement = @type_vetement")
        params.append(p("type_vetement", type_vetement))
    if search:
        conditions.append("LOWER(item_caption) LIKE LOWER(@search)")
        params.append(p("search", f"%{search}%"))

    order = _ORDER_MAP.get(sort, "ca_season_ht DESC")
    where = " AND ".join(conditions)
    needs_agg = len(boutique_ids(boutique)) > 1

    if needs_agg:
        # Agrégation par item_id quand plusieurs boutiques (ALL = SED + HIP).
        # Évite les doublons d'item_id, recalcule les ratios de façon pondérée.
        sql = f"""
            WITH src AS (
              SELECT item_id, item_caption, type_vetement, season_label,
                     qty_sold_season, ca_season_ht, margin_ht_season,
                     ca_prev_season_ht, nb_clients_season, current_stock
              FROM {dtm('mart_item_catalog')}
              WHERE {where}
            ),
            agg AS (
              SELECT
                item_id,
                ANY_VALUE(item_caption)  AS item_caption,
                ANY_VALUE(type_vetement) AS type_vetement,
                ANY_VALUE(season_label)  AS season_label,
                SUM(qty_sold_season)     AS qty_sold_season,
                SUM(ca_season_ht)        AS ca_season_ht,
                SUM(margin_ht_season)    AS margin_ht_season,
                SUM(ca_prev_season_ht)   AS ca_prev_season_ht,
                SUM(nb_clients_season)   AS nb_clients_season,
                SUM(current_stock)       AS current_stock
              FROM src
              GROUP BY item_id
            )
            SELECT
              item_id, item_caption, type_vetement, season_label,
              qty_sold_season, ca_season_ht, margin_ht_season,
              SAFE_DIVIDE(margin_ht_season, ca_season_ht) * 100  AS margin_rate,
              SAFE_DIVIDE(ca_season_ht - ca_prev_season_ht, ca_prev_season_ht) * 100
                                                                  AS ca_trend_season_pct,
              ca_prev_season_ht, nb_clients_season, current_stock,
              SAFE_DIVIDE(qty_sold_season, qty_sold_season + IFNULL(current_stock, 0)) * 100
                                                                  AS sell_through_pct
            FROM agg
            ORDER BY {order}
            LIMIT 500
        """
    else:
        sql = f"""SELECT item_id, item_caption, type_vetement,
                         qty_sold_season, ca_season_ht, margin_ht_season, margin_rate,
                         ca_trend_season_pct, ca_prev_season_ht, nb_clients_season,
                         current_stock, sell_through_pct, season_label
                  FROM {dtm('mart_item_catalog')}
                  WHERE {where}
                  ORDER BY {order}
                  LIMIT 500"""

    df = run_query(sql, params)

    types_df = run_query(
        f"""SELECT DISTINCT type_vetement FROM {dtm('mart_item_catalog')}
            WHERE boutique_id IN UNNEST(@boutiques) ORDER BY 1""",
        [boutique_param(boutique)],
    )
    types = [str(r["type_vetement"]) for _, r in types_df.iterrows() if r["type_vetement"]]

    def _s(v): return float(v) if pd.notna(v) else None

    return {
        "season_label": str(df["season_label"].iloc[0]) if len(df) > 0 else None,
        "types": types,
        "items": [
            {
                "item_id":           str(r["item_id"]),
                "item_caption":      str(r["item_caption"]),
                "type_vetement":     str(r["type_vetement"]),
                "qty_sold_season":   int(r["qty_sold_season"]) if pd.notna(r["qty_sold_season"]) else 0,
                "ca_season_ht":      _s(r["ca_season_ht"]),
                "margin_ht_season":  _s(r["margin_ht_season"]),
                "margin_rate":       _s(r["margin_rate"]),
                "ca_trend_pct":      _s(r["ca_trend_season_pct"]),
                "ca_prev_season_ht": _s(r["ca_prev_season_ht"]),
                "nb_clients_season": int(r["nb_clients_season"]) if pd.notna(r["nb_clients_season"]) else 0,
                "current_stock":     _s(r["current_stock"]),
                "sell_through_pct":  _s(r["sell_through_pct"]),
            }
            for _, r in df.iterrows()
        ],
    }


@router.get("/api/articles/{item_id}/clients")
def get_article_clients(item_id: str, boutique: str = Depends(valid_boutique)):
    with _lock:
        key = f"art_clients:{boutique}:{item_id}"
        if key not in _cache:
            df = run_query(
                f"""SELECT customer_key, customer_id, customer_name,
                           total_qty, total_ca_ht, nb_orders, last_order_date, rank
                    FROM {dtm('mart_item_clients')}
                    WHERE item_id = @item_id AND boutique_id IN UNNEST(@boutiques)
                    ORDER BY rank""",
                [p("item_id", item_id), boutique_param(boutique)],
            )

            def _s(v): return float(v) if pd.notna(v) else None

            _cache[key] = [
                {
                    "customer_key":  str(r["customer_key"]),
                    "customer_id":   str(r["customer_id"]),
                    "customer_name": str(r["customer_name"]),
                    "total_qty":     int(r["total_qty"]) if pd.notna(r["total_qty"]) else 0,
                    "total_ca_ht":   _s(r["total_ca_ht"]),
                    "nb_orders":     int(r["nb_orders"]) if pd.notna(r["nb_orders"]) else 0,
                    "last_order_date": r["last_order_date"].isoformat() if pd.notna(r["last_order_date"]) else None,
                }
                for _, r in df.iterrows()
            ]
        return _cache[key]
