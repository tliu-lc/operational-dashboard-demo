"""
S01-05 — Silver layer: union boutiques, cast types, add computed columns.

Output tables: stg_sale_documents, stg_sale_lines, stg_customers, stg_items
"""
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "db" / "hippocampe.duckdb"

BOUTIQUE_NAMES = {
    "ACC": "HIPPOCAMPE ACCESSOIRES",
    "HIP": "HIPPOCAMPUS",
    "SED": "SEDAINE",
    "HPC": "HIPPOCAMPE",
}


def run(con: duckdb.DuckDBPyConnection) -> None:
    print("Silver — transformations + union des boutiques")
    _create_stg_sale_documents(con)
    _create_stg_sale_lines(con)
    _create_stg_customers(con)
    _create_stg_items(con)
    _create_stg_storehous(con)
    _create_stg_stock_items(con)
    _create_stg_stock_movements(con)


def _create_stg_sale_documents(con: duckdb.DuckDBPyConnection) -> None:
    parts = []
    for code, bname in BOUTIQUE_NAMES.items():
        parts.append(f"""
        SELECT
            '{code}'                                                AS boutique_id,
            '{bname}'                                               AS boutique_name,
            Id                                                      AS id,
            DocumentNumber                                          AS document_number,
            TRY_CAST(DocumentDate AS DATE)                          AS document_date,
            TRY_CAST(DocumentType AS INTEGER)                       AS document_type,
            CASE TRY_CAST(DocumentType AS INTEGER)
                WHEN 2 THEN 'Facture'
                WHEN 3 THEN 'Avoir'
                WHEN 1 THEN 'Commande'
                ELSE 'Autre'
            END                                                     AS document_type_label,
            TRY_CAST(DocumentType AS INTEGER) = 2                   AS is_valid_sale,
            CustomerId                                              AS customer_id,
            '{code}' || '|' || CustomerId                           AS customer_key,
            StorehouseId                                            AS storehouse_id,
            TRY_CAST(AmountVatExcluded AS DECIMAL(12,2))            AS amount_ht,
            TRY_CAST(AmountVatIncluded AS DECIMAL(12,2))            AS amount_ttc,
            TRY_CAST(DiscountRate AS DECIMAL(5,2))                  AS discount_rate
        FROM raw_{code.lower()}_sale_document
        WHERE Id IS NOT NULL AND Id != ''
          AND CustomerId IS NOT NULL AND CustomerId != ''
        """)
    union_sql = "\nUNION ALL\n".join(parts)
    con.execute(f"CREATE OR REPLACE TABLE stg_sale_documents AS {union_sql}")
    count = con.execute("SELECT COUNT(*) FROM stg_sale_documents").fetchone()[0]
    print(f"  ✓ stg_sale_documents : {count:,} lignes")


def _create_stg_sale_lines(con: duckdb.DuckDBPyConnection) -> None:
    parts = []
    for code in BOUTIQUE_NAMES:
        parts.append(f"""
        SELECT
            '{code}'                                                        AS boutique_id,
            Id                                                              AS id,
            DocumentId                                                      AS document_id,
            ItemId                                                          AS item_id,
            Description                                                     AS description,
            TRY_CAST(Quantity AS DECIMAL(10,3))                             AS quantity,
            TRY_CAST(SalePriceVatExcluded AS DECIMAL(12,2))                AS price_ht,
            TRY_CAST(NetAmountVatExcluded AS DECIMAL(12,2))                 AS net_amount_ht,
            TRY_CAST(PurchasePrice AS DECIMAL(12,2))                        AS purchase_price,
            COALESCE(TRY_CAST(NetAmountVatExcluded AS DECIMAL(12,2)), 0)
                - COALESCE(TRY_CAST(PurchasePrice AS DECIMAL(12,2)), 0)
                  * COALESCE(TRY_CAST(Quantity AS DECIMAL(10,3)), 0)        AS margin_ht
        FROM raw_{code.lower()}_sale_document_line
        WHERE DocumentId IS NOT NULL AND DocumentId != ''
          AND ItemId IS NOT NULL AND ItemId != ''
        """)
    union_sql = "\nUNION ALL\n".join(parts)
    con.execute(f"CREATE OR REPLACE TABLE stg_sale_lines AS {union_sql}")
    count = con.execute("SELECT COUNT(*) FROM stg_sale_lines").fetchone()[0]
    print(f"  ✓ stg_sale_lines : {count:,} lignes")


