"""Endpoints page Prospection — SIRENE NAF 47.71Z non-clients par département.

Modèle DATA-014 :
  - hippocampe_dtm.mart_prospects                 (flag is_prospect + match_rule)
  - hippocampe_dtm.mart_prospects_par_departement (agrégat carte)
  - hippocampe_prospects.prospect_status          (table éditable SIRET PK)
"""
import io
import logging
import os
import threading
from datetime import date
from typing import Literal

import pandas as pd
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import StreamingResponse
from google.cloud import bigquery
from pydantic import BaseModel, Field, field_validator

from api.bq import dtm, dwh, get_bq, p, run_query, PROJECT

router = APIRouter()

# Dataset éditable (table prospect_status) — distinct de hippocampe_dtm.
PROSPECTS_DATASET = os.environ.get("BQ_PROSPECTS_DATASET", "hippocampe_prospects")


def _prospects(table: str) -> str:
    return f"`{PROJECT}.{PROSPECTS_DATASET}.{table}`"


_cache = TTLCache(maxsize=200, ttl=300)
_lock = threading.Lock()

STATUTS_VALIDES = {"a_contacter", "contacte", "pas_interesse"}

# Sprint 19 / Filtre A — taxonomie complète des tags de type boutique calculés
# dans mart_prospects.shop_type_tags. Le tag spécial 'indetermine' correspond
# aux boutiques sans aucun mot-clé détecté (shop_type_tags = []).
SHOP_TYPES_TAXONOMY = [
    "femme", "homme", "enfant",
    "sport", "mariage", "friperie",
    "lingerie", "luxe", "grande_taille",
]
SHOP_TYPES_VALIDES = set(SHOP_TYPES_TAXONOMY) | {"indetermine"}

# Sprint 19 / Filtre C — buckets simplifiés du code catégorieJuridique INSEE.
FORMES_JURIDIQUES_VALIDES = {"societe", "ei", "autre"}

# Pas de préfixe p./s. — ORDER BY est appliqué dans la CTE `page` qui
# SELECT depuis `base`, où les colonnes sont déjà projetées sans alias.
SORTABLE_COLUMNS = {
    "denomination":     "denomination",
    "zip_code":         "zip_code",
    "dept_code":        "dept_code",
    "date_creation":    "date_creation",
    "statut":           "statut",
    "dernier_contact":  "dernier_contact",
    "score_prospect":   "score_prospect",
}


# ---------- Helpers ----------

def _to_str(v):  return str(v)            if pd.notna(v) else None
def _to_int(v):  return int(v)            if pd.notna(v) else None
def _to_float(v): return float(v)         if pd.notna(v) else None
def _to_date(v): return v.isoformat()     if pd.notna(v) else None


def _row_to_prospect(r: pd.Series) -> dict:
    tags = r.get("shop_type_tags")
    return {
        "siret":                    _to_str(r["siret"]),
        "siren":                    _to_str(r["siren"]),
        "denomination":             _to_str(r["denomination"]),
        "adresse_voie":             _to_str(r["adresse_voie"]),
        "adresse_complement":       _to_str(r["adresse_complement"]),
        "zip_code":                 _to_str(r["zip_code"]),
        "city":                     _to_str(r["city"]),
        "dept_code":                _to_str(r["dept_code"]),
        "date_creation":            _to_date(r["date_creation"]),
        "tranche_effectif_code":    _to_str(r["tranche_effectif_code"]),
        "tranche_effectif_libelle": _to_str(r["tranche_effectif_libelle"]),
        "etat_admin":               _to_str(r["etat_admin"]),
        "categorie_juridique":      _to_str(r["categorie_juridique"]),
        "forme_juridique":          _to_str(r["forme_juridique"]),
        "score_prospect":           _to_int(r["score_prospect"]) or 0,
        "shop_type_tags":           list(tags) if tags is not None and len(tags) else [],
        "is_chain":                 bool(r["is_chain"]) if pd.notna(r.get("is_chain")) else False,
        "statut":                   _to_str(r["statut"]) or "a_contacter",
        "note":                     _to_str(r["note"]),
        "dernier_contact":          _to_date(r["dernier_contact"]),
        "updated_at":               r["updated_at"].isoformat() if pd.notna(r["updated_at"]) else None,
    }


