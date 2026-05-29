"""
S01-07 — Streamlit entry point: Réassort client dashboard.

Run: streamlit run app/main.py
Pre-requisite: python pipeline/run_pipeline.py
"""
import html
import logging
import time
from datetime import datetime

import duckdb
import pandas as pd
import streamlit as st

from components.sidebar import (
    render_boutique_filter,
    render_boutique_indicator,
    BOUTIQUE_LABELS,
    DB_PATH,
)
from components.overlay import show_overlay, hide_overlay
from utils.ui_helpers import inject_light_theme

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger(__name__)

STATUS_ORDER = {"en_retard": 0, "du_semaine": 1, "a_venir": 2, "insuffisant": 3}

STATUS_FILTER_OPTIONS = ["En retard", "Dû cette semaine", "À venir", "Historique insuffisant"]
STATUS_FILTER_MAP = {
    "En retard":               "en_retard",
    "Dû cette semaine":        "du_semaine",
    "À venir":                 "a_venir",
    "Historique insuffisant":  "insuffisant",
}

STATUS_CONFIG = {
    "en_retard": {
        "emoji": "🔴",
        "label": "En retard",
        "border": "#F87171",
        "bg": "#FEE2E2",
        "text": "#991B1B",
    },
    "du_semaine": {
        "emoji": "🟡",
        "label": "Dû cette semaine",
        "border": "#F59E0B",
        "bg": "#FEF3C7",
        "text": "#92400E",
    },
    "a_venir": {
        "emoji": "🟢",
        "label": "À venir",
        "border": "#34D399",
        "bg": "#D1FAE5",
        "text": "#065F46",
    },
    "insuffisant": {
        "emoji": "⚫",
        "label": "Historique insuffisant",
        "border": "#D1D5DB",
        "bg": "#F3F4F6",
        "text": "#6B7280",
    },
}

_S_SECONDARY = "color:#6B7280;font-size:14px;"
_S_ITEM_DELETED = "font-style:italic;color:#9CA3AF;"
_S_NAME = "font-weight:600;font-size:16px;"