def _create_stg_customers(con: duckdb.DuckDBPyConnection) -> None:
    parts = []
    for code in BOUTIQUE_NAMES:
        shared = "TRUE" if code in ("HIP", "SED", "HPC") else "FALSE"
        parts.append(f"""
        SELECT
            '{code}'                                                        AS boutique_id,
            Id                                                              AS id,
            '{code}' || '|' || Id                                           AS customer_key,
            Name                                                            AS name,
            MainInvoicingAddress_ZipCode                                    AS zip_code,
            MainInvoicingAddress_City                                       AS city,
            LEFT(MainInvoicingAddress_ZipCode, 2)                           AS dept_code,
            TRY_CAST(MainInvoicingAddress_Longitude AS DECIMAL(9,6))        AS longitude,
            TRY_CAST(MainInvoicingAddress_Latitude AS DECIMAL(9,6))         AS latitude,
            MainInvoicingContact_Email                                      AS email,
            MainInvoicingContact_Phone                                      AS phone,
            TRY_CAST(FirstInvoicingDate AS DATE)                            AS first_invoice_date,
            TRY_CAST(LastInvoicingDate AS DATE)                             AS last_invoice_date,
            MainInvoicingAddress_Address1                                   AS address1,
            MainInvoicingAddress_Address2                                   AS address2,
            CASE MainInvoicingAddress_CountryIsoCode
                WHEN 'COT' THEN 'CI'
                WHEN 'ISR' THEN 'IL'
                WHEN 'COL' THEN 'CO'
                ELSE MainInvoicingAddress_CountryIsoCode
            END                                                             AS country_iso_code,
            Civility                                                        AS civility,
            {shared}                                                        AS shared_referential
        FROM raw_{code.lower()}_customer
        WHERE Id IS NOT NULL AND Id != ''
        """)
    union_sql = "\nUNION ALL\n".join(parts)
    con.execute(f"CREATE OR REPLACE TABLE stg_customers AS {union_sql}")
    count = con.execute("SELECT COUNT(*) FROM stg_customers").fetchone()[0]
    print(f"  ✓ stg_customers : {count:,} lignes")


def _create_stg_items(con: duckdb.DuckDBPyConnection) -> None:
    type_case = _build_type_vetement_case("Caption")
    parts = []
    for code in BOUTIQUE_NAMES:
        parts.append(f"""
        SELECT
            '{code}'                                                        AS boutique_id,
            Id                                                              AS id,
            Caption                                                         AS caption,
            FamilyId                                                        AS family_id,
            SupplierId                                                      AS supplier_id,
            TRY_CAST(PurchasePrice AS DECIMAL(12,2))                        AS purchase_price,
            TRY_CAST(SalePriceVatExcluded AS DECIMAL(12,2))                AS sale_price_ht,
            TRY_CAST(RealStock AS DECIMAL(10,3))                            AS real_stock,
            CASE WHEN ActiveState IN ('True', '1', 'true') THEN TRUE
                 ELSE FALSE
            END                                                             AS active_state,
            {type_case}                                                     AS type_vetement
        FROM raw_{code.lower()}_item
        WHERE Id IS NOT NULL AND Id != ''
        """)
    union_sql = "\nUNION ALL\n".join(parts)
    con.execute(f"CREATE OR REPLACE TABLE stg_items AS {union_sql}")
    count = con.execute("SELECT COUNT(*) FROM stg_items").fetchone()[0]
    print(f"  ✓ stg_items : {count:,} lignes")


