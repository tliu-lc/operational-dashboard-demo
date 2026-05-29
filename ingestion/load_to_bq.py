"""Ingestion GCS → BigQuery tables RAW. Called by Cloud Run Job."""
import json
import os
from google.cloud import bigquery, storage

PROJECT_ID  = os.environ["GCP_PROJECT_ID"]
GCS_BUCKET  = os.environ["GCS_BUCKET"]
BQ_DATASET  = os.environ["BQ_RAW_DATASET"]

# BOUTIQUES_CONFIG : JSON env var permettant de configurer le mapping par client.
# Format : '{"nom_dossier_gcs": "CODE_BOUTIQUE", ...}'
# Exemple Maison Delor : '{"paris": "HIP", "lyon": "SED", "bordeaux": "HPC", "nantes": "ACC"}'
# Par défaut : mapping Hippocampe (rétrocompatibilité)
_boutiques_env = os.environ.get("BOUTIQUES_CONFIG", "")
BOUTIQUES: dict[str, str] = json.loads(_boutiques_env) if _boutiques_env else {
    "hippocampus": "HIP",
    "sedaine":     "SED",
    "hippocampe":  "HPC",
    "accessoires": "ACC",
}

TABLES = [
    "SaleDocument",
    "SaleDocumentLine",
    "Item",
    "Customer",
    "StockItem",
    "StockMovement",
    "Storehouse",
]


def get_string_schema(gcs_client: storage.Client, bucket: str, blob_path: str) -> list:
    """Lit l'en-tête CSV et retourne un schéma BQ tout STRING (couche raw).
    utf-8-sig supprime le BOM éventuel en début de fichier (CSV EBP)."""
    blob = gcs_client.bucket(bucket).blob(blob_path)
    header_bytes = blob.download_as_bytes(start=0, end=131072)  # 128KB, couvre les headers larges
    header_line = header_bytes.decode("utf-8-sig", errors="replace").split("\n")[0]
    cols = [c.strip().strip('"') for c in header_line.split(";")]
    return [bigquery.SchemaField(col, "STRING") for col in cols if col]


def load_csv_to_bq(
    bq_client: bigquery.Client,
    gcs_client: storage.Client,
    boutique_folder: str,
    boutique_id: str,
    table_name: str,
) -> None:
    blob_path = f"{boutique_folder}/{table_name}.csv"
    gcs_uri   = f"gs://{GCS_BUCKET}/{blob_path}"
    bq_table  = f"{PROJECT_ID}.{BQ_DATASET}.raw_{boutique_id.lower()}_{table_name.lower()}"

    schema = get_string_schema(gcs_client, GCS_BUCKET, blob_path)

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        autodetect=False,
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        encoding="UTF-8",
        field_delimiter=";",
        allow_quoted_newlines=True,
        allow_jagged_rows=True,
    )
    job = bq_client.load_table_from_uri(gcs_uri, bq_table, job_config=job_config)
    job.result()
    table = bq_client.get_table(bq_table)
    print(f"  OK {bq_table} — {table.num_rows:,} lignes")


def get_latest_export(gcs_client: storage.Client) -> str:
    """Retourne le nom du dossier export le plus récent (tri lexicographique sur date ISO)."""
    blobs = gcs_client.list_blobs(GCS_BUCKET, delimiter="/")
    list(blobs)  # force la résolution des prefixes
    prefixes = [p.rstrip("/") for p in (blobs.prefixes or []) if p.startswith("export_")]
    if not prefixes:
        raise RuntimeError(f"Aucun dossier export_* trouvé dans gs://{GCS_BUCKET}/")
    latest = sorted(prefixes)[-1]
    print(f"Dossier d'export sélectionné : {latest}")
    return latest


def main() -> None:
    bq_client  = bigquery.Client(project=PROJECT_ID)
    gcs_client = storage.Client(project=PROJECT_ID)
    bq_client.create_dataset(BQ_DATASET, exists_ok=True)

    export_prefix = get_latest_export(gcs_client)

    errors = []
    for folder, code in BOUTIQUES.items():
        for table in TABLES:
            try:
                load_csv_to_bq(bq_client, gcs_client, f"{export_prefix}/{folder}", code, table)
            except Exception as e:
                msg = f"  ERREUR {folder}/{table} : {e}"
                print(msg)
                errors.append(msg)

    if errors:
        raise RuntimeError(f"{len(errors)} erreur(s) d'ingestion")
    print("Ingestion terminée.")


if __name__ == "__main__":
    main()
