"""
S06-02 / S07-02/03 — Streamlit page: Fiche client détaillée.

Entry points:
  - Direct navigation: page shows inline search bar
  - Via st.query_params["client_id"]: loads detail immediately (from geo.py drill-down)
Pre-requisite: python pipeline/run_pipeline.py
"""
import html
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

import duckdb
import pandas as pd
import plotly.express as px
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
from utils.ui_helpers import apply_theme, inject_light_theme

logger = logging.getLogger(__name__)

CHURN_STYLES: dict[str, tuple[str, str, str]] = {
    "vert":   ("● Fidèle",    "#DCFCE7", "#16A34A"),
    "orange": ("● À risque",  "#FEF3C7", "#D97706"),
    "rouge":  ("● En fuite",  "#FEE2E2", "#DC2626"),
    "gris":   ("● Sans achat","#F1F5F9", "#94A3B8"),
}


def fmt_euros(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    return f"{float(val):,.0f} €".replace(",", " ")


def fmt_date(val) -> str:
    if val is None or (isinstance(val, (float, type(None))) and pd.isna(val)):
        return "—"
    try:
        return pd.to_datetime(val).strftime("%Y-%m-%d")
    except Exception:
        return str(val)


def _churn_badge(churn_color: str) -> str:
    label, bg, fg = CHURN_STYLES.get(churn_color, CHURN_STYLES["vert"])
    return (
        f'<span style="background:{bg};color:{fg};padding:4px 14px;'
        f'border-radius:4px;font-weight:600;font-size:14px;">{label}</span>'
    )


def _trend_html(pct) -> str:
    if pct is None or (isinstance(pct, float) and pd.isna(pct)):
        return '<span style="color:#94A3B8;font-size:20px;font-weight:600;">Données insuffisantes</span>'
    v = float(pct)
    if v > 5:
        return f'<span style="color:#16A34A;font-size:20px;font-weight:600;">↗ +{v:.1f} %</span>'
    if v < -5:
        return f'<span style="color:#DC2626;font-size:20px;font-weight:600;">↘ {v:.1f} %</span>'
    return f'<span style="color:#64748B;font-size:20px;font-weight:600;">→ {v:.1f} %</span>'


def _kpi_card(label: str, value: str) -> str:
    return (
        f'<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;'
        f'padding:16px 12px;text-align:center;">'
        f'<div style="color:#64748B;font-size:12px;margin-bottom:6px;">{label}</div>'
        f'<div style="color:#1E293B;font-size:22px;font-weight:600;">{value}</div>'
        f'</div>'
    )


@st.cache_data(ttl=300)
def load_customers_list(boutique_id: str) -> pd.DataFrame:
    sql = """
        SELECT customer_id, customer_name, dept_code, city,
               churn_color, ca_total_ht, ca_12m_ht,
               last_order_date, recency_days
        FROM mart_customer_detail
        WHERE boutique_id = ?
        ORDER BY customer_name
    """
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [boutique_id]).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[CLIENT] Erreur chargement liste — %s", str(e))
        return pd.DataFrame()


@st.cache_data(ttl=300)
def search_customers(search_term: str, boutique_id: str) -> list[dict]:
    sql = """
        SELECT id AS customer_id, name
        FROM stg_customers
        WHERE boutique_id = ?
          AND (UPPER(name) LIKE UPPER(?) OR UPPER(id) LIKE UPPER(?))
        ORDER BY name
        LIMIT 20
    """
    pattern = f"%{search_term}%"
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        rows = con.execute(sql, [boutique_id, pattern, pattern]).fetchall()
        con.close()
        return [{"customer_id": r[0], "name": r[1]} for r in rows]
    except Exception as e:
        logger.error("[CLIENT] Erreur recherche — %s", str(e))
        return []


@st.cache_data(ttl=300)
def load_customer_detail(customer_id: str, boutique_id: str) -> pd.DataFrame:
    sql = """
        SELECT *
        FROM mart_customer_detail
        WHERE customer_id = ? AND boutique_id = ?
        LIMIT 1
    """
    logger.debug("[QUERY] mart_customer_detail — customer=%s boutique=%s", customer_id, boutique_id)
    t0 = time.perf_counter()
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [customer_id, boutique_id]).df()
        con.close()
        logger.debug("[QUERY] OK — durée=%.1f ms", (time.perf_counter() - t0) * 1000)
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR — %s", str(e))
        raise


