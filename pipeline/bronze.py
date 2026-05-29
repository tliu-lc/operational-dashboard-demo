"""
S01-04 — Bronze layer: ingest EBP CSV exports into DuckDB raw tables.

Raw tables: raw_{boutique}_{file} (e.g. raw_hip_sale_document)
All columns imported as VARCHAR to avoid inference errors on malformed values.
Casting happens in Silver.
"""
import re
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent.parent
EXPORT_DIR = ROOT / "export_2026-05-06_22h15"
DB_PATH = ROOT / "data" / "db" / "hippocampe.duckdb"

BOUTIQUES = {
    "ACC": "HIPPOCAMPE ACCESSOIRES_0895452f-b7c1-4c00-a316-c6a6d0ea4bf4",
    "HIP": "HIPPOCAMPUS_0895452f-b7c1-4c00-a316-c6a6d0ea4bf4",
    "SED": "SEDAINE_0895452f-b7c1-4c00-a316-c6a6d0ea4bf4",
    "HPC": "HIPPOCAMPE_0895452f-b7c1-4c00-a316-c6a6d0ea4bf4",
}

INGESTED_FILES = [
    "SaleDocument",
    "SaleDocumentLine",
    "Customer",
    "Item",
    "Storehouse",
    "StockItem",
    "StockMovement",
]


def run(con: duckdb.DuckDBPyConnection) -> None:
    print("Bronze — chargement CSV → DuckDB")
    for code, folder_name in BOUTIQUES.items():
        folder = EXPORT_DIR / folder_name
        for file_name in INGESTED_FILES:
            csv_path = folder / f"{file_name}.csv"
            table = f"raw_{code.lower()}_{_to_snake(file_name)}"
            con.execute(f"""
                CREATE OR REPLACE TABLE {table} AS
                SELECT * FROM read_csv(
                    '{csv_path.as_posix()}',
                    delim=';',
                    header=true,
                    all_varchar=true
                )
            """)
            count = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  ✓ {table} : {count:,} lignes")


def _to_snake(name: str) -> str:
    s1 = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub("([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


if __name__ == "__main__":
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(DB_PATH)) as con:
        run(con)
    print("Terminé.")
