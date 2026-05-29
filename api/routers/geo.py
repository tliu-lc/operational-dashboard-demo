import json
import re
from datetime import date
from pathlib import Path
from fastapi import APIRouter, Depends, Query
import pandas as pd
import threading
from cachetools import TTLCache
from google.cloud import bigquery
from api.bq import run_query, dtm, dwh, p
from api.dependencies import valid_boutique, valid_period, boutique_param

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _custom_range(from_date: str | None, to_date: str | None) -> tuple[date, date] | None:
    """Retourne (start, end) si les deux dates sont valides, sinon None."""
    if not (from_date and to_date and DATE_RE.match(from_date) and DATE_RE.match(to_date)):
        return None
    try:
        start = date.fromisoformat(from_date)
        end   = date.fromisoformat(to_date)
        if start > end:
            start, end = end, start
        today = date.today()
        if end > today:
            end = today
        return start, end
    except ValueError:
        return None

router = APIRouter()

GEOJSON_PATH = Path(__file__).parent.parent.parent / "data" / "ref" / "departments.geojson"
_geojson_cache: dict | None = None
_cache = TTLCache(maxsize=200, ttl=300)
_lock  = threading.Lock()

FRANCE_GROUP = frozenset({"FR","GP","RE","GF","MQ","YT","PM","BL","MF"})


def _load_geojson():
    global _geojson_cache
    if _geojson_cache is None:
        with open(GEOJSON_PATH) as f:
            _geojson_cache = json.load(f)
    return _geojson_cache


try:
    import pycountry as _pycountry

    def _iso2_to_iso3(code: str) -> str:
        c = _pycountry.countries.get(alpha_2=code)
        return c.alpha_3 if c else code

    def _iso2_to_name(code: str) -> str:
        c = _pycountry.countries.get(alpha_2=code)
        return c.name if c else code

except ImportError:
    _ISO2_TO_ISO3: dict[str, str] = {
        "BE": "BEL", "DE": "DEU", "GB": "GBR", "IT": "ITA", "ES": "ESP",
        "NL": "NLD", "CH": "CHE", "LU": "LUX", "PT": "PRT", "AT": "AUT",
        "PL": "POL", "SE": "SWE", "NO": "NOR", "DK": "DNK", "FI": "FIN",
        "IE": "IRL", "GR": "GRC", "CZ": "CZE", "HU": "HUN", "RO": "ROU",
        "MA": "MAR", "TN": "TUN", "DZ": "DZA", "US": "USA", "CA": "CAN",
        "JP": "JPN", "AU": "AUS", "AE": "ARE", "MC": "MCO",
    }
    _ISO2_TO_NAME: dict[str, str] = {
        "BE": "Belgique", "DE": "Allemagne", "GB": "Royaume-Uni", "IT": "Italie",
        "ES": "Espagne", "NL": "Pays-Bas", "CH": "Suisse", "LU": "Luxembourg",
        "PT": "Portugal", "AT": "Autriche", "PL": "Pologne", "SE": "Suède",
        "NO": "Norvège", "DK": "Danemark", "FI": "Finlande", "IE": "Irlande",
        "GR": "Grèce", "CZ": "Rép. tchèque", "HU": "Hongrie", "RO": "Roumanie",
        "MA": "Maroc", "TN": "Tunisie", "DZ": "Algérie", "US": "États-Unis",
        "CA": "Canada", "JP": "Japon", "AU": "Australie", "AE": "Émirats arabes unis",
        "MC": "Monaco",
    }

    def _iso2_to_iso3(code: str) -> str: return _ISO2_TO_ISO3.get(code, code)
    def _iso2_to_name(code: str) -> str: return _ISO2_TO_NAME.get(code, code)


@router.get("/api/geo/geojson")
def get_geojson():
    return _load_geojson()


@router.get("/api/geo/countries-all")
def get_countries_all():
    """
    Liste de tous les pays (ISO-3) avec leur nom français.
    Utilisé côté frontend pour permettre le hover sur les pays sans clients.
    """
    try:
        import pycountry as _pc
        result = []
        for c in _pc.countries:
            iso2 = getattr(c, "alpha_2", None)
            iso3 = getattr(c, "alpha_3", None)
            if not iso2 or not iso3:
                continue
            # Skip France et DOM/TOM (gérés dans la vue France)
            if iso2 in FRANCE_GROUP:
                continue
            result.append({
                "iso2": iso2,
                "iso3": iso3,
                "name": _iso2_to_name(iso2),
            })
        return result
    except Exception:
        # Fallback minimal si pycountry n'est pas dispo
        return []