@st.cache_data(ttl=300)
def load_monthly_ca(customer_key: str) -> pd.DataFrame:
    sql = """
        SELECT
            DATE_TRUNC('month', document_date) AS month,
            SUM(amount_ht) AS ca_ht
        FROM stg_sale_documents
        WHERE customer_key = ?
          AND is_valid_sale = TRUE
          AND document_date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month
    """
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [customer_key]).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR monthly_ca — %s", str(e))
        return pd.DataFrame(columns=["month", "ca_ht"])


@st.cache_data(ttl=300)
def load_top5_items(customer_key: str) -> pd.DataFrame:
    sql = """
        SELECT rank, item_id, item_caption, total_qty_12m, order_count_item
        FROM mart_item_top5_by_customer
        WHERE customer_key = ?
        ORDER BY rank
        LIMIT 5
    """
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [customer_key]).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR top5_items — %s", str(e))
        return pd.DataFrame()


@st.cache_data(ttl=300)
def load_last_orders(customer_key: str) -> pd.DataFrame:
    sql = """
        SELECT
            d.document_date,
            d.amount_ht,
            d.document_number,
            COUNT(DISTINCT l.item_id) AS nb_refs
        FROM stg_sale_documents d
        LEFT JOIN stg_sale_lines l
            ON  l.document_id = d.id
            AND l.boutique_id = d.boutique_id
        WHERE d.customer_key = ?
          AND d.is_valid_sale = TRUE
        GROUP BY d.id, d.document_date, d.amount_ht, d.document_number
        ORDER BY d.document_date DESC
        LIMIT 10
    """
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [customer_key]).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR last_orders — %s", str(e))
        return pd.DataFrame()


@st.cache_data(ttl=300)
def load_global_monthly_ca() -> pd.DataFrame:
    sql = """
        SELECT
            DATE_TRUNC('month', document_date) AS month,
            SUM(amount_ht) AS ca_ht
        FROM stg_sale_documents
        WHERE is_valid_sale = TRUE
          AND document_date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month
    """
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR global_monthly_ca — %s", str(e))
        return pd.DataFrame(columns=["month", "ca_ht"])


@st.cache_data(ttl=300)
def load_customer_full_history_monthly_ca(customer_key: str) -> pd.DataFrame:
    sql = """
        SELECT
            DATE_TRUNC('month', document_date) AS month,
            SUM(amount_ht) AS ca_ht
        FROM stg_sale_documents
        WHERE customer_key = ?
          AND is_valid_sale = TRUE
        GROUP BY month
        ORDER BY month
    """
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [customer_key]).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR customer_full_history_monthly_ca — %s", str(e))
        return pd.DataFrame(columns=["month", "ca_ht"])


CHURN_FILTER_OPTIONS = ["Fidèle", "À risque", "En fuite", "Sans achat"]
CHURN_COLOR_MAP = {"Fidèle": "vert", "À risque": "orange", "En fuite": "rouge", "Sans achat": "gris"}
CHURN_LABEL_MAP = {"vert": "Fidèle", "orange": "À risque", "rouge": "En fuite", "gris": "Sans achat"}