def _fetch_last_import_date():
    """Retourne la dernière modification de la table source SIRENE, ou None.

    `__TABLES__.last_modified_time` est un INT64 epoch ms.
    """
    try:
        df = run_query(
            f"""SELECT TIMESTAMP_MILLIS(MAX(last_modified_time)) AS ts
                FROM `{PROJECT}.hippocampe_raw.__TABLES__`
                WHERE table_id = 'raw_sirene_etab'""",
        )
        if df.empty or pd.isna(df["ts"].iloc[0]):
            return None
        return df["ts"].iloc[0].date().isoformat()
    except Exception:
        return None


# ---------- GET /api/prospects/par-departement ----------

@router.get("/api/prospects/par-departement")
def get_prospects_par_departement():
    """Agrégation par département pour la carte + totaux globaux (header)."""
    with _lock:
        key = "prospects_par_dept"
        if key in _cache:
            return _cache[key]

    try:
        df = run_query(
            f"""SELECT code_departement,
                       nom_departement,
                       nb_sirene_total,
                       nb_clients,
                       nb_prospects_nets,
                       nb_matches_incertains,
                       taux_penetration_pct
                FROM {dtm('mart_prospects_par_departement')}
                ORDER BY code_departement""",
        )
    except Exception:
        logging.exception("BQ error prospects par dept")
        return {
            "departements": [],
            "totals": None,
            "last_import_date": None,
            "error": "Erreur de chargement des données",
        }

    departements = [
        {
            "code_departement":      _to_str(r["code_departement"]),
            "nom_departement":       _to_str(r["nom_departement"]),
            "nb_sirene_total":       _to_int(r["nb_sirene_total"]) or 0,
            "nb_clients":            _to_int(r["nb_clients"]) or 0,
            "nb_prospects_nets":     _to_int(r["nb_prospects_nets"]) or 0,
            "nb_matches_incertains": _to_int(r["nb_matches_incertains"]) or 0,
            "taux_penetration_pct":  _to_float(r["taux_penetration_pct"]),
        }
        for _, r in df.iterrows()
    ]

    nb_sirene_total       = sum(d["nb_sirene_total"]       for d in departements)
    nb_clients            = sum(d["nb_clients"]            for d in departements)
    nb_prospects_nets     = sum(d["nb_prospects_nets"]     for d in departements)
    nb_matches_incertains = sum(d["nb_matches_incertains"] for d in departements)
    taux = round(nb_clients / nb_sirene_total * 100, 1) if nb_sirene_total > 0 else None

    payload = {
        "departements": departements,
        "totals": {
            "nb_sirene_total":       nb_sirene_total,
            "nb_clients":            nb_clients,
            "nb_prospects_nets":     nb_prospects_nets,
            "nb_matches_incertains": nb_matches_incertains,
            "taux_penetration_pct":  taux,
        },
        "last_import_date": _fetch_last_import_date(),
    }
    with _lock:
        _cache[key] = payload
    return payload


# ---------- GET /api/prospects (liste paginée) ----------