@router.get("/api/geo/france")
def get_france(
    boutique: str = Depends(valid_boutique),
    period: int = Depends(valid_period),
    from_date: str | None = Query(None, alias="from"),
    to_date:   str | None = Query(None, alias="to"),
):
    custom = _custom_range(from_date, to_date)
    cache_suffix = f"custom:{custom[0].isoformat()}:{custom[1].isoformat()}" if custom else f"period:{period}"
    with _lock:
        key = f"geo_france:{boutique}:{cache_suffix}"
        if key not in _cache:
            coverage_df = run_query(
                f"""SELECT
                        COUNT(*) AS total,
                        COUNTIF(zip_code IS NULL OR LENGTH(TRIM(zip_code)) < 4) AS no_zip
                    FROM {dwh('stg_customers')}""",
            )
            total  = int(coverage_df["total"].iloc[0])
            no_zip = int(coverage_df["no_zip"].iloc[0])

            def _s(v): return float(v) if pd.notna(v) else None

            # NOTE : le fast path mart_geo_sales est désactivé car il n'exclut
            # pas les clients non-français (ex: ES zip 41xxx → dept 41).
            # On utilise toujours la requête dynamique qui filtre par country_iso_code.
            # À réactiver une fois mart_geo_sales mis à jour côté dbt.
            if False:
                pass
            else:
                if custom:
                    date_filter = "AND s.document_date BETWEEN @start AND @end"
                    extra_params = [
                        bigquery.ScalarQueryParameter("start", "DATE", custom[0]),
                        bigquery.ScalarQueryParameter("end",   "DATE", custom[1]),
                    ]
                elif period > 0:
                    date_filter = f"AND s.document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period} MONTH)"
                    extra_params = []
                else:
                    date_filter = ""
                    extra_params = []

                # FRANCE_GROUP doit matcher Python : on filtre côté SQL
                france_iso = "'" + "','".join(sorted(FRANCE_GROUP)) + "'"
                df_geo = run_query(
                    f"""WITH customers_geo AS (
                            SELECT customer_key, boutique_id,
                                CASE
                                    WHEN zip_code LIKE '97%%' AND LENGTH(TRIM(zip_code)) >= 3
                                        THEN SUBSTR(TRIM(zip_code), 1, 3)
                                    WHEN SAFE_CAST(SUBSTR(TRIM(zip_code), 1, 2) AS INT64) IS NOT NULL
                                        THEN SUBSTR(TRIM(zip_code), 1, 2)
                                    ELSE NULL
                                END AS dept_code
                            FROM {dwh('stg_customers')}
                            WHERE zip_code IS NOT NULL
                              AND boutique_id IN UNNEST(@boutiques)
                              AND (country_iso_code IS NULL OR country_iso_code IN ({france_iso}))
                        ),
                        dept_agg AS (
                            SELECT cg.dept_code,
                                SUM(s.amount_ht)               AS revenue_ht,
                                COUNT(DISTINCT s.customer_key) AS active_customers,
                                COUNT(DISTINCT s.id)           AS order_count
                            FROM {dwh('stg_sale_documents')} s
                            JOIN customers_geo cg
                                ON cg.customer_key = s.customer_key
                               AND cg.boutique_id  = s.boutique_id
                            WHERE s.is_valid_sale = TRUE {date_filter}
                              AND cg.dept_code IS NOT NULL
                            GROUP BY cg.dept_code
                        )
                        SELECT d.dept_code,
                            COALESCE(ref.dept_name, d.dept_code) AS dept_name,
                            d.revenue_ht,
                            d.active_customers,
                            d.order_count,
                            CASE WHEN d.order_count = 0 THEN NULL
                                 ELSE ROUND(SAFE_DIVIDE(d.revenue_ht, d.order_count), 2)
                            END AS avg_basket_ht
                        FROM dept_agg d
                        LEFT JOIN {dwh('ref_departments')} ref ON ref.dept_code = d.dept_code
                        WHERE (d.dept_code >= '01' AND d.dept_code <= '95')
                           OR d.dept_code IN ('2A', '2B')
                        ORDER BY revenue_ht DESC""",
                    [boutique_param(boutique)] + extra_params,
                )

            by_dept = [
                {
                    "dept_code":        str(r["dept_code"]),
                    "dept_name":        str(r["dept_name"]) if pd.notna(r["dept_name"]) else str(r["dept_code"]),
                    "revenue_ht":       _s(r["revenue_ht"]),
                    "active_customers": int(r["active_customers"]) if pd.notna(r["active_customers"]) else 0,
                    "order_count":      int(r["order_count"]) if pd.notna(r["order_count"]) else 0,
                    "avg_basket_ht":    _s(r["avg_basket_ht"]),
                }
                for _, r in df_geo.iterrows()
            ]
            _cache[key] = {"by_dept": by_dept, "coverage": {"total": total, "no_zip": no_zip}}
        return _cache[key]


