import logging
import re
import threading
from datetime import date, timedelta
import pandas as pd
from cachetools import TTLCache
from fastapi import APIRouter, Depends, Query
from google.cloud import bigquery
from api.bq import run_query, dwh, p
from api.dependencies import valid_boutique, boutique_param

router = APIRouter()
_cache = TTLCache(maxsize=200, ttl=300)
_lock  = threading.Lock()

VALID_DAYS         = {30, 60, 90, 180, 365}
VALID_DAYS_MOIS    = {180, 365, 730, 1095, 0}   # 6m, 12m, 24m (def), 36m, Tout (0)
VALID_DAYS_SEMAINE = {90, 180, 365, 730}        # 3m, 6m, 12m (def), 24m
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parse_range(days: int, from_date: str | None, to_date: str | None,
                 valid: set[int] = VALID_DAYS, default: int = 90) -> tuple[date, date, str]:
    """
    Retourne (start_date, end_date, cache_key_suffix).
    - Si from_date + to_date sont valides → range custom.
    - Si days == 0 et 0 ∈ valid → "tout" (10 ans en arrière, garde-fou).
    - Sinon → derniers `days` jours jusqu'à aujourd'hui.
    """
    today = date.today()
    if from_date and to_date and DATE_RE.match(from_date) and DATE_RE.match(to_date):
        try:
            start = date.fromisoformat(from_date)
            end   = date.fromisoformat(to_date)
            if start > end:
                start, end = end, start
            if end > today:
                end = today
            return start, end, f"custom:{start.isoformat()}:{end.isoformat()}"
        except ValueError:
            pass
    if days not in valid:
        days = default
    if days == 0:
        # "Tout" = 10 ans glissants max
        return today - timedelta(days=3650), today, "days:all"
    return today - timedelta(days=days), today, f"days:{days}"


@router.get("/api/analyse/ca-par-jour")
def get_ca_par_jour(
    boutique: str = Depends(valid_boutique),
    days: int = 90,
    from_date: str | None = Query(None, alias="from"),
    to_date:   str | None = Query(None, alias="to"),
):
    start, end, suffix = _parse_range(days, from_date, to_date)
    key = f"ca-par-jour:{boutique}:{suffix}"
    with _lock:
        if key not in _cache:
            _cache[key] = _fetch_ca_par_jour(boutique, start, end)
        return _cache[key]


def _fetch_ca_par_jour(boutique: str, start: date, end: date):
    df = run_query(
        f"""SELECT DATE(document_date) AS date, SUM(amount_ht) AS ca, COUNT(DISTINCT id) AS nb_orders
            FROM {dwh('stg_sale_documents')}
            WHERE boutique_id IN UNNEST(@boutiques)
              AND document_type = 2
              AND is_valid_sale = TRUE
              AND document_date BETWEEN @start AND @end
            GROUP BY date ORDER BY date""",
        [
            boutique_param(boutique),
            bigquery.ScalarQueryParameter("start", "DATE", start),
            bigquery.ScalarQueryParameter("end",   "DATE", end),
        ],
    )
    return {
        "from": start.isoformat(),
        "to":   end.isoformat(),
        "data": [
            {
                "date": r["date"].isoformat(),
                "ca": round(float(r["ca"]), 2) if pd.notna(r["ca"]) else 0.0,
                "nb_orders": int(r["nb_orders"]) if pd.notna(r["nb_orders"]) else 0,
            }
            for _, r in df.iterrows()
        ],
    }


@router.get("/api/analyse/ca-par-mois")
def get_ca_par_mois(
    boutique: str = Depends(valid_boutique),
    days: int = 730,
    from_date: str | None = Query(None, alias="from"),
    to_date:   str | None = Query(None, alias="to"),
):
    start, end, suffix = _parse_range(days, from_date, to_date, VALID_DAYS_MOIS, 730)
    key = f"ca-par-mois:{boutique}:{suffix}"
    with _lock:
        if key not in _cache:
            _cache[key] = _fetch_ca_par_mois(boutique, start, end)
        return _cache[key]


def _fetch_ca_par_mois(boutique: str, start: date, end: date):
    df = run_query(
        f"""SELECT FORMAT_DATE('%Y-%m', document_date) AS mois,
                   SUM(amount_ht) AS ca,
                   COUNT(DISTINCT id) AS nb_orders,
                   COUNT(DISTINCT customer_key) AS nb_clients
            FROM {dwh('stg_sale_documents')}
            WHERE boutique_id IN UNNEST(@boutiques)
              AND document_type = 2
              AND is_valid_sale = TRUE
              AND document_date BETWEEN @start AND @end
            GROUP BY mois ORDER BY mois""",
        [
            boutique_param(boutique),
            bigquery.ScalarQueryParameter("start", "DATE", start),
            bigquery.ScalarQueryParameter("end",   "DATE", end),
        ],
    )
    return {
        "from": start.isoformat(),
        "to":   end.isoformat(),
        "data": [
            {
                "mois": str(r["mois"]),
                "ca": round(float(r["ca"]), 2) if pd.notna(r["ca"]) else 0.0,
                "nb_orders": int(r["nb_orders"]) if pd.notna(r["nb_orders"]) else 0,
                "nb_clients": int(r["nb_clients"]) if pd.notna(r["nb_clients"]) else 0,
            }
            for _, r in df.iterrows()
        ]
    }


