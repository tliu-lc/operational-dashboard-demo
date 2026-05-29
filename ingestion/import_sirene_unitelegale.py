"""Import SIRENE StockUniteLegale → BigQuery raw_sirene_unitelegale.

Sprint 19 / Filtre C (forme juridique) :
Récupère pour chaque SIREN déjà présent dans raw_sirene_etab les colonnes
manquantes du fichier StockUniteLegale (categorieJuridique, raison sociale,
nom/prénom pour entrepreneurs individuels).

Optimisation cruciale : on filtre en streaming sur les SIREN connus
(~25-40k SIREN ∈ SIRENs SIRENE 47.71Z) au lieu de charger les 30M lignes
de StockUniteLegale.

Pipeline :
  1. Récupère le set de SIREN distincts depuis raw_sirene_etab (1 query BQ)
  2. Télécharge StockUniteLegale_utf8.zip (~1.5 GB)
  3. Stream CSV, filtre lignes où siren ∈ set + état = 'A'
  4. WRITE_TRUNCATE upload → raw_sirene_unitelegale (~25-40k lignes)

Usage minimal :
    GCP_PROJECT_ID=demo-xxx BQ_RAW_DATASET=demo_raw \\
        python ingestion/import_sirene_unitelegale.py

Options : identique à import_sirene_naf4771z.py.
"""
import argparse
import csv
import io
import os
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

from google.cloud import bigquery


# URL mirror data.gouv (même bucket que StockEtablissement, vérifié 2026-05-20)
SIRENE_URL = "https://object.files.data.gouv.fr/data-pipeline-open/siren/stock/StockUniteLegale_utf8.zip"
CSV_INNER  = "StockUniteLegale_utf8.csv"
TABLE_NAME = "raw_sirene_unitelegale"

ETAT_ACTIF = "A"

# Colonnes utiles côté staging dbt (DATA-014 §3 + Sprint 19 score prospect)
COLUMNS_OUT = [
    "siren",
    "denominationUniteLegale",
    "categorieJuridiqueUniteLegale",
    "nomUniteLegale",
    "prenomUsuelUniteLegale",
    "nomUsageUniteLegale",
    "dateCreationUniteLegale",
    "etatAdministratifUniteLegale",
]

CHUNK_BYTES = 1024 * 1024  # 1 MB


def fetch_siren_set(project: str, raw_dataset: str) -> set[str]:
    """Charge la liste de SIREN distincts présents dans raw_sirene_etab.
    Permet de filtrer StockUniteLegale en streaming (~30M lignes → ~30k retenues).
    """
    print(f"Lecture des SIREN cibles depuis {project}.{raw_dataset}.raw_sirene_etab")
    client = bigquery.Client(project=project)
    df = client.query(
        f"""SELECT DISTINCT siren
            FROM `{project}.{raw_dataset}.raw_sirene_etab`
            WHERE siren IS NOT NULL""",
    ).to_dataframe()
    sirens = set(df["siren"].astype(str).tolist())
    print(f"  {len(sirens):,} SIREN distincts à enrichir")
    return sirens


def download_zip(url: str, dest: Path) -> None:
    print(f"Téléchargement {url}")
    print(f"  → {dest}")
    t0 = time.time()
    with urllib.request.urlopen(url) as resp:
        total = int(resp.headers.get("content-length", 0))
        seen  = 0
        with open(dest, "wb") as out:
            while True:
                buf = resp.read(CHUNK_BYTES)
                if not buf:
                    break
                out.write(buf)
                seen += len(buf)
                if total:
                    pct = seen * 100 // total
                    print(f"  {seen >> 20:>5} / {total >> 20} MB  ({pct}%)", end="\r")
    print()
    print(f"  {dest.stat().st_size >> 20} MB téléchargés en {time.time() - t0:.1f}s")