def _create_stg_storehous(con: duckdb.DuckDBPyConnection) -> None:
    parts = []
    for code in BOUTIQUE_NAMES:
        parts.append(f"""
        SELECT
            '{code}'                                                        AS boutique_id,
            Id                                                              AS id,
            Caption                                                         AS caption,
            CASE WHEN Main IN ('True', '1', 'true') THEN TRUE
                 ELSE FALSE
            END                                                             AS is_main,
            Address_City                                                    AS city,
            Address_ZipCode                                                 AS zip_code,
            TRY_CAST(Address_Longitude AS DECIMAL(9,6))                     AS longitude,
            TRY_CAST(Address_Latitude  AS DECIMAL(9,6))                     AS latitude
        FROM raw_{code.lower()}_storehouse
        WHERE Id IS NOT NULL AND Id != ''
        """)
    union_sql = "\nUNION ALL\n".join(parts)
    con.execute(f"CREATE OR REPLACE TABLE stg_storehous AS {union_sql}")
    count = con.execute("SELECT COUNT(*) FROM stg_storehous").fetchone()[0]
    print(f"  ✓ stg_storehous : {count:,} lignes")


def _create_stg_stock_items(con: duckdb.DuckDBPyConnection) -> None:
    parts = []
    for code in BOUTIQUE_NAMES:
        parts.append(f"""
        SELECT
            '{code}'                                                        AS boutique_id,
            ItemId                                                          AS item_id,
            StorehouseId                                                    AS storehouse_id,
            TRY_CAST(RealStock    AS DECIMAL(10,3))                         AS real_stock,
            TRY_CAST(StockValue   AS DECIMAL(12,2))                         AS stock_value,
            TRY_CAST(VirtualStock AS DECIMAL(10,3))                         AS virtual_stock,
            TRY_CAST(MinStock     AS DECIMAL(10,3))                         AS min_stock,
            TRY_CAST(MaxStock     AS DECIMAL(10,3))                         AS max_stock
        FROM raw_{code.lower()}_stock_item
        WHERE ItemId       IS NOT NULL AND ItemId       != ''
          AND StorehouseId IS NOT NULL AND StorehouseId != ''
        """)
    union_sql = "\nUNION ALL\n".join(parts)
    con.execute(f"CREATE OR REPLACE TABLE stg_stock_items AS {union_sql}")
    count = con.execute("SELECT COUNT(*) FROM stg_stock_items").fetchone()[0]
    print(f"  ✓ stg_stock_items : {count:,} lignes")


def _create_stg_stock_movements(con: duckdb.DuckDBPyConnection) -> None:
    parts = []
    for code in BOUTIQUE_NAMES:
        parts.append(f"""
        SELECT
            '{code}'                                                        AS boutique_id,
            Id                                                              AS id,
            ItemId                                                          AS item_id,
            DocumentId                                                      AS document_id,
            StorehouseId                                                    AS storehouse_id,
            TRY_CAST(DocumentDate    AS DATE)                               AS document_date,
            TRY_CAST(DocumentType    AS INTEGER)                            AS document_type,
            TRY_CAST(DocumentSubType AS INTEGER)                            AS document_sub_type,
            TRY_CAST(Quantity        AS DECIMAL(10,3))                      AS quantity
        FROM raw_{code.lower()}_stock_movement
        WHERE ItemId IS NOT NULL AND ItemId != ''
          AND DocumentDate IS NOT NULL
        """)
    union_sql = "\nUNION ALL\n".join(parts)
    con.execute(f"CREATE OR REPLACE TABLE stg_stock_movements AS {union_sql}")
    count = con.execute("SELECT COUNT(*) FROM stg_stock_movements").fetchone()[0]
    print(f"  ✓ stg_stock_movements : {count:,} lignes")


def _build_type_vetement_case(col: str) -> str:
    types = [
        "ROBE", "VESTE", "PANTALON", "JUPE", "MANTEAU", "TOP",
        "CHEMISE", "PULL", "GILET", "COMBINAISON", "SHORT", "ENSEMBLE",
        "BLOUSE", "TUNIQUE", "CARDIGAN", "BLOUSON", "TRENCH", "PARKA",
    ]
    when_clauses = "\n            ".join(
        f"WHEN UPPER({col}) LIKE '%{t}%' THEN '{t}'" for t in types
    )
    return f"CASE\n            {when_clauses}\n            ELSE NULL\n        END"


if __name__ == "__main__":
    with duckdb.connect(str(DB_PATH)) as con:
        run(con)
    print("Terminé.")