@st.cache_data(ttl=300)
def load_data(boutique_id: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    sql_rfm = "SELECT customer_key, boutique_id, customer_name, last_order_date, median_frequency_days, days_overdue, reorder_status, order_count_24m FROM mart_customer_rfm WHERE boutique_id = ?"
    sql_top5 = "SELECT customer_key, rank, item_id, item_caption, avg_qty_per_order FROM mart_item_top5_by_customer WHERE boutique_id = ?"
    logger.debug("[QUERY] Début — boutique=%s | table=mart_customer_rfm + mart_item_top5_by_customer", boutique_id)
    t0 = time.perf_counter()
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df_rfm = con.execute(sql_rfm, [boutique_id]).df()
        df_top5 = con.execute(sql_top5, [boutique_id]).df()
        con.close()
        duration_ms = (time.perf_counter() - t0) * 1000
        logger.debug(
            "[QUERY] OK — boutique=%s | rfm=%d lignes | top5=%d lignes | durée=%.1f ms",
            boutique_id, len(df_rfm), len(df_top5), duration_ms,
        )
        return df_rfm, df_top5
    except Exception as e:
        logger.error("[QUERY] ERREUR — boutique=%s | %s", boutique_id, str(e))
        raise


def format_delay_label(row: pd.Series) -> str:
    status = row["reorder_status"]
    overdue = row["days_overdue"]
    if pd.isna(overdue):
        return "Historique insuffisant"
    overdue = int(overdue)
    if status == "en_retard":
        return f"En retard de {overdue} j"
    if status == "du_semaine":
        return "À relancer aujourd'hui" if overdue == 0 else f"En retard de {overdue} j"
    if status == "a_venir":
        return f"Dans {abs(overdue)} jours"
    return "Historique insuffisant"


def render_page() -> None:
    st.set_page_config(
        page_title="Réassort client — Demo Monitor",
        layout="centered",
    )
    inject_light_theme()

    if not DB_PATH.exists():
        st.error(
            "Base de données introuvable. Lancez d'abord : `python pipeline/run_pipeline.py`"
        )
        st.stop()

    selected_boutique, boutique_labels = render_boutique_filter()

    st.title("Réassort client")
    render_boutique_indicator(selected_boutique, boutique_labels)

    overlay_placeholder = st.empty()
    show_overlay(overlay_placeholder)
    try:
        df_rfm, df_top5 = load_data(selected_boutique)
    except Exception as exc:
        st.error(f"Erreur de chargement des données — relancez l'application. ({exc})")
        st.stop()
    finally:
        hide_overlay(overlay_placeholder)

    load_time = datetime.now().strftime("%d/%m à %Hh%M")

    if df_rfm.empty:
        boutique_name = boutique_labels.get(selected_boutique, selected_boutique)
        st.warning(f"Aucun client avec historique suffisant pour {boutique_name}.")
        return

    df = df_rfm.copy()
    df["status_rank"] = df["reorder_status"].map(STATUS_ORDER)
    df_sorted = df.sort_values(
        by=["status_rank", "days_overdue", "customer_name"],
        ascending=[True, False, True],
        na_position="last",
    )

    customers_with_items = df_top5["customer_key"].unique()
    df_sorted = df_sorted[df_sorted["customer_key"].isin(customers_with_items)]

    # --- FILTER BAR ---
    if "main_filter_reset" not in st.session_state:
        st.session_state["main_filter_reset"] = 0
    rk = st.session_state["main_filter_reset"]

    fc1, fc2, fc3 = st.columns([3, 3, 1])
    with fc1:
        status_filter = st.multiselect(
            "Statut réassort",
            options=STATUS_FILTER_OPTIONS,
            default=STATUS_FILTER_OPTIONS,
            key=f"main_status_{rk}",
            label_visibility="visible",
        )
    with fc2:
        name_filter = st.text_input(
            "Recherche client",
            placeholder="Nom du client…",
            key=f"main_name_{rk}",
            label_visibility="visible",
        )
    with fc3:
        st.markdown("<div style='margin-top:28px;'></div>", unsafe_allow_html=True)
        if st.button("Réinitialiser", key="main_reset_btn"):
            st.session_state["main_filter_reset"] += 1
            st.rerun()

    # Apply filters
    selected_statuses = [STATUS_FILTER_MAP[s] for s in status_filter] if status_filter else list(STATUS_FILTER_MAP.values())
    df_filtered = df_sorted[df_sorted["reorder_status"].isin(selected_statuses)]
    if name_filter.strip():
        df_filtered = df_filtered[
            df_filtered["customer_name"].str.contains(name_filter.strip(), case=False, na=False)
        ]

    counts = df_filtered["reorder_status"].value_counts()
    n_retard = counts.get("en_retard", 0)
    n_du = counts.get("du_semaine", 0)
    n_venir = counts.get("a_venir", 0)

    st.markdown(
        f"🔴 **{n_retard}** en retard &nbsp;·&nbsp; "
        f"🟡 **{n_du}** dus &nbsp;·&nbsp; "
        f"🟢 **{n_venir}** à venir",
        unsafe_allow_html=True,
    )
    st.caption(f"Mis à jour le {load_time}")
    st.divider()

    if df_filtered.empty:
        if name_filter.strip() or len(status_filter) < len(STATUS_FILTER_OPTIONS):
            st.info("Aucun client ne correspond aux filtres sélectionnés.")
        else:
            boutique_name = boutique_labels.get(selected_boutique, selected_boutique)
            st.warning(f"Aucun client avec des articles à relancer pour {boutique_name}.")
        return

    for _, row in df_filtered.iterrows():
        status = row["reorder_status"]
        cfg = STATUS_CONFIG[status]
        delay_label = format_delay_label(row)

        last_order = (
            pd.to_datetime(row["last_order_date"]).strftime("%d/%m/%Y")
            if pd.notna(row["last_order_date"])
            else "—"
        )
        freq_text = (
            f"toutes les {int(row['median_frequency_days'])} j"
            if pd.notna(row.get("median_frequency_days"))
            else None
        )
        name_safe = html.escape(str(row["customer_name"]))

        card_style = (
            f"border-left:4px solid {cfg['border']};"
            "padding:12px 16px;margin-bottom:6px;background:white;"
            "border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.08);"
        )
        badge_style = (
            f"float:right;font-weight:700;padding:2px 8px;border-radius:4px;"
            f"font-size:14px;background:{cfg['bg']};color:{cfg['text']};"
        )

        freq_line = (
            f'<div style="{_S_SECONDARY}">Fréquence habituelle : {freq_text}</div>'
            if freq_text
            else ""
        )
        insuffisant_note = (
            f'<div style="{_S_SECONDARY}">&#60; 3 commandes sur 24 mois — fréquence incalculable</div>'
            if status == "insuffisant"
            else ""
        )

        st.markdown(
            f'<div style="{card_style}">'
            f'<span style="{badge_style}">{html.escape(delay_label)}</span>'
            f'<div style="{_S_NAME}">{cfg["emoji"]} {name_safe}</div>'
            f'<div style="{_S_SECONDARY}">Dernière commande : {last_order}</div>'
            f"{freq_line}"
            f"{insuffisant_note}"
            f"</div>",
            unsafe_allow_html=True,
        )

        top5 = df_top5[df_top5["customer_key"] == row["customer_key"]].sort_values("rank")
        label = f"Articles à relancer ({len(top5)})" if not top5.empty else "Articles à relancer"
        with st.expander(label):
            if top5.empty:
                st.caption("Aucun article trouvé sur 12 mois.")
            else:
                for _, item in top5.iterrows():
                    caption = item["item_caption"]
                    if pd.isna(caption) or caption == "":
                        caption_text = (
                            f'<span style="{_S_ITEM_DELETED}">'
                            f"(Article supprimé — ID:{html.escape(str(item['item_id']))})</span>"
                        )
                    else:
                        caption_text = html.escape(str(caption))

                    avg_qty = (
                        f"moy. {round(item['avg_qty_per_order'])} u."
                        if pd.notna(item["avg_qty_per_order"])
                        else ""
                    )
                    st.markdown(
                        f"{int(item['rank'])}. {caption_text} &nbsp;&nbsp; {avg_qty}",
                        unsafe_allow_html=True,
                    )


render_page()
