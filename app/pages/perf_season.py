"""
S03-10 — Streamlit page: Best-sellers & flops par saison.

Two-panel view: top N best-sellers vs bottom N flops (with residual stock > 0).
Uses mart_item_perf_by_season filtered by boutique_id.
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


@st.cache_data(ttl=300)
def load_seasons(boutique_id: str) -> list[tuple]:
    sql = """
        SELECT DISTINCT season_label, BOOL_OR(is_current_season) AS is_current
        FROM mart_item_perf_by_season
        WHERE boutique_id = ?
        GROUP BY season_label
        ORDER BY season_label DESC
    """
    logger.debug("[QUERY] Début — boutique=%s | table=mart_item_perf_by_season (seasons)", boutique_id)
    t0 = time.perf_counter()
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        rows = con.execute(sql, [boutique_id]).fetchall()
        con.close()
        duration_ms = (time.perf_counter() - t0) * 1000
        logger.debug(
            "[QUERY] OK — boutique=%s | saisons=%d | durée=%.1f ms",
            boutique_id, len(rows), duration_ms,
        )
        return rows
    except Exception as e:
        logger.error("[QUERY] ERREUR — boutique=%s | %s", boutique_id, str(e))
        raise


@st.cache_data(ttl=300)
def load_perf_data(boutique_id: str, season_label: str) -> pd.DataFrame:
    sql = """
        SELECT item_id, item_caption, type_vetement,
               qty_sold_season, revenue_ht_season,
               margin_ht_season, margin_rate,
               real_stock_current, is_current_season,
               revenue_ht_season_n1, ca_trend_season_pct
        FROM mart_item_perf_by_season
        WHERE boutique_id = ?
          AND season_label = ?
        ORDER BY revenue_ht_season DESC
    """
    logger.debug(
        "[QUERY] Début — boutique=%s | saison=%s | table=mart_item_perf_by_season",
        boutique_id, season_label,
    )
    t0 = time.perf_counter()
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [boutique_id, season_label]).df()
        con.close()
        duration_ms = (time.perf_counter() - t0) * 1000
        logger.debug(
            "[QUERY] OK — boutique=%s | saison=%s | lignes=%d | durée=%.1f ms",
            boutique_id, season_label, len(df), duration_ms,
        )
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR — boutique=%s | %s", boutique_id, str(e))
        raise


def fmt_euros(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    return f"{float(val):,.2f} €".replace(",", " ").replace(".", ",")


def fmt_pct(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    v = float(val)
    sign = "+" if v > 0 else ""
    return f"{sign}{v:.1f} %"


def fmt_trend(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    v = float(val)
    if v > 0:
        return f"↑ +{v:.1f} %"
    if v < 0:
        return f"↓ {v:.1f} %"
    return "→ 0,0 %"


def fmt_qty(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    return f"{float(val):,.0f}".replace(",", " ")


def build_display_df(df: pd.DataFrame, n: int, mode: str) -> pd.DataFrame:
    if mode == "best":
        subset = df.head(n).reset_index(drop=True)
    else:
        top_ids = set(df.head(n)["item_id"].tolist())
        flop_pool = df[
            (df["real_stock_current"] > 0) &
            (~df["item_id"].isin(top_ids))
        ].copy()
        subset = flop_pool.sort_values("revenue_ht_season", ascending=True).head(n).reset_index(drop=True)

    rows = []
    for i, r in subset.iterrows():
        caption = r["item_caption"] if pd.notna(r.get("item_caption")) and r["item_caption"] else f"(ID: {r['item_id']})"
        type_v = r["type_vetement"] if pd.notna(r.get("type_vetement")) else "Autres"
        stock_val = r["real_stock_current"]
        stock_str = fmt_qty(stock_val) if pd.notna(stock_val) else "—"

        row = {
            "#":            i + 1,
            "Article":      caption,
            "Type":         type_v,
            "CA HT saison": fmt_euros(r["revenue_ht_season"]),
            "Qté vendue":   fmt_qty(r["qty_sold_season"]),
            "Marge HT":     fmt_euros(r.get("margin_ht_season")),
            "Tx marge":     fmt_pct(r.get("margin_rate")),
            "Stock act.":   stock_str,
        }
        if mode == "best":
            row["vs N-1"] = fmt_trend(r.get("ca_trend_season_pct"))
        rows.append(row)

    return pd.DataFrame(rows)


def render_page() -> None:
    st.set_page_config(
        page_title="Best-sellers & Flops — Demo Monitor",
        layout="wide",
    )
    inject_light_theme()

    if not DB_PATH.exists():
        st.error(
            "Base de données introuvable. Lancez d'abord : `python pipeline/run_pipeline.py`"
        )
        st.stop()

    selected_boutique, boutique_labels = render_boutique_filter()

    st.title("Best-sellers & Flops par saison")
    render_boutique_indicator(selected_boutique, boutique_labels)

    load_time = datetime.now().strftime("%d/%m à %Hh%M")
    st.caption(f"Mis à jour le {load_time}")

    # Load available seasons
    overlay_placeholder = st.empty()
    show_overlay(overlay_placeholder)
    try:
        season_rows = load_seasons(selected_boutique)
    except Exception as exc:
        st.error(f"Erreur de chargement des données — relancez l'application. ({exc})")
        st.stop()
    finally:
        hide_overlay(overlay_placeholder)

    if not season_rows:
        boutique_name = boutique_labels.get(selected_boutique, selected_boutique)
        st.warning(f"Aucune donnée de performance disponible pour {boutique_name}.")
        return

    season_options = []
    for label, is_current in season_rows:
        if is_current:
            season_options.append(f"{label} (en cours — données partielles)")
        else:
            season_options.append(label)

    default_idx = next(
        (i for i, (_, is_cur) in enumerate(season_rows) if not is_cur),
        0
    )

    col_season, col_n, col_type, _ = st.columns([2, 1, 2, 2])

    with col_season:
        selected_season_display = st.selectbox(
            "Saison", season_options, index=default_idx, label_visibility="visible"
        )
    selected_season_label = season_rows[season_options.index(selected_season_display)][0]

    with col_n:
        n_items = st.number_input("Top N", min_value=5, max_value=20, value=10, step=1)

    overlay_placeholder2 = st.empty()
    show_overlay(overlay_placeholder2)
    try:
        df = load_perf_data(selected_boutique, selected_season_label)
    except Exception as exc:
        st.error(f"Erreur de chargement des données — relancez l'application. ({exc})")
        st.stop()
    finally:
        hide_overlay(overlay_placeholder2)

    all_types = sorted(df["type_vetement"].fillna("Autres").unique().tolist())
    with col_type:
        type_opts = ["Tous types"] + all_types
        selected_type = st.selectbox("Type vêtement", type_opts, label_visibility="visible")

    if selected_type != "Tous types":
        if selected_type == "Autres":
            df = df[df["type_vetement"].isna()]
        else:
            df = df[df["type_vetement"] == selected_type]

    st.divider()

    if df.empty:
        st.warning("Aucun article vendu pour cette sélection.")
        return

    st.subheader(f"🏆 Best-sellers — Top {n_items}")
    df_best = build_display_df(df, n_items, "best")
    if df_best.empty:
        st.info("Aucun article best-seller pour cette sélection.")
    else:
        st.dataframe(df_best, use_container_width=True, hide_index=True)

    st.divider()

    st.subheader(f"📉 Flops — Bottom {n_items} (stock résiduel > 0)")
    df_flop = build_display_df(df, n_items, "flop")
    if df_flop.empty:
        st.info("Aucun flop détecté avec stock résiduel pour cette sélection.")
    else:
        st.dataframe(df_flop, use_container_width=True, hide_index=True)


render_page()