def _build_prospects_query(
    dept: str | None,
    statuts: list[str] | None,
    tranches: list[str] | None,
    search: str | None,
    cp_prefix: str | None,
    date_from: str | None,
    date_to: str | None,
    regions: list[str] | None,
    has_denomination: bool,
    shop_types: list[str] | None,
    include_chains: bool,
    formes_juridiques: list[str] | None,
    score_min: int | None,
    sort_col: str,
    sort_dir: str,
    limit: int,
    offset: int,
) -> tuple[str, list]:
    """Compose la requête liste + params, avec WHERE dynamique."""
    where = ["p.is_prospect = TRUE"]
    params: list = []

    if dept:
        where.append("p.dept_code = @dept")
        params.append(p("dept", dept))
    if statuts:
        where.append("COALESCE(s.statut, 'a_contacter') IN UNNEST(@statuts)")
        params.append(bigquery.ArrayQueryParameter("statuts", "STRING", statuts))
    if tranches:
        where.append("p.tranche_effectif_code IN UNNEST(@tranches)")
        params.append(bigquery.ArrayQueryParameter("tranches", "STRING", tranches))
    if search:
        pattern = f"%{search.strip()}%"
        where.append("(LOWER(p.denomination) LIKE LOWER(@pat) OR p.siret LIKE @pat OR LOWER(p.city) LIKE LOWER(@pat))")
        params.append(p("pat", pattern))
    if cp_prefix:
        # Garde uniquement les chiffres pour éviter injection LIKE wildcards
        cp_clean = "".join(c for c in cp_prefix if c.isdigit())
        if cp_clean:
            where.append("p.zip_code LIKE @cp_pat")
            params.append(p("cp_pat", f"{cp_clean}%"))
    if date_from:
        where.append("p.date_creation >= @date_from")
        params.append(bigquery.ScalarQueryParameter("date_from", "DATE", date.fromisoformat(date_from)))
    if date_to:
        where.append("p.date_creation <= @date_to")
        params.append(bigquery.ScalarQueryParameter("date_to", "DATE", date.fromisoformat(date_to)))
    if regions:
        where.append("r.region_name IN UNNEST(@regions)")
        params.append(bigquery.ArrayQueryParameter("regions", "STRING", regions))
    if has_denomination:
        where.append("p.denomination IS NOT NULL AND TRIM(p.denomination) NOT IN ('', '[ND]')")
    if shop_types:
        # 'indetermine' = aucun tag détecté (shop_type_tags vide).
        # Combiné avec d'autres tags réels en OR : femme + indetermine = "boutiques
        # femme OU sans classification".
        has_indeterminate = "indetermine" in shop_types
        real_tags = [t for t in shop_types if t != "indetermine"]
        clauses = []
        if real_tags:
            clauses.append("EXISTS (SELECT 1 FROM UNNEST(p.shop_type_tags) tag WHERE tag IN UNNEST(@shop_types))")
            params.append(bigquery.ArrayQueryParameter("shop_types", "STRING", real_tags))
        if has_indeterminate:
            clauses.append("ARRAY_LENGTH(p.shop_type_tags) = 0")
        if clauses:
            where.append(f"({' OR '.join(clauses)})")
    if not include_chains:
        where.append("p.is_chain = FALSE")
    if formes_juridiques:
        where.append("p.forme_juridique IN UNNEST(@formes)")
        params.append(bigquery.ArrayQueryParameter("formes", "STRING", formes_juridiques))
    if score_min is not None and score_min > 0:
        where.append("p.score_prospect >= @score_min")
        params.append(bigquery.ScalarQueryParameter("score_min", "INT64", score_min))

    where_sql = " AND ".join(where)
    order_sql = f"{sort_col} {sort_dir}, denomination ASC"

    query = f"""
        WITH base AS (
            SELECT p.siret, p.siren, p.denomination, p.adresse_voie, p.adresse_complement,
                   p.zip_code, p.city, p.dept_code, p.date_creation,
                   p.tranche_effectif_code, p.tranche_effectif_libelle, p.etat_admin,
                   p.categorie_juridique, p.forme_juridique, p.score_prospect,
                   p.shop_type_tags, p.is_chain,
                   COALESCE(s.statut, 'a_contacter') AS statut,
                   s.note, s.dernier_contact, s.updated_at
            FROM {dtm('mart_prospects')} p
            LEFT JOIN {_prospects('prospect_status')} s ON s.siret = p.siret
            LEFT JOIN {dwh('ref_departments')}        r ON r.dept_code = p.dept_code
            WHERE {where_sql}
        ),
        counts AS (
            SELECT COUNT(*) AS total,
                   COUNTIF(statut = 'a_contacter')   AS nb_a_contacter,
                   COUNTIF(statut = 'contacte')      AS nb_contacte,
                   COUNTIF(statut = 'pas_interesse') AS nb_pas_interesse
            FROM base
        ),
        page AS (
            SELECT * FROM base
            ORDER BY {order_sql}
            LIMIT @limit OFFSET @offset
        )
        SELECT
          (SELECT total            FROM counts) AS _total,
          (SELECT nb_a_contacter   FROM counts) AS _nb_a_contacter,
          (SELECT nb_contacte      FROM counts) AS _nb_contacte,
          (SELECT nb_pas_interesse FROM counts) AS _nb_pas_interesse,
          page.*
        FROM page
    """
    params += [
        bigquery.ScalarQueryParameter("limit",  "INT64", limit),
        bigquery.ScalarQueryParameter("offset", "INT64", offset),
    ]
    return query, params