def _render_search(selected_boutique: str) -> None:
    """Filter + table panel shown when no client is selected."""
    # --- GRAPH CA GLOBAL CLIENT (S10-01) ---
    st.subheader("CA global — 12 derniers mois (toutes boutiques)")
    try:
        df_global = load_global_monthly_ca()
        if df_global.empty:
            st.info("Aucune vente enregistrée sur les 12 derniers mois.")
        else:
            df_global["month_label"] = pd.to_datetime(df_global["month"]).dt.strftime("%b %Y")
            fig_global = px.bar(
                df_global,
                x="month_label",
                y="ca_ht",
                labels={"month_label": "", "ca_ht": "CA HT (€)"},
            )
            fig_global.update_traces(marker_color="#2563EB")
            apply_theme(fig_global)
            fig_global.update_layout(
                paper_bgcolor="#F8FAFC",
                plot_bgcolor="#F8FAFC",
                margin=dict(l=0, r=0, t=10, b=0),
                height=220,
            )
            st.plotly_chart(fig_global, use_container_width=True)
    except Exception as e:
        logger.error("[CLIENT] Erreur graph CA global — %s", str(e))
    st.divider()

    df_all = load_customers_list(selected_boutique)
    if df_all.empty:
        boutique_name = BOUTIQUE_LABELS.get(selected_boutique, selected_boutique)
        st.warning(f"Aucun client disponible pour {boutique_name}.")
        return

    if "client_filter_reset" not in st.session_state:
        st.session_state["client_filter_reset"] = 0
    rk = st.session_state["client_filter_reset"]

    dept_values = sorted([d for d in df_all["dept_code"].dropna().unique() if str(d).strip()])
    show_dept = len(dept_values) > 0

    if show_dept:
        fc1, fc2, fc3, fc4 = st.columns([2, 2, 1.5, 1])
    else:
        fc1, fc2, fc3 = st.columns([2, 2, 1])

    with fc1:
        name_filter = st.text_input(
            "Recherche client",
            placeholder="Nom du client…",
            key=f"client_name_{rk}",
        )
    with fc2:
        churn_filter = st.multiselect(
            "Statut churn",
            options=CHURN_FILTER_OPTIONS,
            default=CHURN_FILTER_OPTIONS,
            key=f"client_churn_{rk}",
        )
    if show_dept:
        with fc3:
            dept_filter = st.selectbox(
                "Département",
                options=["Tous les départements"] + dept_values,
                key=f"client_dept_{rk}",
            )
    else:
        dept_filter = "Tous les départements"
    with (fc4 if show_dept else fc3):
        st.markdown("<div style='margin-top:28px;'></div>", unsafe_allow_html=True)
        if st.button("Réinitialiser", key="client_reset_btn"):
            st.session_state["client_filter_reset"] += 1
            st.rerun()

    # Apply filters
    selected_churn = [CHURN_COLOR_MAP[c] for c in churn_filter] if churn_filter else list(CHURN_COLOR_MAP.values())
    df_filtered = df_all[df_all["churn_color"].isin(selected_churn)]
    if name_filter.strip():
        df_filtered = df_filtered[
            df_filtered["customer_name"].str.contains(name_filter.strip(), case=False, na=False)
        ]
    if dept_filter != "Tous les départements":
        df_filtered = df_filtered[df_filtered["dept_code"] == dept_filter]

    if df_filtered.empty:
        st.info("Aucun client ne correspond aux filtres sélectionnés.")
        return

    display = pd.DataFrame({
        "Client":         df_filtered["customer_name"].values,
        "Dept":           df_filtered["dept_code"].fillna("—").values,
        "Churn":          df_filtered["churn_color"].map(CHURN_LABEL_MAP).fillna("—").values,
        "CA Total":       df_filtered["ca_total_ht"].apply(fmt_euros).values,
        "Dern. commande": df_filtered["last_order_date"].apply(fmt_date).values,
        "Inactivité":     df_filtered["recency_days"].apply(
                              lambda v: f"{int(v)} j" if pd.notna(v) else "—"
                          ).values,
        "_customer_id":   df_filtered["customer_id"].astype(str).values,
    })

    st.caption(f"{len(display)} client(s) affiché(s)")
    st.dataframe(display.drop(columns=["_customer_id"]), use_container_width=True, hide_index=True)

    selected_name = st.selectbox(
        "Ouvrir la fiche d'un client :",
        options=display["Client"].tolist(),
        key=f"client_select_{rk}",
    )
    if st.button("Voir la fiche →", key="client_goto_btn", type="primary"):
        chosen = display[display["Client"] == selected_name].iloc[0]
        client_id = chosen["_customer_id"]
        st.query_params["client_id"] = client_id
        st.session_state["_pending_client_id"] = client_id
        st.rerun()