@router.get("/api/geo/international")
def get_international(
    boutique: str = Depends(valid_boutique),
    period: int = Depends(valid_period),
    from_date: str | None = Query(None, alias="from"),
    to_date:   str | None = Query(None, alias="to"),
):
    custom = _custom_range(from_date, to_date)
    cache_suffix = f"custom:{custom[0].isoformat()}:{custom[1].isoformat()}" if custom else f"period:{period}"
    with _lock:
        key = f"geo_intl:{boutique}:{cache_suffix}"
        if key not in _cache:
            def _s(v): return float(v) if pd.notna(v) else None

            if not custom and period == 12:
                # GROUP BY pour aggréger les doublons quand boutique=ALL (2 lignes par pays)
                df = run_query(
                    f"""SELECT country_iso_code,
                               SUM(nb_customers_total)        AS nb_customers_total,
                               SUM(nb_customers_actifs_12m)   AS nb_customers_actifs,
                               SUM(ca_12m_ht)                 AS ca_ht,
                               SUM(nb_orders_12m)             AS nb_orders
                        FROM {dtm('mart_geo_international')}
                        WHERE boutique_id IN UNNEST(@boutiques) AND is_france_group = FALSE
                        GROUP BY country_iso_code
                        HAVING SUM(ca_12m_ht) > 0
                        ORDER BY ca_ht DESC""",
                    [boutique_param(boutique)],
                )
            else:
                if custom:
                    date_filter = "AND s.document_date BETWEEN @start AND @end"
                    extra_params = [
                        bigquery.ScalarQueryParameter("start", "DATE", custom[0]),
                        bigquery.ScalarQueryParameter("end",   "DATE", custom[1]),
                    ]
                elif period > 0:
                    date_filter = f"AND s.document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period} MONTH)"
                    extra_params = []
                else:
                    date_filter = ""
                    extra_params = []
                df = run_query(
                    f"""WITH all_cust AS (
                            SELECT country_iso_code,
                                COUNT(DISTINCT customer_key) AS nb_customers_total
                            FROM {dwh('stg_customers')}
                            WHERE boutique_id IN UNNEST(@boutiques)
                              AND country_iso_code IS NOT NULL AND country_iso_code != ''
                              AND country_iso_code NOT IN ('FR','GP','RE','GF','MQ','YT','PM','BL','MF')
                            GROUP BY country_iso_code
                        ),
                        period_agg AS (
                            SELECT c.country_iso_code,
                                COUNT(DISTINCT s.customer_key) AS nb_customers_actifs,
                                COALESCE(SUM(s.amount_ht), 0)  AS ca_ht,
                                COUNT(DISTINCT s.id)            AS nb_orders
                            FROM {dwh('stg_customers')} c
                            JOIN {dwh('stg_sale_documents')} s
                                ON s.customer_key = c.customer_key
                               AND s.boutique_id  = c.boutique_id
                               AND s.is_valid_sale = TRUE {date_filter}
                            WHERE c.boutique_id IN UNNEST(@boutiques)
                              AND c.country_iso_code IS NOT NULL AND c.country_iso_code != ''
                              AND c.country_iso_code NOT IN ('FR','GP','RE','GF','MQ','YT','PM','BL','MF')
                            GROUP BY c.country_iso_code
                        )
                        SELECT ac.country_iso_code,
                            ac.nb_customers_total,
                            COALESCE(pa.nb_customers_actifs, 0) AS nb_customers_actifs,
                            COALESCE(pa.ca_ht, 0)               AS ca_ht,
                            COALESCE(pa.nb_orders, 0)           AS nb_orders
                        FROM all_cust ac
                        LEFT JOIN period_agg pa ON pa.country_iso_code = ac.country_iso_code
                        WHERE COALESCE(pa.ca_ht, 0) > 0
                        ORDER BY ca_ht DESC""",
                    [boutique_param(boutique)] + extra_params,
                )

            _cache[key] = [
                {
                    "country_iso_code":    str(r["country_iso_code"]),
                    "country_iso3":        _iso2_to_iso3(str(r["country_iso_code"])),
                    "country_name":        _iso2_to_name(str(r["country_iso_code"])),
                    "nb_customers_total":  int(r["nb_customers_total"]) if pd.notna(r["nb_customers_total"]) else 0,
                    "nb_customers_actifs": int(r["nb_customers_actifs"]) if pd.notna(r["nb_customers_actifs"]) else 0,
                    "ca_ht":               _s(r["ca_ht"]),
                    "nb_orders":           int(r["nb_orders"]) if pd.notna(r["nb_orders"]) else 0,
                }
                for _, r in df.iterrows()
            ]
        return _cache[key]


