"""
Full pipeline runner: Bronze → Silver → Gold.
Run once before launching the Streamlit app.

Usage:
    python pipeline/run_pipeline.py
"""
from pathlib import Path

import duckdb

import bronze
import silver
import gold

DB_PATH = Path(__file__).parent.parent / "data" / "db" / "demo.duckdb"


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"Base de données : {DB_PATH}\n")

    with duckdb.connect(str(DB_PATH)) as con:
        bronze.run(con)
        print()
        silver.run(con)
        print()
        gold.run(con)
        print()

    print("\nPipeline terminé.")


if __name__ == "__main__":
    main()