def stream_filter(zip_path: Path, out_csv: Path, sirens: set[str]) -> tuple[int, int]:
    """Stream le CSV, filtre sur siren ∈ set + état actif.
    Retourne (total_lus, total_retenus)."""
    print(f"Filtrage en streaming → {out_csv}")
    t0 = time.time()
    total = 0
    kept  = 0
    with zipfile.ZipFile(zip_path) as zf, zf.open(CSV_INNER) as fin, \
         open(out_csv, "w", encoding="utf-8", newline="") as fout:
        reader = csv.DictReader(io.TextIOWrapper(fin, encoding="utf-8"))
        writer = csv.DictWriter(fout, fieldnames=COLUMNS_OUT, extrasaction="ignore")
        writer.writeheader()
        for row in reader:
            total += 1
            if (row.get("siren") in sirens
                    and row.get("etatAdministratifUniteLegale") == ETAT_ACTIF):
                writer.writerow({c: (row.get(c) or "") for c in COLUMNS_OUT})
                kept += 1
            if total % 1_000_000 == 0:
                print(f"  {total:>10,} lignes lues, {kept:>6,} retenues", end="\r")
    print()
    print(f"  {total:,} lignes lues, {kept:,} retenues "
          f"(SIREN connus + état {ETAT_ACTIF}) en {time.time() - t0:.1f}s")
    return total, kept


def load_to_bq(csv_path: Path, project: str, dataset: str) -> None:
    table_id = f"{project}.{dataset}.{TABLE_NAME}"
    print(f"Upload BigQuery → {table_id}")
    client = bigquery.Client(project=project)
    client.create_dataset(dataset, exists_ok=True)

    schema = [bigquery.SchemaField(c, "STRING") for c in COLUMNS_OUT]
    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        autodetect=False,
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        encoding="UTF-8",
        field_delimiter=",",
        allow_quoted_newlines=True,
        allow_jagged_rows=True,
    )
    with open(csv_path, "rb") as fh:
        job = client.load_table_from_file(fh, table_id, job_config=job_config)
    job.result()
    table = client.get_table(table_id)
    print(f"  OK {table_id} — {table.num_rows:,} lignes")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import SIRENE StockUniteLegale (filtré sur SIREN connus) → BigQuery",
    )
    parser.add_argument("--source-url", default=SIRENE_URL,
                        help="URL du zip StockUniteLegale INSEE")
    parser.add_argument("--zip-cache", default=None,
                        help="Réutilise un zip déjà téléchargé (skip download)")
    parser.add_argument("--tmp-dir", default=None,
                        help="Dossier temporaire (défaut: tempfile.gettempdir())")
    parser.add_argument("--keep-tmp", action="store_true",
                        help="Conserve les fichiers temporaires (debug)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Filtre et écrit le CSV local, sans upload BQ")
    args = parser.parse_args()

    dataset = os.environ.get("BQ_RAW_DATASET", "demo_raw")
    project = os.environ.get("GCP_PROJECT_ID")
    if not project:
        print("ERREUR : GCP_PROJECT_ID requis (lecture SIREN depuis raw_sirene_etab)",
              file=sys.stderr)
        sys.exit(1)

    sirens = fetch_siren_set(project, dataset)
    if not sirens:
        print("ERREUR : aucun SIREN trouvé dans raw_sirene_etab — lancer d'abord "
              "import_sirene_naf4771z.py", file=sys.stderr)
        sys.exit(1)

    tmp_dir = Path(args.tmp_dir) if args.tmp_dir else Path(tempfile.gettempdir())
    tmp_dir.mkdir(parents=True, exist_ok=True)
    zip_path = Path(args.zip_cache) if args.zip_cache else tmp_dir / "StockUniteLegale_utf8.zip"
    csv_path = tmp_dir / "raw_sirene_unitelegale_filtered.csv"

    downloaded_here = False
    try:
        if not zip_path.exists():
            download_zip(args.source_url, zip_path)
            downloaded_here = True
        else:
            size_mb = zip_path.stat().st_size >> 20
            print(f"Zip réutilisé : {zip_path} ({size_mb} MB)")

        stream_filter(zip_path, csv_path, sirens)

        if args.dry_run:
            print(f"--dry-run : CSV filtré conservé à {csv_path}")
            return

        load_to_bq(csv_path, project, dataset)
    finally:
        if not args.keep_tmp:
            if csv_path.exists() and not args.dry_run:
                csv_path.unlink()
            if downloaded_here and zip_path.exists():
                zip_path.unlink()

    print("Import SIRENE StockUniteLegale terminé.")


if __name__ == "__main__":
    main()
