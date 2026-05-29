"""
Shared sidebar component — boutique filter (Sprint 05/06).
Mono-DB: demo.duckdb. SEDAINE selected by default. No ALL option.
Client search is handled directly in client.py.
"""
import logging
from pathlib import Path

import streamlit as st

logger = logging.getLogger(__name__)

DB_DIR = Path(__file__).parent.parent.parent / "data" / "db"
DB_PATH = DB_DIR / "demo.duckdb"

BOUTIQUES = [
    {"id": "SED", "label": "SEDAINE"},
    {"id": "HIP", "label": "FASHION_CENTER"},
    {"id": "HPC", "label": "DEMO"},
    {"id": "ACC", "label": "DEMO ACCESSOIRES"},
]

BOUTIQUE_IDS = [b["id"] for b in BOUTIQUES]
BOUTIQUE_LABELS: dict[str, str] = {b["id"]: b["label"] for b in BOUTIQUES}


def render_boutique_filter() -> tuple[str, dict[str, str]]:
    """Render boutique selector in sidebar. Returns (boutique_id, labels_dict)."""
    st.sidebar.markdown("**PÉRIMÈTRE**")

    selected = st.sidebar.selectbox(
        "Boutique",
        options=BOUTIQUE_IDS,
        format_func=lambda x: BOUTIQUE_LABELS[x],
        key="boutique_id",
        label_visibility="visible",
    )

    st.sidebar.divider()
    return selected, BOUTIQUE_LABELS


def render_boutique_indicator(selected_boutique: str, labels: dict[str, str]) -> None:
    """Show an info banner below the page title with the active boutique."""
    boutique_name = labels.get(selected_boutique, selected_boutique)
    st.info(f"🏪 Boutique : **{boutique_name}**")
