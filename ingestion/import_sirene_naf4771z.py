"""Import SIRENE NAF 47.71Z (commerce détail habillement) → BigQuery raw_sirene_etab.

Pipeline manuel MVP — cf vault/Data/DATA-014.md §2.

Étapes :
  1. Télécharge le fichier StockEtablissement INSEE (data.gouv.fr, ~2.6 GB zip / ~12 GB CSV)
  2. Stream le CSV ligne par ligne et filtre :
       - activitePrincipaleEtablissement = '47.71Z'
       - etatAdministratifEtablissement = 'A'
       - codePaysEtrangerEtablissement vide (France métropole + DROM)
  3. WRITE_TRUNCATE upload vers `<project>.<raw_dataset>.raw_sirene_etab`

Volume attendu après filtres : 25k–40k établissements (DATA-014 §2).

Usage minimal :
    GCP_PROJECT_ID=hippocampe-xxx BQ_RAW_DATASET=hippocampe_raw \\
        python ingestion/import_sirene_naf4771z.py

Options utiles :
    --source-url URL    URL alternative du zip StockEtablissement
    --zip-cache PATH    Réutilise un zip déjà téléchargé (skip download)
    --tmp-dir PATH      Dossier pour les fichiers temporaires (défaut: tempfile.gettempdir())
    --keep-tmp          Conserve le CSV filtré local (debug)
    --dry-run           Filtre et écrit le CSV local, sans upload BQ
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


# URL stable du miroir data.gouv (vérifié 2026-05-19, ~2.6 GB).
# L'ancienne URL https://files.data.gouv.fr/insee-sirene/StockEtablissement_utf8.zip
# retournait 404 — le bucket public a été migré.
SIRENE_URL  = "https://object.files.data.gouv.fr/data-pipeline-open/siren/stock/StockEtablissement_utf8.zip"
CSV_INNER   = "StockEtablissement_utf8.csv"
TABLE_NAME  = "raw_sirene_etab"

NAF_TARGET  = "47.71Z"
ETAT_ACTIF  = "A"

# Colonnes écrites dans la table raw — alignées sur les SELECT du staging
# dbt (DATA-014 §3.1). `denominationUniteLegale` n'existe PAS dans
# StockEtablissement (elle vit dans StockUniteLegale) : on l'écrit vide
# pour préserver le schéma attendu par le staging et faciliter un
# enrichissement futur par jointure SIREN.
COLUMNS_OUT = [
    "siret", "siren", "nic",
    "denominationUsuelleEtablissement",
    "denominationUniteLegale",
    "enseigne1Etablissement",
    "numeroVoieEtablissement", "typeVoieEtablissement", "libelleVoieEtablissement",
    "complementAdresseEtablissement",
    "codePostalEtablissement", "libelleCommuneEtablissement", "codeCommuneEtablissement",
    "dateCreationEtablissement",
    "trancheEffectifsEtablissement",
    "activitePrincipaleEtablissement",
    "etatAdministratifEtablissement",
]

CHUNK_BYTES = 1024 * 1024  # 1 MB


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


def stream_filter(zip_path: Path, out_csv: Path) -> tuple[int, int]:
    """Stream le CSV depuis le zip, filtre 47.71Z + actif + France.
    Retourne (total_lus, total_retenus)."""
    print(f"Filtrage en streaming → {out_csv}")
    t0    = time.time()
    total = 0
    kept  = 0
    with zipfile.ZipFile(zip_path) as zf, zf.open(CSV_INNER) as fin, \
         open(out_csv, "w", encoding="utf-8", newline="") as fout:
        reader = csv.DictReader(io.TextIOWrapper(fin, encoding="utf-8"))
        writer = csv.DictWriter(fout, fieldnames=COLUMNS_OUT, extrasaction="ignore")
        writer.writeheader()
        for row in reader:
            total += 1
            if (row.get("activitePrincipaleEtablissement") == NAF_TARGET
                    and row.get("etatAdministratifEtablissement") == ETAT_ACTIF
                    and not (row.get("codePaysEtrangerEtablissement") or "").strip()):
                writer.writerow({c: (row.get(c) or "") for c in COLUMNS_OUT})
                kept += 1
            if total % 1_000_000 == 0:
                print(f"  {total:>10,} lignes lues, {kept:>6,} retenues", end="\r")
    print()
    print(f"  {total:,} lignes lues, {kept:,} retenues "
          f"(NAF {NAF_TARGET} + état {ETAT_ACTIF} + France) en {time.time() - t0:.1f}s")
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
        description="Import SIRENE NAF 47.71Z → BigQuery raw_sirene_etab",
    )
    parser.add_argument("--source-url", default=SIRENE_URL,
                        help="URL du zip StockEtablissement INSEE")
    parser.add_argument("--zip-cache", default=None,
                        help="Réutilise un zip déjà téléchargé (skip download)")
    parser.add_argument("--tmp-dir", default=None,
                        help="Dossier temporaire (défaut: tempfile.gettempdir())")
    parser.add_argument("--keep-tmp", action="store_true",
                        help="Conserve les fichiers temporaires (debug)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Filtre et écrit le CSV local, sans upload BQ")
    args = parser.parse_args()

    dataset = os.environ.get("BQ_RAW_DATASET", "hippocampe_raw")
    project = os.environ.get("GCP_PROJECT_ID")
    if not project and not args.dry_run:
        print("ERREUR : variable GCP_PROJECT_ID manquante "
              "(ou utiliser --dry-run)", file=sys.stderr)
        sys.exit(1)

    tmp_dir = Path(args.tmp_dir) if args.tmp_dir else Path(tempfile.gettempdir())
    tmp_dir.mkdir(parents=True, exist_ok=True)
    zip_path = Path(args.zip_cache) if args.zip_cache else tmp_dir / "StockEtablissement_utf8.zip"
    csv_path = tmp_dir / "raw_sirene_etab_4771z.csv"

    downloaded_here = False
    try:
        if not zip_path.exists():
            download_zip(args.source_url, zip_path)
            downloaded_here = True
        else:
            size_mb = zip_path.stat().st_size >> 20
            print(f"Zip réutilisé : {zip_path} ({size_mb} MB)")

        stream_filter(zip_path, csv_path)

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

    print("Import SIRENE 47.71Z terminé.")


if __name__ == "__main__":
    main()