@router.get("/api/prospects")
def list_prospects(
    dept:    str | None = Query(None, description="Code département 2 ou 3 chiffres"),
    statut:  list[str] | None = Query(None, description="Filtre statut (multi)"),
    tranche: list[str] | None = Query(None, description="Filtre tranche effectif (multi)"),
    search:  str | None = Query(None, description="Recherche dénomination/SIRET/ville"),
    cp_prefix: str | None = Query(None, description="Préfixe code postal (ex: '75' = Paris)"),
    date_from: str | None = Query(None, description="Date création min (YYYY-MM-DD)"),
    date_to:   str | None = Query(None, description="Date création max (YYYY-MM-DD)"),
    region:    list[str] | None = Query(None, description="Filtre région (multi)"),
    has_denomination: bool = Query(True, description="Exclure prospects sans dénomination ([ND]/NULL)"),
    shop_type: list[str] | None = Query(None, description=f"Filtre type boutique (multi) : {sorted(SHOP_TYPES_VALIDES)}"),
    include_chains: bool = Query(False, description="Inclure les chaînes nationales connues (défaut : exclues)"),
    forme_juridique: list[str] | None = Query(None, description=f"Filtre forme juridique (multi) : {sorted(FORMES_JURIDIQUES_VALIDES)}"),
    score_min: int = Query(0, ge=0, le=100, description="Score prospect minimum (0-100)"),
    sort:    str = Query("dept_code", description=f"Colonne tri parmi {sorted(SORTABLE_COLUMNS)}"),
    dir:     Literal["asc", "desc"] = Query("asc"),
    limit:   int = Query(50, ge=1, le=500),
    offset:  int = Query(0,  ge=0),
):
    sort_col = SORTABLE_COLUMNS.get(sort, SORTABLE_COLUMNS["dept_code"])
    sort_dir = "DESC" if dir.lower() == "desc" else "ASC"

    if statut:
        invalid = [s for s in statut if s not in STATUTS_VALIDES]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Statut invalide : {invalid}")

    if shop_type:
        invalid = [s for s in shop_type if s not in SHOP_TYPES_VALIDES]
        if invalid:
            raise HTTPException(status_code=400, detail=f"shop_type invalide : {invalid}")

    if forme_juridique:
        invalid = [f for f in forme_juridique if f not in FORMES_JURIDIQUES_VALIDES]
        if invalid:
            raise HTTPException(status_code=400, detail=f"forme_juridique invalide : {invalid}")

    for d, name in [(date_from, "date_from"), (date_to, "date_to")]:
        if d:
            try:
                date.fromisoformat(d)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{name} doit être au format YYYY-MM-DD")

    try:
        query, params = _build_prospects_query(
            dept, statut, tranche, search,
            cp_prefix, date_from, date_to, region, has_denomination,
            shop_type, include_chains, forme_juridique, score_min,
            sort_col, sort_dir, limit, offset,
        )
        df = run_query(query, params)
    except Exception:
        logging.exception("BQ error prospects list")
        return {
            "items": [], "total": 0, "limit": limit, "offset": offset,
            "counts_by_statut": {"a_contacter": 0, "contacte": 0, "pas_interesse": 0},
            "error": "Erreur de chargement des données",
        }

    if df.empty:
        return {
            "items": [], "total": 0, "limit": limit, "offset": offset,
            "counts_by_statut": {"a_contacter": 0, "contacte": 0, "pas_interesse": 0},
        }

    first = df.iloc[0]
    total            = int(first["_total"])
    nb_a_contacter   = int(first["_nb_a_contacter"])
    nb_contacte      = int(first["_nb_contacte"])
    nb_pas_interesse = int(first["_nb_pas_interesse"])

    return {
        "items":  [_row_to_prospect(r) for _, r in df.iterrows()],
        "total":  total,
        "limit":  limit,
        "offset": offset,
        "counts_by_statut": {
            "a_contacter":   nb_a_contacter,
            "contacte":      nb_contacte,
            "pas_interesse": nb_pas_interesse,
        },
    }


