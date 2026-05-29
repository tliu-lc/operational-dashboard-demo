"""
S03-07 / S06-01 / S06-03 / S06-04 / S08 — Analyse géographique.

France dept choropleth + international country map + drill-down per dept/country.
Pre-requisite: python pipeline/run_pipeline.py
"""
import html
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

import duckdb
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
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
from utils.ui_helpers import apply_theme, iso2_to_iso3, inject_light_theme

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent.parent
GEOJSON_PATH = ROOT / "data" / "ref" / "departments.geojson"

DEPT_DRILLDOWN_PAGE_SIZE = 50

# Choropleth colorscale: visible even at low values (light blue → dark navy)
_MAP_COLORSCALE = [
    [0.0,  "#DBEAFE"],
    [0.15, "#93C5FD"],
    [0.45, "#3B82F6"],
    [0.75, "#2563EB"],
    [1.0,  "#1E3A8A"],
]

# ISO-2 → French country name (most common for a French wholesaler)
ISO2_TO_NAME_FR: dict[str, str] = {
    "BE": "Belgique", "DE": "Allemagne", "GB": "Royaume-Uni",
    "IT": "Italie", "ES": "Espagne", "NL": "Pays-Bas",
    "CH": "Suisse", "LU": "Luxembourg", "PT": "Portugal",
    "AT": "Autriche", "PL": "Pologne", "SE": "Suède",
    "NO": "Norvège", "DK": "Danemark", "FI": "Finlande",
    "IE": "Irlande", "GR": "Grèce", "CZ": "Rép. tchèque",
    "HU": "Hongrie", "RO": "Roumanie", "BG": "Bulgarie",
    "HR": "Croatie", "SK": "Slovaquie", "SI": "Slovénie",
    "LT": "Lituanie", "LV": "Lettonie", "EE": "Estonie",
    "MA": "Maroc", "TN": "Tunisie", "DZ": "Algérie",
    "SN": "Sénégal", "CI": "Côte d'Ivoire", "CM": "Cameroun",
    "US": "États-Unis", "CA": "Canada", "JP": "Japon",
    "AU": "Australie", "BR": "Brésil", "MX": "Mexique",
    "AE": "Émirats arabes unis", "SA": "Arabie saoudite",
    "RU": "Russie", "TR": "Turquie", "IL": "Israël",
    "LB": "Liban", "SY": "Syrie", "JO": "Jordanie",
    "IN": "Inde", "CN": "Chine", "KR": "Corée du Sud",
    "SG": "Singapour", "TW": "Taïwan",
    "MC": "Monaco", "AD": "Andorre", "LI": "Liechtenstein",
    "MU": "Maurice", "RE": "La Réunion", "GP": "Guadeloupe",
    "MQ": "Martinique", "GF": "Guyane", "YT": "Mayotte",
    "NC": "Nouvelle-Calédonie", "PF": "Polynésie française",
}


def _country_name(iso2: str) -> str:
    return ISO2_TO_NAME_FR.get(str(iso2).upper(), str(iso2))


@st.cache_data
def load_geojson() -> dict:
    with open(GEOJSON_PATH) as f:
        return json.load(f)