@router.get("/api/geo/country/{country_iso2}")
def get_country_customers(
    country_iso2: str,
    boutique: str = Depends(valid_boutique),
    period: int = Depends(valid_period),
    from_date: str | None = Query(None, alias="from"),
    to_date:   str | None = Query(None, alias="to"),
):
    """Liste des clients d'un pays ayant commandé dans la plage de dates."""
    custom = _custom_range(from_date, to_date)
    cache_suffix = (f"custom:{custom[0].isoformat()}:{custom[1].isoformat()}"
                    if custom else f"period:{period}")
    with _lock:
        key = f"geo_country:{boutique}:{country_iso2}:{cache_suffix}"
        if key in _cache:
            return _cache[key]

        if custom:
            date_clause = "AND s.document_date BETWEEN @start AND @end"
            date_params = [
                bigquery.ScalarQueryParameter("start", "DATE", custom[0]),
                bigquery.ScalarQueryParameter("end",   "DATE", custom[1]),
            ]
        elif period > 0:
            date_clause = f"AND s.document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period} MONTH)"
            date_params = []
        else:
            date_clause = ""
            date_params = []

        if boutique == "ALL":
            boutiques_clause = "c.boutique_id IN ('SED','HIP')"
            sales_boutique_clause = "s.boutique_id IN ('SED','HIP')"
            group_key = "c.unified_key"
            extra_params = []
        else:
            boutiques_clause = "c.boutique_id IN UNNEST(@boutiques)"
            sales_boutique_clause = "s.boutique_id IN UNNEST(@boutiques)"
            group_key = "c.customer_key"
            extra_params = [boutique_param(boutique)]

        query = f"""
            WITH customers_country AS (
                SELECT c.customer_key, c.unified_key, c.id, c.name, c.city
                FROM {dwh('stg_customers')} c
                WHERE {boutiques_clause}
                  AND c.country_iso_code = @country
                  AND c.country_iso_code NOT IN ('FR','GP','RE','GF','MQ','YT','PM','BL','MF')
            ),
            period_sales AS (
                SELECT s.customer_key,
                       SUM(s.amount_ht)     AS ca_period,
                       MAX(s.document_date) AS last_order_date
                FROM {dwh('stg_sale_documents')} s
                WHERE {sales_boutique_clause}
                  AND s.is_valid_sale = TRUE
                  {date_clause}
                GROUP BY s.customer_key
            )
            SELECT {group_key}                AS group_key,
                   ANY_VALUE(c.id)            AS customer_id,
                   ANY_VALUE(c.name)          AS customer_name,
                   ANY_VALUE(c.city)          AS city,
                   SUM(ps.ca_period)          AS ca_total_ht,
                   MAX(ps.last_order_date)    AS last_order_date
            FROM customers_country c
            JOIN period_sales ps ON ps.customer_key = c.customer_key
            WHERE ps.ca_period IS NOT NULL AND ps.ca_period > 0
            GROUP BY group_key
            ORDER BY ca_total_ht DESC
            LIMIT 100
        """

        df = run_query(query, [p("country", country_iso2.upper())] + extra_params + date_params)

        def _sf(v): return float(v) if pd.notna(v) else None

        _cache[key] = [
            {
                "customer_id":     str(r["customer_id"]),
                "customer_name":   str(r["customer_name"]),
                "city":            str(r["city"]) if pd.notna(r["city"]) else None,
                "ca_total_ht":     _sf(r["ca_total_ht"]),
                "ca_12m_ht":       _sf(r["ca_total_ht"]),
                "last_order_date": r["last_order_date"].isoformat() if pd.notna(r["last_order_date"]) else None,
                "churn_color":     "vert",
            }
            for _, r in df.iterrows()
        ]
        return _cache[key]