# ---------- GET /api/prospects/filters/options ----------

@router.get("/api/prospects/filters/options")
def get_filters_options():
    """Listes complètes pour les selects de filtrage (régions, tranches d'effectif)."""
    with _lock:
        key = "filters_options"
        if key in _cache:
            return _cache[key]

    try:
        regions_df = run_query(
            f"""SELECT DISTINCT region_name
                FROM {dwh('ref_departments')}
                WHERE region_name IS NOT NULL
                ORDER BY region_name""",
        )
        tranches_df = run_query(
            f"""SELECT DISTINCT tranche_effectif_code, tranche_effectif_libelle
                FROM {dtm('mart_prospects')}
                WHERE is_prospect = TRUE
                  AND tranche_effectif_code IS NOT NULL
                ORDER BY tranche_effectif_code""",
        )
    except Exception:
        logging.exception("BQ error filters options")
        return {"regions": [], "tranches": [], "error": "Erreur de chargement des filtres"}

    payload = {
        "regions": [_to_str(r["region_name"]) for _, r in regions_df.iterrows()],
        "tranches": [
            {"code": _to_str(r["tranche_effectif_code"]),
             "label": _to_str(r["tranche_effectif_libelle"])}
            for _, r in tranches_df.iterrows()
        ],
        "shop_types": SHOP_TYPES_TAXONOMY,  # taxonomie statique pour le multi-select UI
        "formes_juridiques": sorted(FORMES_JURIDIQUES_VALIDES),
    }
    with _lock:
        _cache[key] = payload
    return payload


# ---------- GET /api/prospects/export (CSV) ----------

@router.get("/api/prospects/export")
def export_prospects_csv(
    dept:    str | None = Query(None),
    statut:  list[str] | None = Query(None),
    tranche: list[str] | None = Query(None),
    search:  str | None = Query(None),
    cp_prefix: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to:   str | None = Query(None),
    region:    list[str] | None = Query(None),
    has_denomination: bool = Query(True),
    shop_type: list[str] | None = Query(None),
    include_chains: bool = Query(False),
    forme_juridique: list[str] | None = Query(None),
    score_min: int = Query(0, ge=0, le=100),
):
    """Stream CSV — UTF-8 BOM, séparateur `;`, dates ISO (R7 US-026)."""
    try:
        query, params = _build_prospects_query(
            dept, statut, tranche, search,
            cp_prefix, date_from, date_to, region, has_denomination,
            shop_type, include_chains, forme_juridique, score_min,
            sort_col="dept_code", sort_dir="ASC",
            limit=100_000, offset=0,
        )
        df = run_query(query, params)
    except Exception:
        logging.exception("BQ error prospects export")
        raise HTTPException(status_code=500, detail="Erreur de chargement des données")

    buf = io.StringIO()
    buf.write("﻿")  # BOM Excel
    header = [
        "siret", "siren", "denomination",
        "adresse_voie", "adresse_complement", "zip_code", "city", "dept_code",
        "date_creation", "tranche_effectif_code", "tranche_effectif_libelle",
        "statut", "note", "dernier_contact", "updated_at",
    ]
    buf.write(";".join(header) + "\r\n")

    def _csv_escape(v) -> str:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return ""
        s = str(v).replace("\r", " ").replace("\n", " ")
        if ";" in s or '"' in s:
            s = '"' + s.replace('"', '""') + '"'
        return s

    if not df.empty:
        for _, r in df.iterrows():
            row = [
                _to_str(r["siret"]),
                _to_str(r["siren"]),
                _to_str(r["denomination"]),
                _to_str(r["adresse_voie"]),
                _to_str(r["adresse_complement"]),
                _to_str(r["zip_code"]),
                _to_str(r["city"]),
                _to_str(r["dept_code"]),
                _to_date(r["date_creation"]),
                _to_str(r["tranche_effectif_code"]),
                _to_str(r["tranche_effectif_libelle"]),
                _to_str(r["statut"]) or "a_contacter",
                _to_str(r["note"]),
                _to_date(r["dernier_contact"]),
                r["updated_at"].isoformat() if pd.notna(r["updated_at"]) else None,
            ]
            buf.write(";".join(_csv_escape(v) for v in row) + "\r\n")

    today = date.today().isoformat()
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="prospects_{today}.csv"'},
    )