def _render_detail(client_id: str, selected_boutique: str, boutique_labels: dict) -> None:
    """Render full client detail card."""
    if st.button("← Nouvelle recherche", key="back_to_search"):
        st.query_params.clear()
        st.rerun()

    overlay_placeholder = st.empty()
    show_overlay(overlay_placeholder)
    try:
        df = load_customer_detail(str(client_id), selected_boutique)
    except Exception as exc:
        st.error(f"Erreur de chargement — relancez l'application. ({exc})")
        st.stop()
    finally:
        hide_overlay(overlay_placeholder)

    if df.empty:
        st.error("Client introuvable — vérifiez l'identifiant ou la boutique sélectionnée.")
        st.stop()

    row = df.iloc[0]
    customer_key = str(row["customer_key"])
    boutique_name = boutique_labels.get(selected_boutique, selected_boutique)

    is_france = bool(row["is_france"]) if pd.notna(row.get("is_france")) else True

    # --- SECTION 1 : HEADER IDENTITÉ ---
    churn_color = str(row.get("churn_color", "vert"))
    badge_html = _churn_badge(churn_color)

    name_safe = html.escape(str(row["customer_name"]))
    customer_id_safe = html.escape(str(row["customer_id"]))

    if is_france:
        loc_parts = []
        if pd.notna(row.get("dept_code")):
            loc_parts.append(f"Dept : {row['dept_code']}")
        if pd.notna(row.get("city")) and row["city"]:
            loc_parts.append(f"Ville : {html.escape(str(row['city']))}")
        loc_parts.append("Pays : France")
    else:
        loc_parts = []
        if pd.notna(row.get("city")) and row["city"]:
            loc_parts.append(f"Ville : {html.escape(str(row['city']))}")
        country_code = str(row.get("country_iso_code", "")) or "—"
        loc_parts.append(f"Pays : {country_code}")

    loc_line = " · ".join(loc_parts)
    boutique_line = f"Boutique : {html.escape(boutique_name)}"

    addr_parts = []
    if pd.notna(row.get("address1")) and row["address1"]:
        addr_parts.append(html.escape(str(row["address1"])))
    if pd.notna(row.get("address2")) and row["address2"]:
        addr_parts.append(html.escape(str(row["address2"])))
    if pd.notna(row.get("zip_code")) and row["zip_code"]:
        city_str = str(row.get("city", "") or "")
        addr_parts.append(f"{html.escape(str(row['zip_code']))} {html.escape(city_str)}".strip())
    addr_line = ", ".join(addr_parts) if addr_parts else ""

    st.markdown(f"""
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px 24px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <span style="color:#1E293B;font-size:24px;font-weight:700;">{name_safe}</span>
        {badge_html}
      </div>
      <div style="color:#64748B;font-size:14px;margin-bottom:4px;">{boutique_line} · {loc_line}</div>
      {"" if not addr_line else f'<div style="color:#64748B;font-size:13px;margin-bottom:4px;">Adresse : {addr_line}</div>'}
      <div style="color:#94A3B8;font-size:12px;">ID client : {customer_id_safe}</div>
    </div>
    """, unsafe_allow_html=True)

    st.caption(f"Données filtrées — Boutique {boutique_name}")

    # --- SECTION 2 : KPIs LIGNE 1 ---
    c1, c2, c3, c4 = st.columns(4)
    c1.markdown(_kpi_card("CA Total HT", fmt_euros(row["ca_total_ht"])), unsafe_allow_html=True)
    c2.markdown(_kpi_card("CA 12 mois HT", fmt_euros(row["ca_12m_ht"])), unsafe_allow_html=True)
    c3.markdown(_kpi_card("Nb commandes", str(int(row["nb_orders_total"]))), unsafe_allow_html=True)
    c4.markdown(_kpi_card("Panier moyen HT", fmt_euros(row["avg_basket_ht"])), unsafe_allow_html=True)

    st.markdown("<div style='margin-top:12px;'></div>", unsafe_allow_html=True)

    # --- SECTION 3 : KPIs LIGNE 2 ---
    c5, c6, c7 = st.columns(3)
    last_order_str = fmt_date(row.get("last_order_date"))
    recency_days = int(row["recency_days"]) if pd.notna(row.get("recency_days")) else None
    recency_str = f"{recency_days} jours" if recency_days is not None else "—"

    c5.markdown(_kpi_card("Dernière commande", last_order_str), unsafe_allow_html=True)
    c6.markdown(_kpi_card("Jours sans commande", recency_str), unsafe_allow_html=True)
    c7.markdown(
        f'<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;'
        f'padding:16px 12px;text-align:center;">'
        f'<div style="color:#64748B;font-size:12px;margin-bottom:6px;">Tendance CA 6 mois</div>'
        f'{_trend_html(row.get("ca_trend_6m_pct"))}'
        f'</div>',
        unsafe_allow_html=True,
    )

    st.markdown("<div style='margin-top:20px;'></div>", unsafe_allow_html=True)

    # --- SECTION 4 : GRAPHIQUE CA MENSUEL + TOP 5 RÉFÉRENCES ---
    df_monthly = load_monthly_ca(customer_key)
    df_top5 = load_top5_items(customer_key)

    col_chart, col_top5 = st.columns([3, 2])

    with col_chart:
        st.subheader("CA mensuel — 12 derniers mois")
        if df_monthly.empty:
            st.info("Aucune commande sur les 12 derniers mois.")
        else:
            df_monthly["month_label"] = pd.to_datetime(df_monthly["month"]).dt.strftime("%b %Y")
            fig = px.bar(
                df_monthly,
                x="month_label",
                y="ca_ht",
                labels={"month_label": "", "ca_ht": "CA HT (€)"},
            )
            fig.update_traces(marker_color="#2563EB")
            apply_theme(fig)
            fig.update_layout(
                paper_bgcolor="#F8FAFC",
                plot_bgcolor="#F8FAFC",
                margin=dict(l=0, r=0, t=10, b=0),
                height=260,
            )
            st.plotly_chart(fig, use_container_width=True)

    with col_top5:
        st.subheader("Top 5 références (12 mois)")
        if df_top5.empty:
            st.info("Aucun article trouvé sur 12 mois.")
        else:
            display = pd.DataFrame({
                "Référence": df_top5["item_caption"].fillna(
                    df_top5["item_id"].apply(lambda x: f"(ID: {x})")
                ),
                "Qté": df_top5["total_qty_12m"].apply(lambda v: f"{int(v):,}".replace(",", " ")),
                "Cmdes": df_top5["order_count_item"].astype(int),
            })
            st.dataframe(display, use_container_width=True, hide_index=True)

    st.markdown("<div style='margin-top:20px;'></div>", unsafe_allow_html=True)

    # --- SECTION 5 : 10 DERNIÈRES COMMANDES ---
    st.subheader("10 dernières commandes")
    df_orders = load_last_orders(customer_key)
    if df_orders.empty:
        st.info("Aucune commande enregistrée pour ce client.")
    else:
        orders_display = pd.DataFrame({
            "Date":      df_orders["document_date"].apply(fmt_date),
            "Montant HT": df_orders["amount_ht"].apply(fmt_euros),
            "Nb réf.":   df_orders["nb_refs"].astype(int),
            "N° commande": df_orders["document_number"].fillna("—"),
        })
        st.dataframe(orders_display, use_container_width=True, hide_index=True)

    st.markdown("<div style='margin-top:24px;'></div>", unsafe_allow_html=True)

    # --- SECTION 6 : CA MENSUEL HISTORIQUE COMPLET (S11-01) ---
    st.subheader("Dépenses par mois — historique complet (toutes boutiques)")
    df_history = load_customer_full_history_monthly_ca(customer_key)
    if df_history.empty:
        st.info("Aucun historique de commande disponible pour ce client.")
    else:
        df_history["month_label"] = pd.to_datetime(df_history["month"]).dt.strftime("%b %Y")
        fig_history = px.bar(
            df_history,
            x="month_label",
            y="ca_ht",
            labels={"month_label": "", "ca_ht": "CA HT (€)"},
        )
        fig_history.update_traces(marker_color="#2563EB")
        apply_theme(fig_history)
        fig_history.update_layout(
            paper_bgcolor="#F8FAFC",
            plot_bgcolor="#F8FAFC",
            margin=dict(l=0, r=0, t=10, b=0),
            height=280,
        )
        st.plotly_chart(fig_history, use_container_width=True)

    load_time = datetime.now().strftime("%d/%m à %Hh%M")
    st.caption(f"Mis à jour le {load_time}")


def render_page() -> None:
    st.set_page_config(
        page_title="Fiche client — Demo Monitor",
        layout="wide",
    )
    inject_light_theme()

    if not DB_PATH.exists():
        st.error("Base de données introuvable. Lancez d'abord : `python pipeline/run_pipeline.py`")
        st.stop()

    selected_boutique, boutique_labels = render_boutique_filter()

    st.title("Fiche client")
    render_boutique_indicator(selected_boutique, boutique_labels)

    client_id = st.query_params.get("client_id") or st.session_state.pop("_pending_client_id", None)
    if client_id:
        _render_detail(str(client_id), selected_boutique, boutique_labels)
    else:
        _render_search(selected_boutique)


render_page()
