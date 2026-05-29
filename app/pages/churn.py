"""
S02-07 — Streamlit page: Alertes clients churn dashboard.

Displayed alongside main.py via Streamlit multi-page routing.
Pre-requisite: python pipeline/run_pipeline.py (builds mart_churn_alerts)
"""
import html
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

LEVEL_STYLES = {
    "critique":     ("🔴 CRITIQUE",     "#FEE2E2", "#991B1B", "#EF4444"),
    "modere":       ("🟠 MODÉRÉ",       "#FED7AA", "#9A3412", "#F97316"),
    "surveillance": ("🟡 SURVEILLANCE", "#FEF3C7", "#92400E", "#F59E0B"),
}

SIGNAL_LABELS = {
    "inactivite": ("Inactif depuis {recency} j", "#FEE2E2", "#991B1B"),
    "freq_basse": ("Fréquence faible",            "#FED7AA", "#9A3412"),
    "ca_faible":  ("CA faible",                   "#FEF3C7", "#92400E"),
}


@st.cache_data(ttl=300)
def load_churn_data(boutique_id: str) -> pd.DataFrame:
    sql = """
        SELECT
            customer_key, boutique_id, customer_name,
            last_order_date, recency_days,
            monetary_12m, ca_trend, ca_trend_pct,
            churn_level, churn_signals
        FROM mart_churn_alerts
        WHERE boutique_id = ?
    """
    logger.debug("[QUERY] Début — boutique=%s | table=mart_churn_alerts", boutique_id)
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


def render_ca_trend(ca_trend, ca_trend_pct) -> str:
    if pd.isna(ca_trend):
        return '<span style="color:#9CA3AF">—</span>'
    pct = int(round(float(ca_trend_pct)))
    if ca_trend == "hausse":
        return f'<span style="color:#059669;font-weight:700">↑ +{pct} %</span>'
    if ca_trend == "baisse":
        return f'<span style="color:#DC2626;font-weight:700">↓ {pct} %</span>'
    return '<span style="color:#6B7280;font-weight:700">→ stable</span>'


def render_signals(churn_signals, recency_days: int) -> str:
    tags = []
    for signal in (list(churn_signals) if churn_signals is not None else []):
        if signal not in SIGNAL_LABELS:
            continue
        label_tpl, bg, fg = SIGNAL_LABELS[signal]
        label = label_tpl.format(recency=recency_days)
        tags.append(
            f'<span style="background:{bg};color:{fg};padding:2px 8px;'
            f'border-radius:4px;font-size:12px;font-weight:500">'
            f'{html.escape(label)}</span>'
        )
    return " ".join(tags)