# ---------- PATCH /api/prospects/{siret}/status ----------

class StatusPatch(BaseModel):
    statut: Literal["a_contacter", "contacte", "pas_interesse"]
    note: str | None = Field(default=None, max_length=500)
    dernier_contact: str | None = Field(default=None, description="Format ISO YYYY-MM-DD")

    @field_validator("dernier_contact")
    @classmethod
    def _validate_date(cls, v):
        if v is None or v == "":
            return None
        try:
            d = date.fromisoformat(v)
        except ValueError as e:
            raise ValueError("dernier_contact doit être au format YYYY-MM-DD") from e
        if d > date.today():
            raise ValueError("dernier_contact ne peut pas être dans le futur")
        return v


@router.patch("/api/prospects/{siret}/status")
def patch_prospect_status(
    payload: StatusPatch,
    siret: str = Path(..., min_length=14, max_length=14, pattern=r"^\d{14}$"),
):
    # Validation : le SIRET doit exister dans mart_prospects ET être un prospect
    try:
        check_df = run_query(
            f"""SELECT 1
                FROM {dtm('mart_prospects')}
                WHERE siret = @siret AND is_prospect = TRUE
                LIMIT 1""",
            [p("siret", siret)],
        )
    except Exception:
        logging.exception("BQ error prospect validate")
        raise HTTPException(status_code=500, detail="Erreur backend")

    if check_df.empty:
        raise HTTPException(
            status_code=404,
            detail="Prospect introuvable — la liste a peut-être été mise à jour, rafraîchir la page",
        )

    # Pour le statut a_contacter on ne touche pas à dernier_contact ; sinon défaut = aujourd'hui
    if payload.statut == "a_contacter":
        dernier_contact_val = payload.dernier_contact  # accepté tel quel (peut être null ou ancien)
    else:
        dernier_contact_val = payload.dernier_contact or date.today().isoformat()

    merge_sql = f"""
        MERGE {_prospects('prospect_status')} T
        USING (SELECT @siret AS siret) S
        ON T.siret = S.siret
        WHEN MATCHED THEN UPDATE SET
            statut = @statut,
            note = @note,
            dernier_contact = @dernier_contact,
            updated_at = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (siret, statut, note, dernier_contact, updated_at)
        VALUES (@siret, @statut, @note, @dernier_contact, CURRENT_TIMESTAMP())
    """
    params = [
        p("siret",  siret),
        p("statut", payload.statut),
        bigquery.ScalarQueryParameter("note",            "STRING", payload.note),
        bigquery.ScalarQueryParameter("dernier_contact", "DATE",
                                      date.fromisoformat(dernier_contact_val) if dernier_contact_val else None),
    ]

    try:
        client = get_bq()
        client.query(merge_sql, job_config=bigquery.QueryJobConfig(query_parameters=params)).result()
    except Exception:
        logging.exception("BQ error prospect MERGE")
        raise HTTPException(status_code=500, detail="Erreur d'enregistrement")

    # Invalide le cache liste/agrégat — les compteurs changent
    with _lock:
        _cache.clear()

    return {
        "siret":           siret,
        "statut":          payload.statut,
        "note":            payload.note,
        "dernier_contact": dernier_contact_val,
    }
