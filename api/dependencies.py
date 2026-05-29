from fastapi import Query, HTTPException
from google.cloud import bigquery

# Boutiques de base + alias "ALL" qui agrège SED + HIP côté requêtes
BOUTIQUES = {"SED", "HIP", "HPC", "ACC", "ALL"}

# Groupes : un code de boutique → liste de boutique_id réels en base
BOUTIQUE_GROUPS: dict[str, list[str]] = {
    "ALL": ["SED", "HIP"],   # "Hippocampe" = Sédaine + Fashion Center
}

VALID_PERIODS = {0, 1, 2, 3, 6, 12, 24, 36}


def valid_boutique(boutique: str = Query("SED")) -> str:
    if boutique not in BOUTIQUES:
        raise HTTPException(status_code=403, detail="Boutique non autorisée")
    return boutique


def valid_period(period: int = Query(12)) -> int:
    if period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail="Période non valide")
    return period


def boutique_ids(boutique: str) -> list[str]:
    """Retourne la liste des boutique_id réels pour un code donné."""
    return BOUTIQUE_GROUPS.get(boutique, [boutique])


def boutique_param(boutique: str, name: str = "boutiques") -> bigquery.ArrayQueryParameter:
    """
    Paramètre BigQuery pour filtrer sur les boutiques.
    À utiliser avec une clause SQL `boutique_id IN UNNEST(@boutiques)`.
    """
    return bigquery.ArrayQueryParameter(name, "STRING", boutique_ids(boutique))