def render_page() -> None:
    st.set_page_config(
        page_title="Alertes churn — Hippocampe Monitor",
        layout="centered",
    )
    inject_light_theme()

    if not DB_PATH.exists():
        st.error(
            "Base de données introuvable. Lancez d'abord : `python pipeline/run_pipeline.py`"
        )
        st.stop()

    selected_boutique, boutique_labels = render_boutique_filter()

    st.title("Alertes churn")
    render_boutique_indicator(selected_boutique, boutique_labels)

    overlay_placeholder = st.empty()
    show_overlay(overlay_placeholder)
    try:
        df = load_churn_data(selected_boutique)
    except Exception as exc:
        st.error(f"Erreur de chargement des données — relancez l'application. ({exc})")
        st.stop()
    finally:
        hide_overlay(overlay_placeholder)

    load_time = datetime.now().strftime("%d/%m à %Hh%M")

    if df.empty:
        boutique_name = boutique_labels.get(selected_boutique, selected_boutique)
        st.warning(f"Aucune alerte churn pour {boutique_name}.")
        return

    # --- FILTER BAR ---
    if "churn_filter_reset" not in st.session_state:
        st.session_state["churn_filter_reset"] = 0
    rk = st.session_state["churn_filter_reset"]

    LEVEL_OPTIONS = ["Critique", "Modéré", "Surveillance"]
    LEVEL_MAP = {"Critique": "critique", "Modéré": "modere", "Surveillance": "surveillance"}
    INACTIF_OPTIONS = ["Tout afficher", "> 30 j", "> 60 j", "> 90 j", "> 180 j"]
    INACTIF_DAYS = {"> 30 j": 30, "> 60 j": 60, "> 90 j": 90, "> 180 j": 180}

    fc1, fc2, fc3, fc4 = st.columns([2, 2, 2, 1])
    with fc1:
        level_filter = st.multiselect(
            "Niveau de risque",
            options=LEVEL_OPTIONS,
            default=LEVEL_OPTIONS,
            key=f"churn_level_{rk}",
        )
    with fc2:
        name_filter = st.text_input(
            "Recherche client",
            placeholder="Nom du client…",
            key=f"churn_name_{rk}",
        )
    with fc3:
        inactif_filter = st.selectbox(
            "Inactif depuis",
            options=INACTIF_OPTIONS,
            key=f"churn_inactif_{rk}",
        )
    with fc4:
        st.markdown("<div style='margin-top:28px;'></div>", unsafe_allow_html=True)
        if st.button("Réinitialiser", key="churn_reset_btn"):
            st.session_state["churn_filter_reset"] += 1
            st.rerun()

    # Apply filters
    selected_levels = [LEVEL_MAP[l] for l in level_filter] if level_filter else list(LEVEL_MAP.values())
    df_filtered = df[df["churn_level"].isin(selected_levels)]
    if name_filter.strip():
        df_filtered = df_filtered[
            df_filtered["customer_name"].str.contains(name_filter.strip(), case=False, na=False)
        ]
    if inactif_filter != "Tout afficher":
        threshold = INACTIF_DAYS[inactif_filter]
        df_filtered = df_filtered[df_filtered["recency_days"] >= threshold]

    n_critique     = len(df_filtered[df_filtered["churn_level"] == "critique"])
    n_modere       = len(df_filtered[df_filtered["churn_level"] == "modere"])
    n_surveillance = len(df_filtered[df_filtered["churn_level"] == "surveillance"])

    st.markdown(
        f"🔴 **{n_critique}** critiques &nbsp;·&nbsp; "
        f"🟠 **{n_modere}** modérés &nbsp;·&nbsp; "
        f"🟡 **{n_surveillance}** surveillés",
        unsafe_allow_html=True,
    )
    st.caption(f"Mis à jour le {load_time}")
    st.divider()

    if df_filtered.empty:
        if name_filter.strip() or len(level_filter) < len(LEVEL_OPTIONS) or inactif_filter != "Tout afficher":
            st.info("Aucune alerte ne correspond aux filtres sélectionnés.")
        else:
            boutique_name = boutique_labels.get(selected_boutique, selected_boutique)
            st.warning(f"Aucune alerte churn pour {boutique_name}.")
        return

    for _, row in df_filtered.iterrows():
        level = row["churn_level"]
        label, bg, fg, border = LEVEL_STYLES[level]

        ca_html   = render_ca_trend(row["ca_trend"], row["ca_trend_pct"])
        tags_html = render_signals(row["churn_signals"], int(row["recency_days"]))

        last_date = pd.to_datetime(row["last_order_date"]).strftime("%d/%m/%Y")
        monetary  = f"{float(row['monetary_12m']):,.2f} €".replace(",", " ").replace(".", ",")
        name_safe = html.escape(str(row["customer_name"]))

        st.markdown(f"""
        <div style="border-left:4px solid {border};padding:12px 16px;
                    margin-bottom:12px;border-radius:4px;background:#FFFFFF;
                    box-shadow:0 1px 2px rgba(0,0,0,.08)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <span style="background:{bg};color:{fg};font-weight:700;padding:2px 8px;
                         border-radius:4px;font-size:12px;text-transform:uppercase">{label}</span>
            {ca_html}
          </div>
          <div style="font-weight:600;font-size:16px;margin:6px 0">{name_safe}</div>
          <div style="color:#6B7280;font-size:14px">
            Dernier achat : {last_date} · il y a {int(row['recency_days'])} jours<br>
            CA 12 mois : {monetary}
          </div>
          <div style="margin-top:8px">{tags_html}</div>
        </div>
        """, unsafe_allow_html=True)


render_page()