@router.get("/api/analyse/ventes-par-semaine")
def get_ventes_par_semaine(
    boutique: str = Depends(valid_boutique),
    days: int = 365,
    from_date: str | None = Query(None, alias="from"),
    to_date:   str | None = Query(None, alias="to"),
):
    start, end, suffix = _parse_range(days, from_date, to_date, VALID_DAYS_SEMAINE, 365)
    key = f"ventes-par-semaine:{boutique}:{suffix}"
    with _lock:
        if key not in _cache:
            _cache[key] = _fetch_ventes_par_semaine(boutique, start, end)
        return _cache[key]


def _fetch_ventes_par_semaine(boutique: str, start: date, end: date):
    df = run_query(
        f"""SELECT EXTRACT(DAYOFWEEK FROM document_date) AS dow,
                   SAFE_DIVIDE(SUM(amount_ht), COUNT(DISTINCT document_date)) AS avg_ca,
                   SUM(amount_ht) AS total_ca,
                   COUNT(DISTINCT document_date) AS nb_jours,
                   COUNT(*) AS nb_orders
            FROM {dwh('stg_sale_documents')}
            WHERE boutique_id IN UNNEST(@boutiques)
              AND document_type = 2
              AND is_valid_sale = TRUE
              AND document_date BETWEEN @start AND @end
            GROUP BY dow ORDER BY dow""",
        [
            boutique_param(boutique),
            bigquery.ScalarQueryParameter("start", "DATE", start),
            bigquery.ScalarQueryParameter("end",   "DATE", end),
        ],
    )
    dow_labels = {1: "Dim", 2: "Lun", 3: "Mar", 4: "Mer", 5: "Jeu", 6: "Ven", 7: "Sam"}
    return {
        "from": start.isoformat(),
        "to":   end.isoformat(),
        "data": [
            {
                "dow": int(r["dow"]),
                "label": dow_labels.get(int(r["dow"]), "?"),
                "avg_ca": round(float(r["avg_ca"]), 2) if pd.notna(r["avg_ca"]) else 0.0,
                "total_ca": round(float(r["total_ca"]), 2) if pd.notna(r["total_ca"]) else 0.0,
                "nb_jours": int(r["nb_jours"]) if pd.notna(r["nb_jours"]) else 0,
                "nb_orders": int(r["nb_orders"]) if pd.notna(r["nb_orders"]) else 0,
            }
            for _, r in df.iterrows()
        ]
    }


@router.get("/api/analyse/top-clients")
def get_top_clients(
    boutique: str = Depends(valid_boutique),
    days: int = 90,
    from_date: str | None = Query(None, alias="from"),
    to_date:   str | None = Query(None, alias="to"),
):
    start, end, suffix = _parse_range(days, from_date, to_date)
    key = f"top-clients:{boutique}:{suffix}"
    with _lock:
        if key not in _cache:
            _cache[key] = _fetch_top_clients(boutique, start, end)
        return _cache[key]


def _fetch_top_clients(boutique: str, start: date, end: date):
    df = run_query(
        f"""SELECT c.name AS customer_name,
                   SUM(d.amount_ht) AS ca,
                   COUNT(DISTINCT d.id) AS nb_orders,
                   SAFE_DIVIDE(SUM(d.amount_ht), COUNT(DISTINCT d.id)) AS panier_moyen
            FROM {dwh('stg_sale_documents')} d
            JOIN {dwh('stg_customers')} c
                ON c.customer_key = d.customer_key AND c.boutique_id = d.boutique_id
            WHERE d.boutique_id IN UNNEST(@boutiques)
              AND d.document_type = 2
              AND d.is_valid_sale = TRUE
              AND d.document_date BETWEEN @start AND @end
            GROUP BY c.name
            ORDER BY ca DESC
            LIMIT 10""",
        [
            boutique_param(boutique),
            bigquery.ScalarQueryParameter("start", "DATE", start),
            bigquery.ScalarQueryParameter("end",   "DATE", end),
        ],
    )
    return {
        "from": start.isoformat(),
        "to":   end.isoformat(),
        "clients": [
            {
                "customer_name": str(r["customer_name"]),
                "ca": round(float(r["ca"]), 2) if pd.notna(r["ca"]) else 0.0,
                "nb_orders": int(r["nb_orders"]) if pd.notna(r["nb_orders"]) else 0,
                "panier_moyen": round(float(r["panier_moyen"]), 2) if pd.notna(r["panier_moyen"]) else 0.0,
            }
            for _, r in df.iterrows()
        ],
    }