@router.get("/api/geo/dept/{dept_code}")
def get_dept_customers(
    dept_code: str,
    boutique: str = Depends(valid_boutique),
    period: int = Depends(valid_period),
    from_date: str | None = Query(None, alias="from"),
    to_date:   str | None = Query(None, alias="to"),
):
    """Liste des clients d'un département ayant commandé dans la plage de dates."""
    custom = _custom_range(from_date, to_date)
    cache_suffix = (f"custom:{custom[0].isoformat()}:{custom[1].isoformat()}"
                    if custom else f"period:{period}")
    with _lock:
        key = f"geo_dept:{boutique}:{dept_code}:{cache_suffix}"
        if key in _cache:
            return _cache[key]

        # Construction du filtre de date sur stg_sale_documents
        if custom:
            date_clause = "AND s.document_date BETWEEN @start AND @end"
            date_params = [
                bigquery.ScalarQueryParameter("start", "DATE", custom[0]),
                bigquery.ScalarQueryParameter("end",   "DATE", custom[1]),
            ]
        elif period > 0:
            date_clause = f"AND s.document_date >= DATE_SUB(CURRENT_DATE(), INTERVAL {period} MONTH)"
            date_params = []
        else:
            date_clause = ""
            date_params = []

        # En boutique ALL : on agrège par unified_key (1 client physique = 1 ligne)
        # Sinon : ligne par client de la boutique sélectionnée
        if boutique == "ALL":
            boutiques_clause = "c.boutique_id IN ('SED','HIP')"
            sales_boutique_clause = "s.boutique_id IN ('SED','HIP')"
            group_key = "c.unified_key"
            id_select = "ANY_VALUE(c.id) AS customer_id, ANY_VALUE(c.name) AS customer_name, ANY_VALUE(c.city) AS city"
            extra_params = []
        else:
            boutiques_clause = "c.boutique_id IN UNNEST(@boutiques)"
            sales_boutique_clause = "s.boutique_id IN UNNEST(@boutiques)"
            group_key = "c.customer_key"
            id_select = "ANY_VALUE(c.id) AS customer_id, ANY_VALUE(c.name) AS customer_name, ANY_VALUE(c.city) AS city"
            extra_params = [boutique_param(boutique)]

        query = f"""
            WITH customers_dept AS (
                SELECT c.customer_key, c.unified_key, c.id, c.name, c.city, c.boutique_id
                FROM {dwh('stg_customers')} c
                WHERE {boutiques_clause}
                  AND c.dept_code = @dept
                  AND (c.country_iso_code IS NULL
                       OR c.country_iso_code IN ('FR','GP','RE','GF','MQ','YT','PM','BL','MF'))
            ),
            period_sales AS (
                SELECT s.customer_key,
                       SUM(s.amount_ht)        AS ca_period,
                       MAX(s.document_date)    AS last_order_date,
                       COUNT(DISTINCT s.id)    AS nb_orders
                FROM {dwh('stg_sale_documents')} s
                WHERE {sales_boutique_clause}
                  AND s.is_valid_sale = TRUE
                  {date_clause}
                GROUP BY s.customer_key
            )
            SELECT {group_key} AS group_key,
                   {id_select},
                   SUM(ps.ca_period)         AS ca_total_ht,
                   MAX(ps.last_order_date)   AS last_order_date,
                   SUM(ps.nb_orders)         AS nb_orders
            FROM customers_dept c
            JOIN period_sales ps ON ps.customer_key = c.customer_key
            WHERE ps.ca_period IS NOT NULL AND ps.ca_period > 0
            GROUP BY group_key
            ORDER BY ca_total_ht DESC
            LIMIT 100
        """

        df = run_query(query, [p("dept", dept_code)] + extra_params + date_params)

        def _sf(v): return float(v) if pd.notna(v) else None

        _cache[key] = [
            {
                "customer_id":     str(r["customer_id"]),
                "customer_name":   str(r["customer_name"]),
                "city":            str(r["city"]) if pd.notna(r["city"]) else None,
                "ca_total_ht":     _sf(r["ca_total_ht"]),
                "ca_12m_ht":       _sf(r["ca_total_ht"]),  # alias pour compat frontend
                "last_order_date": r["last_order_date"].isoformat() if pd.notna(r["last_order_date"]) else None,
                "churn_color":     "vert",
            }
            for _, r in df.iterrows()
        ]
        return _cache[key]