@st.cache_data(ttl=300)
def load_france_geo_data(
    boutique_id: str,
) -> tuple[pd.DataFrame, pd.DataFrame, tuple[int, int, int]]:
    sql_geo = """
        SELECT dept_code, dept_name, boutique_id,
               revenue_ht_12m, active_customers_12m,
               order_count_12m, avg_basket_ht, is_metro
        FROM mart_geo_sales
        WHERE boutique_id = ?
          AND is_metro = TRUE
        ORDER BY revenue_ht_12m DESC
    """
    sql_scatter = """
        SELECT c.customer_key, c.name AS customer_name,
               c.latitude, c.longitude, c.boutique_id,
               r.monetary_12m
        FROM stg_customers c
        JOIN mart_customer_rfm r ON r.customer_key = c.customer_key
        WHERE c.latitude  IS NOT NULL
          AND c.longitude IS NOT NULL
          AND c.boutique_id = ?
          AND c.latitude  BETWEEN 41.0 AND 51.5
          AND c.longitude BETWEEN -5.5 AND 10.0
    """
    logger.debug("[QUERY] France geo — boutique=%s", boutique_id)
    t0 = time.perf_counter()
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df_geo     = con.execute(sql_geo, [boutique_id]).df()
        df_scatter = con.execute(sql_scatter, [boutique_id]).df()
        total    = con.execute("SELECT COUNT(*) FROM stg_customers").fetchone()[0]
        no_zip   = con.execute("""
            SELECT COUNT(*) FROM stg_customers
            WHERE zip_code IS NULL OR LENGTH(TRIM(zip_code)) < 4
        """).fetchone()[0]
        malformed = con.execute("""
            SELECT COUNT(*) FROM stg_customers
            WHERE zip_code IS NOT NULL
              AND LENGTH(TRIM(zip_code)) >= 1
              AND LENGTH(TRIM(zip_code)) < 4
        """).fetchone()[0]
        con.close()
        logger.debug(
            "[QUERY] OK — geo=%d | scatter=%d | durée=%.1f ms",
            len(df_geo), len(df_scatter), (time.perf_counter() - t0) * 1000,
        )
        return df_geo, df_scatter, (total, no_zip, malformed)
    except Exception as e:
        logger.error("[QUERY] ERREUR France geo — %s", str(e))
        raise


@st.cache_data(ttl=300)
def load_intl_geo_data(boutique_id: str) -> pd.DataFrame:
    sql = """
        SELECT country_iso_code, nb_customers_total, nb_customers_actifs_12m,
               ca_12m_ht, nb_orders_12m, is_france_group
        FROM mart_geo_international
        WHERE boutique_id = ?
          AND is_france_group = FALSE
        ORDER BY ca_12m_ht DESC
    """
    logger.debug("[QUERY] International geo — boutique=%s", boutique_id)
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [boutique_id]).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR intl geo — %s", str(e))
        return pd.DataFrame()


@st.cache_data(ttl=300)
def load_dept_customers(boutique_id: str, dept_code: str) -> pd.DataFrame:
    sql = """
        SELECT customer_id, customer_name, city, ca_total_ht, ca_12m_ht,
               last_order_date, churn_color
        FROM mart_customers_by_dept
        WHERE boutique_id = ? AND dept_code = ?
        ORDER BY ca_total_ht DESC
    """
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [boutique_id, dept_code]).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR dept customers — %s", str(e))
        return pd.DataFrame()


@st.cache_data(ttl=300)
def load_country_customers(boutique_id: str, country_iso_code: str) -> pd.DataFrame:
    sql = """
        SELECT r.customer_id, r.customer_name,
               r.monetary     AS ca_total,
               r.monetary_12m AS ca_12m,
               r.last_order_date,
               r.recency_days
        FROM mart_customer_rfm r
        JOIN mart_customer_detail d
            ON r.customer_id = d.customer_id AND r.boutique_id = d.boutique_id
        WHERE r.boutique_id = ?
          AND d.country_iso_code = ?
          AND d.is_france = FALSE
        ORDER BY r.monetary DESC
    """
    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        df = con.execute(sql, [boutique_id, country_iso_code]).df()
        con.close()
        return df
    except Exception as e:
        logger.error("[QUERY] ERREUR country customers — %s", str(e))
        return pd.DataFrame()


