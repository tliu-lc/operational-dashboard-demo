"""
S03-03 — Streamlit page: Stocks par dépôt dashboard.

Displays mart_stock_status with urgency badges, coverage days, and filters.
Pre-requisite: python pipeline/run_pipeline.py
"""
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

import duckdb
import pandas as pd
import streamlit as st

_APP_DIR = Path(__file__).parent.parent
if str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from components.sidebar import (
    render_boutique_filter,
    render_boutique_indicator,
    BOUTIQUE_LABELS,
    DB_PATH,
)
from components.overlay import show_overlay, hide_overlay
from utils.ui_helpers import inject_light_theme

logger = logging.getLogger(__name__)

URGENCY_CONFIG = {
    0: ("🔴 Rupture",  "#FEE2E2", "#991B1B", "#EF4444"),
    1: ("🟠 Surstock", "#FED7AA", "#9A3412", "#F97316"),
    2: ("🟡 Dormant",  "#FEF3C7", "#92400E", "#F59E0B"),
    3: ("🟢 OK",       "#D1FAE5", "#065F46", "#34D399"),
}

STATUS_FILTER_OPTIONS = [
    "Tous les statuts",
    "🔴 Rupture",
    "🟠 Surstock",
    "🟡 Dormant",
    "🟢 OK",
]

STATUS_TO_URGENCY = {
    "🔴 Rupture":  0,
    "🟠 Surstock": 1,
    "🟡 Dormant":  2,
    "🟢 OK":       3,
}


@st.cache_data(ttl=300)
def load_stock_data(boutique_id: str) -> pd.DataFrame:
    sql = """
        SELECT
            boutique_id, item_id, item_caption,
            storehouse_id, storehouse_name,
            real_stock, stock_value, min_stock, max_stock,
            virtual_stock, sales_30d, last_movement_date,
            coverage_days, is_rupture, is_surstock, is_dormant,
            urgency_rank
        FROM mart_stock_status
        WHERE boutique_id = ?
        ORDER BY urgency_rank ASC, coverage_days ASC NULLS LAST
    """
    logger.debug("[QUERY] Début — boutique=%s | table=mart_stock_status", boutique_id)
    t0 = time.perf_counter()
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [boutique_id]).df()
        con.close()
        duration_ms = (time.perf_counter() - t0) * 1000
        logger.debug(
            "[QUERY] OK — boutique=%s | lignes=%d | durée=%.1f ms",
            boutique_id, len(df), duration_ms,
        )
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR — boutique=%s | %s", boutique_id, str(e))
        raise


def fmt_euros(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    return f"{float(val):,.2f} €".replace(",", " ").replace(".", ",")


def fmt_coverage(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "∞"
    return f"{int(val)} j"


def fmt_stock(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    return f"{float(val):,.0f}".replace(",", " ")


def render_page() -> None:
    st.set_page_config(
        page_title="Stocks par dépôt — Hippocampe Monitor",
        layout="wide",
    )
    inject_light_theme()

    if not DB_PATH.exists():
        st.error(
            "Base de données introuvable. Lancez d'abord : `python pipeline/run_pipeline.py`"
        )
        st.stop()

    selected_boutique, boutique_labels = render_boutique_filter()

    st.title("Stocks par dépôt")
    render_boutique_indicator(selected_boutique, boutique_labels)

    overlay_placeholder = st.empty()
    show_overlay(overlay_placeholder)
    try:
        df_all = load_stock_data(selected_boutique)
    except Exception as exc:
        st.error(f"Erreur de chargement des données — relancez l'application. ({exc})")
        st.stop()
    finally:
        hide_overlay(overlay_placeholder)

    load_time = datetime.now().strftime("%d/%m à %Hh%M")

    # Header filters: depot + status
    col_depot, col_status, _ = st.columns([2, 2, 3])

    with col_depot:
        depot_raw = sorted(df_all["storehouse_id"].dropna().unique().tolist())
        depot_labels = []
        for sid in depot_raw:
            names = df_all[df_all["storehouse_id"] == sid]["storehouse_name"].dropna().unique()
            label = names[0] if len(names) > 0 and names[0] else sid
            depot_labels.append(label)
        depot_map = dict(zip(depot_labels, depot_raw))
        depot_opts = ["Tous les dépôts"] + depot_labels
        selected_depot_label = st.selectbox("Dépôt", depot_opts, label_visibility="visible")

    df = df_all.copy()
    if selected_depot_label != "Tous les dépôts":
        selected_depot_id = depot_map[selected_depot_label]
        df = df[df["storehouse_id"] == selected_depot_id]

    with col_status:
        selected_status = st.selectbox("Statut", STATUS_FILTER_OPTIONS, label_visibility="visible")

    if selected_status != "Tous les statuts":
        target_rank = STATUS_TO_URGENCY[selected_status]
        df = df[df["urgency_rank"] == target_rank]

    st.caption(f"Mis à jour le {load_time}")

    n_rupture  = int((df_all["urgency_rank"] == 0).sum())
    n_surstock = int((df_all["urgency_rank"] == 1).sum())
    n_dormant  = int((df_all["urgency_rank"] == 2).sum())

    st.markdown(
        f"🔴 **{n_rupture}** ruptures &nbsp;·&nbsp; "
        f"🟠 **{n_surstock}** surstocks &nbsp;·&nbsp; "
        f"🟡 **{n_dormant}** dormants",
        unsafe_allow_html=True,
    )
    st.divider()

    if df.empty:
        st.warning("Aucun article trouvé pour cette sélection.")
        return

    rows = []
    for _, r in df.iterrows():
        label, bg, fg, border = URGENCY_CONFIG[int(r["urgency_rank"])]
        depot_display = (
            r["storehouse_name"]
            if pd.notna(r.get("storehouse_name")) and r["storehouse_name"]
            else r["storehouse_id"]
        )
        item_caption = (
            r["item_caption"]
            if pd.notna(r.get("item_caption")) and r["item_caption"]
            else f"(ID: {r['item_id']})"
        )

        rows.append({
            "Statut":        label,
            "Article":       item_caption,
            "Dépôt":         depot_display,
            "Stock réel":    fmt_stock(r["real_stock"]),
            "Valeur HT":     fmt_euros(r["stock_value"]),
            "Couverture":    fmt_coverage(r["coverage_days"]),
            "_urgency_rank": int(r["urgency_rank"]),
        })

    df_display = pd.DataFrame(rows)

    st.dataframe(
        df_display[["Statut", "Article", "Dépôt", "Stock réel", "Valeur HT", "Couverture"]],
        use_container_width=True,
        hide_index=True,
        height=min(600, 40 + len(df_display) * 35),
    )

    st.caption(f"{len(df_display):,} article(s) × dépôt affiché(s)")


render_page()
