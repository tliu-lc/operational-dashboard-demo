"""BigQuery client singleton and query helpers."""
import os
import threading
from google.cloud import bigquery

_client: bigquery.Client | None = None
_lock = threading.Lock()

PROJECT   = os.environ.get("GCP_PROJECT_ID", "")
DTM       = os.environ.get("BQ_DTM_DATASET", "hippocampe_dtm")
DWH       = os.environ.get("BQ_DWH_DATASET", "hippocampe_dwh")


def get_bq() -> bigquery.Client:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = bigquery.Client(project=PROJECT)
    return _client


def dtm(table: str) -> str:
    return f"`{PROJECT}.{DTM}.{table}`"


def dwh(table: str) -> str:
    return f"`{PROJECT}.{DWH}.{table}`"


def run_query(query: str, params: list[bigquery.ScalarQueryParameter] | None = None):
    """Execute a parameterized query and return a DataFrame."""
    client = get_bq()
    job_config = bigquery.QueryJobConfig(query_parameters=params or [])
    return client.query(query, job_config=job_config).to_dataframe()


def p(name: str, value: str) -> bigquery.ScalarQueryParameter:
    """Shorthand for a STRING query parameter."""
    return bigquery.ScalarQueryParameter(name, "STRING", value)