def fmt_euros(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    return f"{float(val):,.0f} €".replace(",", " ")


def _churn_dot(churn_color: str) -> str:
    colors = {"vert": "#16A34A", "orange": "#D97706", "rouge": "#DC2626", "gris": "#94A3B8"}
    c = colors.get(churn_color, "#94A3B8")
    return f'<span style="color:{c};font-weight:700;">●</span>'


def _render_france_tab(
    selected_boutique: str,
    boutique_labels: dict[str, str],
    df_geo: pd.DataFrame,
    df_scatter: pd.DataFrame,
    zip_diag: tuple,
) -> None:
    total_cust, no_zip, malformed = zip_diag

    col_toggle, _ = st.columns([3, 4])
    with col_toggle:
        scatter_disabled = df_scatter.empty
        show_scatter = st.toggle(
            "Afficher les clients GPS (données insuffisantes)"
            if scatter_disabled
            else "Afficher les clients (GPS)",
            value=False,
            disabled=scatter_disabled,
            key="scatter_toggle",
        )

    if df_geo.empty:
        boutique_name = boutique_labels.get(selected_boutique, selected_boutique)
        st.warning(f"Aucune donnée géographique disponible pour {boutique_name}.")
        return

    total_ca      = df_geo["revenue_ht_12m"].sum()
    total_clients = df_geo["active_customers_12m"].sum()
    total_orders  = df_geo["order_count_12m"].sum()
    avg_basket    = total_ca / total_orders if total_orders > 0 else None

    col1, col2, col3 = st.columns(3)
    col1.metric("CA France HT 12 mois", fmt_euros(total_ca))
    col2.metric("Clients actifs", f"{int(total_clients):,}".replace(",", " "))
    col3.metric("Panier moyen", fmt_euros(avg_basket))

    geojson = load_geojson()
    selected_dept = st.session_state.get("selected_dept")

    df_map = df_geo.copy()
    df_map["ca_fmt"]     = df_map["revenue_ht_12m"].apply(fmt_euros)
    df_map["basket_fmt"] = df_map["avg_basket_ht"].apply(fmt_euros)
    max_ca = float(df_map["revenue_ht_12m"].max()) or 1.0

    main_opacity = 0.4 if selected_dept else 1.0

    fig = px.choropleth(
        df_map,
        geojson=geojson,
        locations="dept_code",
        featureidkey="properties.code",
        color="revenue_ht_12m",
        color_continuous_scale=_MAP_COLORSCALE,
        range_color=[0, max_ca],
        custom_data=["dept_code", "dept_name", "ca_fmt", "active_customers_12m",
                     "order_count_12m", "basket_fmt"],
        scope="europe",
    )
    fig.update_geos(fitbounds="geojson", visible=False)
    fig.update_traces(
        marker_opacity=main_opacity,
        marker_line=dict(color="#FFFFFF", width=0.5),
        hovertemplate=(
            "<b>%{customdata[1]}</b> (%{customdata[0]})<br>"
            "CA HT 12 mois : %{customdata[2]}<br>"
            "Clients actifs : %{customdata[3]}<br>"
            "Commandes : %{customdata[4]}<br>"
            "Panier moyen : %{customdata[5]}"
            "<extra></extra>"
        ),
    )

    if selected_dept:
        df_sel = df_map[df_map["dept_code"] == selected_dept]
        if not df_sel.empty:
            fig.add_trace(go.Choropleth(
                geojson=geojson,
                locations=df_sel["dept_code"],
                featureidkey="properties.code",
                z=df_sel["revenue_ht_12m"],
                colorscale=_MAP_COLORSCALE,
                zmin=0,
                zmax=max_ca,
                showscale=False,
                marker=dict(
                    line=dict(color="#FFFFFF", width=3),
                    opacity=1.0,
                ),
                customdata=df_sel[["dept_code", "dept_name", "ca_fmt",
                                   "active_customers_12m", "order_count_12m", "basket_fmt"]].values,
                hovertemplate=(
                    "<b>%{customdata[1]}</b> (%{customdata[0]})<br>"
                    "CA HT 12 mois : %{customdata[2]}<br>"
                    "Clients actifs : %{customdata[3]}<br>"
                    "Commandes : %{customdata[4]}<br>"
                    "Panier moyen : %{customdata[5]}"
                    "<extra></extra>"
                ),
                name="",
            ))

    if show_scatter and not df_scatter.empty:
        m = df_scatter["monetary_12m"].fillna(0)
        rng = m.max() - m.min()
        size_norm = (m - m.min()) / (rng + 1e-9)
        size_px = 4 + size_norm * 16
        fig.add_trace(go.Scattergeo(
            lat=df_scatter["latitude"],
            lon=df_scatter["longitude"],
            mode="markers",
            marker=dict(size=size_px, color="#F97316", opacity=0.6),
            customdata=df_scatter[["customer_name", "monetary_12m"]].values,
            hovertemplate=(
                "<b>%{customdata[0]}</b><br>"
                "CA 12 mois : %{customdata[1]:,.0f} €"
                "<extra></extra>"
            ),
            name="Clients GPS",
        ))

    apply_theme(fig)
    fig.update_layout(
        margin={"r": 0, "t": 0, "l": 0, "b": 0},
        height=500,
        paper_bgcolor="#FFFFFF",
        plot_bgcolor="#FFFFFF",
        coloraxis_colorbar=dict(title="CA HT (€)"),
        geo=dict(bgcolor="#FFFFFF"),
    )

    event = st.plotly_chart(fig, key="geo_map_france", on_select="rerun", use_container_width=True)

    if event and event.selection and event.selection.points:
        pt = event.selection.points[0]
        clicked_dept = pt.get("location") or str(pt.get("customdata", [""])[0])
        if clicked_dept:
            if st.session_state.get("selected_dept") == clicked_dept:
                st.session_state["selected_dept"] = None
            else:
                st.session_state["selected_dept"] = clicked_dept
                st.session_state.pop("drill_page", None)
            st.rerun()

    if total_cust > 0:
        n_non_loc = no_zip
        st.caption(
            f"ℹ️ {n_non_loc:,} clients sans code postal valide — non affichés sur la carte".replace(",", " ")
        )
        if malformed > 0:
            st.info(f"{malformed} code(s) postal(aux) malformé(s) détecté(s) — exclus de la carte.")

    if not selected_dept:
        st.markdown(
            '<div style="text-align:center;color:#64748B;font-size:13px;margin-top:4px;">'
            'Cliquez sur un département pour afficher ses clients'
            '</div>',
            unsafe_allow_html=True,
        )

    # --- DRILL-DOWN TABLE ---
    if selected_dept:
        df_dept = load_dept_customers(selected_boutique, selected_dept)
        boutique_name = boutique_labels.get(selected_boutique, selected_boutique)

        dept_name = ""
        if not df_geo.empty:
            match = df_geo[df_geo["dept_code"] == selected_dept]
            if not match.empty:
                dept_name = f" · {match.iloc[0]['dept_name']}"

        n_total = len(df_dept)
        drill_page = st.session_state.get("drill_page", 0)
        n_pages = max(1, (n_total + DEPT_DRILLDOWN_PAGE_SIZE - 1) // DEPT_DRILLDOWN_PAGE_SIZE)
        drill_page = min(drill_page, n_pages - 1)

        hcol1, hcol2 = st.columns([6, 1])
        with hcol1:
            st.markdown(
                f'<div style="font-weight:600;font-size:16px;margin:12px 0 4px;">'
                f'{n_total} client{"s" if n_total != 1 else ""} — '
                f'Département {selected_dept}{dept_name}</div>',
                unsafe_allow_html=True,
            )
            st.caption(f"Filtrée — Boutique {boutique_name}")
        with hcol2:
            if st.button("✕ Fermer", key="close_drilldown"):
                st.session_state["selected_dept"] = None
                st.session_state.pop("drill_page", None)
                st.rerun()

        if df_dept.empty:
            st.info("Aucun client dans ce département.")
        else:
            page_df = df_dept.iloc[
                drill_page * DEPT_DRILLDOWN_PAGE_SIZE:
                (drill_page + 1) * DEPT_DRILLDOWN_PAGE_SIZE
            ].copy()

            display_rows = []
            for _, r in page_df.iterrows():
                display_rows.append({
                    "Nom":              html.escape(str(r["customer_name"])),
                    "Ville":            str(r.get("city") or "—"),
                    "CA Total":         fmt_euros(r["ca_total_ht"]),
                    "CA 12M":           fmt_euros(r["ca_12m_ht"]),
                    "Dern. commande":   str(r["last_order_date"])[:10] if pd.notna(r.get("last_order_date")) else "—",
                    "Churn":            "● " + {"vert": "Fidèle", "orange": "À risque", "rouge": "En fuite"}.get(
                                            str(r.get("churn_color", "gris")), "Sans achat"
                                        ),
                    "_customer_id":     str(r["customer_id"]),
                })

            df_display = pd.DataFrame(display_rows)

            st.dataframe(
                df_display.drop(columns=["_customer_id"]),
                use_container_width=True,
                hide_index=True,
            )

            selected_row_name = st.selectbox(
                "Ouvrir la fiche d'un client :",
                options=df_display["Nom"].tolist(),
                key=f"drilldown_select_{selected_dept}_{drill_page}",
                label_visibility="visible",
            )
            if st.button("Voir fiche client →", key=f"drilldown_goto_{selected_dept}_{drill_page}"):
                chosen = df_display[df_display["Nom"] == selected_row_name].iloc[0]
                client_id = chosen["_customer_id"]
                st.query_params["client_id"] = client_id
                st.session_state["_pending_client_id"] = client_id
                st.switch_page("pages/client.py")

            if n_pages > 1:
                pcol1, pcol2, pcol3 = st.columns([1, 2, 1])
                with pcol1:
                    if drill_page > 0:
                        if st.button("◀ Préc.", key="drill_prev"):
                            st.session_state["drill_page"] = drill_page - 1
                            st.rerun()
                with pcol2:
                    st.markdown(
                        f'<div style="text-align:center;color:#64748B;padding-top:8px;">'
                        f'Page {drill_page + 1} / {n_pages}</div>',
                        unsafe_allow_html=True,
                    )
                with pcol3:
                    if drill_page < n_pages - 1:
                        if st.button("Suiv. ▶", key="drill_next"):
                            st.session_state["drill_page"] = drill_page + 1
                            st.rerun()

    st.subheader("Top 10 départements")
    top10 = df_geo.head(10).reset_index(drop=True)
    top10.index = top10.index + 1
    top10_display = pd.DataFrame({
        "Département": top10["dept_name"] + " (" + top10["dept_code"] + ")",
        "CA HT 12m":   top10["revenue_ht_12m"].apply(fmt_euros),
        "Clients":     top10["active_customers_12m"].astype(int),
        "Commandes":   top10["order_count_12m"].astype(int),
        "Panier moy.": top10["avg_basket_ht"].apply(fmt_euros),
    })
    st.dataframe(top10_display, use_container_width=True)


def _render_international_tab(
    selected_boutique: str,
    boutique_labels: dict[str, str],
    df_intl: pd.DataFrame,
) -> None:
    # Reset selected country on boutique change
    if st.session_state.get("_intl_last_boutique") != selected_boutique:
        st.session_state["selected_country"] = None
        st.session_state["_intl_last_boutique"] = selected_boutique

    if df_intl.empty:
        boutique_name = boutique_labels.get(selected_boutique, selected_boutique)
        st.warning(f"Aucune donnée internationale disponible pour {boutique_name}.")
        return

    selected_country = st.session_state.get("selected_country")

    total_ca      = df_intl["ca_12m_ht"].sum()
    total_clients = df_intl["nb_customers_total"].sum()

    col1, col2, col3 = st.columns(3)
    col1.metric("CA International HT 12 mois", fmt_euros(total_ca))
    col2.metric("Clients hors France", f"{int(total_clients):,}".replace(",", " "))
    col3.metric("Pays actifs", str(len(df_intl)))

    # --- MAP ---
    df_intl = df_intl.copy()
    df_intl["iso3"] = df_intl["country_iso_code"].apply(iso2_to_iso3)
    df_intl["country_name"] = df_intl["country_iso_code"].apply(_country_name)
    df_plot = df_intl.dropna(subset=["iso3"]).copy()

    if df_plot.empty:
        st.warning("Impossible d'afficher la carte (codes pays non reconnus).")
    else:
        df_plot["ca_fmt"] = df_plot["ca_12m_ht"].apply(fmt_euros)
        max_ca = float(df_plot["ca_12m_ht"].max()) or 1.0

        # Highlight selected country with higher opacity
        opacity_list = []
        for iso2 in df_plot["country_iso_code"]:
            if selected_country and iso2 == selected_country:
                opacity_list.append(1.0)
            else:
                opacity_list.append(0.85 if not selected_country else 0.4)

        fig = px.choropleth(
            df_plot,
            locations="iso3",
            color="ca_12m_ht",
            hover_name="country_name",
            color_continuous_scale=_MAP_COLORSCALE,
            range_color=[0, max_ca],
            custom_data=["country_iso_code", "nb_customers_total",
                         "nb_customers_actifs_12m", "ca_fmt", "nb_orders_12m", "country_name"],
        )
        fig.update_traces(
            hovertemplate=(
                "<b>%{customdata[5]}</b> (%{customdata[0]})<br>"
                "CA HT 12M : %{customdata[3]}<br>"
                "Clients total : %{customdata[1]}<br>"
                "Clients actifs 12M : %{customdata[2]}<br>"
                "Commandes 12M : %{customdata[4]}"
                "<extra></extra>"
            ),
            marker_line=dict(color="#FFFFFF", width=0.5),
        )
        apply_theme(fig)
        fig.update_layout(
            margin={"r": 0, "t": 0, "l": 0, "b": 0},
            height=480,
            paper_bgcolor="#FFFFFF",
            coloraxis_colorbar=dict(title="CA HT (€)"),
            geo=dict(
                showframe=False,
                showcoastlines=True,
                bgcolor="#FFFFFF",
                projection_type="natural earth",
            ),
        )

        event = st.plotly_chart(
            fig, key="geo_map_intl", on_select="rerun", use_container_width=True
        )

        if event and event.selection and event.selection.points:
            pt = event.selection.points[0]
            clicked_iso2 = str(pt.get("customdata", [""])[0])
            if clicked_iso2 and clicked_iso2 in df_intl["country_iso_code"].values:
                if st.session_state.get("selected_country") == clicked_iso2:
                    st.session_state["selected_country"] = None
                else:
                    st.session_state["selected_country"] = clicked_iso2
                st.rerun()
            else:
                # Click outside a country — reset
                if st.session_state.get("selected_country"):
                    st.session_state["selected_country"] = None
                    st.rerun()

    # --- COUNTRY DETAIL or SYNTHESIS TABLE ---
    if selected_country:
        country_label = _country_name(selected_country)
        df_clients = load_country_customers(selected_boutique, selected_country)
        n_clients = len(df_clients)

        hcol1, hcol2 = st.columns([5, 1])
        with hcol1:
            st.markdown(
                f'<div style="font-weight:600;font-size:16px;margin:12px 0 4px;">'
                f'📍 Clients — {html.escape(country_label)} ({n_clients} client{"s" if n_clients != 1 else ""})'
                f'</div>',
                unsafe_allow_html=True,
            )
        with hcol2:
            if st.button("← Voir tous les pays", key="intl_reset_country"):
                st.session_state["selected_country"] = None
                st.rerun()

        if df_clients.empty:
            boutique_name = boutique_labels.get(selected_boutique, selected_boutique)
            st.info(f"Aucun client pour ce pays dans la boutique {boutique_name}.")
        else:
            client_display = pd.DataFrame({
                "Nom":               df_clients["customer_name"].values,
                "CA total (€)":      df_clients["ca_total"].apply(fmt_euros).values,
                "CA 12 mois (€)":    df_clients["ca_12m"].apply(
                                         lambda v: "0,00 €" if pd.isna(v) or float(v) == 0
                                         else fmt_euros(v)
                                     ).values,
                "Dern. commande":    df_clients["last_order_date"].apply(
                                         lambda v: str(v)[:10] if pd.notna(v) else "—"
                                     ).values,
                "Inactivité":        df_clients["recency_days"].apply(
                                         lambda v: f"{int(v)} j" if pd.notna(v) else "—"
                                     ).values,
                "_customer_id":      df_clients["customer_id"].astype(str).values,
            })

            st.dataframe(
                client_display.drop(columns=["_customer_id"]),
                use_container_width=True,
                hide_index=True,
            )

            sel_name = st.selectbox(
                "Ouvrir la fiche d'un client :",
                options=client_display["Nom"].tolist(),
                key=f"intl_client_select_{selected_country}",
            )
            if st.button("Voir fiche client →", key=f"intl_client_goto_{selected_country}"):
                chosen = client_display[client_display["Nom"] == sel_name].iloc[0]
                client_id = chosen["_customer_id"]
                st.query_params["client_id"] = client_id
                st.session_state["_pending_client_id"] = client_id
                st.switch_page("pages/client.py")

    else:
        # Synthesis table — click on row to select country
        st.subheader("Top pays par CA HT 12 mois")
        top = df_intl.head(20).reset_index(drop=True)
        top.index = top.index + 1
        top_display = pd.DataFrame({
            "Pays":         top["country_name"],
            "CA HT 12M":    top["ca_12m_ht"].apply(fmt_euros),
            "Clients":      top["nb_customers_total"].astype(int),
            "Actifs 12M":   top["nb_customers_actifs_12m"].astype(int),
            "Commandes":    top["nb_orders_12m"].astype(int),
            "_iso2":        top["country_iso_code"],
        })

        event_tbl = st.dataframe(
            top_display.drop(columns=["_iso2"]),
            use_container_width=True,
            on_select="rerun",
            selection_mode="single-row",
            key="intl_synthesis_table",
        )

        if event_tbl and event_tbl.selection and event_tbl.selection.rows:
            sel_idx = event_tbl.selection.rows[0]
            iso2 = top_display.iloc[sel_idx]["_iso2"]
            st.session_state["selected_country"] = iso2
            st.rerun()

        st.caption("Cliquez sur un pays (carte ou ligne du tableau) pour voir le détail de ses clients.")


def render_page() -> None:
    st.set_page_config(
        page_title="Analyse géographique — Hippocampe Monitor",
        layout="wide",
    )
    inject_light_theme()

    if not DB_PATH.exists():
        st.error("Base de données introuvable. Lancez d'abord : `python pipeline/run_pipeline.py`")
        st.stop()

    selected_boutique, boutique_labels = render_boutique_filter()

    st.title("Analyse géographique")
    render_boutique_indicator(selected_boutique, boutique_labels)

    load_time = datetime.now().strftime("%d/%m à %Hh%M")
    st.caption(f"Mis à jour le {load_time}")

    overlay_placeholder = st.empty()
    show_overlay(overlay_placeholder)
    try:
        df_geo, df_scatter, zip_diag = load_france_geo_data(selected_boutique)
        df_intl = load_intl_geo_data(selected_boutique)
    except Exception as exc:
        st.error(f"Erreur de chargement des données — relancez l'application. ({exc})")
        st.stop()
    finally:
        hide_overlay(overlay_placeholder)

    tab_france, tab_intl = st.tabs(["🇫🇷 France — départements", "🌍 International — pays"])

    with tab_france:
        _render_france_tab(selected_boutique, boutique_labels, df_geo, df_scatter, zip_diag)

    with tab_intl:
        _render_international_tab(selected_boutique, boutique_labels, df_intl)


render_page()
