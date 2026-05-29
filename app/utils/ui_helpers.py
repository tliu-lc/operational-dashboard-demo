import streamlit as st
import plotly.graph_objects as go

_LIGHT_THEME_CSS = """
<style>
    /* Force light-only color-scheme globally — prevents browser dark-mode auto-adjustments */
    :root, html, body {
        color-scheme: only light !important;
        background-color: #FFFFFF !important;
        color: #1E293B !important;
    }
    /* Force all Streamlit component iframes (GlideDataGrid, Arrow, etc.) to light mode */
    iframe {
        color-scheme: only light !important;
    }
    /* Force white background on the main app container */
    .stApp {
        background-color: #FFFFFF !important;
        color-scheme: only light !important;
    }
    /* Sidebar */
    section[data-testid="stSidebar"] > div:first-child {
        background-color: #F8FAFC !important;
    }
    /* Top header bar */
    header[data-testid="stHeader"] {
        background-color: #FFFFFF !important;
    }
    /* All text defaults to dark slate */
    .stApp, .stApp p, .stApp span, .stApp div,
    .stApp label, .stApp li {
        color: #1E293B !important;
    }
    h1, h2, h3, h4, h5, h6 {
        color: #1E293B !important;
    }
    /* Streamlit widgets — inputs */
    .stTextInput > div > div > input {
        background-color: #FFFFFF !important;
        color: #1E293B !important;
        border-color: #E2E8F0 !important;
    }
    /* Streamlit dataframe — wrapper + iframe host */
    .stDataFrame,
    [data-testid="stDataFrame"] {
        background-color: #FFFFFF !important;
        color-scheme: only light !important;
    }
    [data-testid="stDataFrame"] > div,
    [data-testid="stDataFrame"] iframe {
        background-color: #FFFFFF !important;
        color-scheme: only light !important;
    }
    [data-testid="stDataFrame"] * {
        color-scheme: only light !important;
    }
    /* GlideDataGrid internal elements (Arrow table renderer) */
    .glideDataEditor,
    .dvn-scroller,
    .gdg-style {
        background-color: #FFFFFF !important;
        color: #1E293B !important;
        color-scheme: only light !important;
    }
    /* st.table HTML tables */
    [data-testid="stTable"] table,
    .stTable table {
        background-color: #FFFFFF !important;
        color: #1E293B !important;
        border-collapse: collapse !important;
    }
    [data-testid="stTable"] th,
    .stTable th {
        background-color: #F8FAFC !important;
        color: #1E293B !important;
        border-bottom: 2px solid #E2E8F0 !important;
        padding: 8px 12px !important;
    }
    [data-testid="stTable"] td,
    .stTable td {
        background-color: #FFFFFF !important;
        color: #1E293B !important;
        border-bottom: 1px solid #F1F5F9 !important;
        padding: 8px 12px !important;
    }
    [data-testid="stTable"] tr:hover td,
    .stTable tr:hover td {
        background-color: #F8FAFC !important;
    }
    /* ── S09-02 : BaseWeb select / multiselect containers ── */
    .stSelectbox > div > div,
    .stMultiSelect > div > div {
        background-color: #FFFFFF !important;
        color: #1E293B !important;
        border-color: #E2E8F0 !important;
    }
    [data-baseweb="select"] {
        background-color: #FFFFFF !important;
    }
    [data-baseweb="select"] > div {
        background-color: #FFFFFF !important;
        border-color: #E2E8F0 !important;
        color: #1E293B !important;
    }
    [data-baseweb="select"] input,
    [data-baseweb="select"] span,
    [data-baseweb="select"] div {
        color: #1E293B !important;
        background-color: #FFFFFF !important;
    }
    /* ── S09-03 : BaseWeb dropdown popover ── */
    [data-baseweb="popover"],
    [data-baseweb="popover"] > div {
        background-color: #FFFFFF !important;
        border-color: #E2E8F0 !important;
    }
    [data-baseweb="menu"] {
        background-color: #FFFFFF !important;
    }
    [data-baseweb="menu"] li,
    [data-baseweb="menu"] [role="option"] {
        background-color: #FFFFFF !important;
        color: #1E293B !important;
    }
    [data-baseweb="menu"] li:hover,
    [data-baseweb="menu"] [role="option"]:hover,
    [data-baseweb="menu"] [aria-selected="true"] {
        background-color: #F1F5F9 !important;
        color: #1E293B !important;
    }
    /* ── S09-03 : Multiselect tags (chips) ── */
    [data-baseweb="tag"] {
        background-color: #EFF6FF !important;
        border: 1px solid #BFDBFE !important;
    }
    [data-baseweb="tag"] span {
        color: #2563EB !important;
        background-color: transparent !important;
    }
    [data-baseweb="tag"] button,
    [data-baseweb="tag"] svg {
        color: #2563EB !important;
        background-color: transparent !important;
    }
    /* Expander */
    details > summary {
        color: #1E293B !important;
    }
    /* Buttons */
    .stButton > button {
        background-color: #2563EB !important;
        color: #FFFFFF !important;
        border: none !important;
    }
    .stButton > button:hover {
        background-color: #1D4ED8 !important;
    }
</style>
"""


def inject_light_theme() -> None:
    """Inject CSS overrides to enforce the light theme on all Streamlit widgets."""
    st.markdown(_LIGHT_THEME_CSS, unsafe_allow_html=True)


PLOTLY_LAYOUT = dict(
    template="plotly_white",
    paper_bgcolor="#FFFFFF",
    plot_bgcolor="#F8FAFC",
    font=dict(color="#1E293B", family="sans-serif"),
    title_font=dict(color="#1E293B"),
    xaxis=dict(gridcolor="#E2E8F0", linecolor="#E2E8F0", tickfont=dict(color="#64748B")),
    yaxis=dict(gridcolor="#E2E8F0", linecolor="#E2E8F0", tickfont=dict(color="#64748B")),
)


def apply_theme(fig: go.Figure) -> go.Figure:
    fig.update_layout(**PLOTLY_LAYOUT)
    return fig


# ISO 3166-1 alpha-2 → alpha-3 mapping
ISO2_TO_ISO3: dict[str, str] = {
    "AF": "AFG", "AL": "ALB", "DZ": "DZA", "AD": "AND", "AO": "AGO",
    "AR": "ARG", "AM": "ARM", "AU": "AUS", "AT": "AUT", "AZ": "AZE",
    "BS": "BHS", "BH": "BHR", "BD": "BGD", "BE": "BEL", "BJ": "BEN",
    "BT": "BTN", "BO": "BOL", "BA": "BIH", "BW": "BWA", "BR": "BRA",
    "BN": "BRN", "BG": "BGR", "BF": "BFA", "BI": "BDI", "CV": "CPV",
    "KH": "KHM", "CM": "CMR", "CA": "CAN", "CF": "CAF", "TD": "TCD",
    "CL": "CHL", "CN": "CHN", "CO": "COL", "KM": "COM", "CG": "COG",
    "CD": "COD", "CR": "CRI", "CI": "CIV", "HR": "HRV", "CU": "CUB",
    "CY": "CYP", "CZ": "CZE", "DK": "DNK", "DJ": "DJI", "DO": "DOM",
    "EC": "ECU", "EG": "EGY", "SV": "SLV", "GQ": "GNQ", "ER": "ERI",
    "EE": "EST", "SZ": "SWZ", "ET": "ETH", "FJ": "FJI", "FI": "FIN",
    "FR": "FRA", "GA": "GAB", "GM": "GMB", "GE": "GEO", "DE": "DEU",
    "GH": "GHA", "GR": "GRC", "GT": "GTM", "GN": "GIN", "GW": "GNB",
    "GY": "GUY", "HT": "HTI", "HN": "HND", "HU": "HUN", "IS": "ISL",
    "IN": "IND", "ID": "IDN", "IR": "IRN", "IQ": "IRQ", "IE": "IRL",
    "IL": "ISR", "IT": "ITA", "JM": "JAM", "JP": "JPN", "JO": "JOR",
    "KZ": "KAZ", "KE": "KEN", "KP": "PRK", "KR": "KOR", "KW": "KWT",
    "KG": "KGZ", "LA": "LAO", "LV": "LVA", "LB": "LBN", "LS": "LSO",
    "LR": "LBR", "LY": "LBY", "LI": "LIE", "LT": "LTU", "LU": "LUX",
    "MG": "MDG", "MW": "MWI", "MY": "MYS", "MV": "MDV", "ML": "MLI",
    "MT": "MLT", "MR": "MRT", "MU": "MUS", "MX": "MEX", "MD": "MDA",
    "MC": "MCO", "MN": "MNG", "ME": "MNE", "MA": "MAR", "MZ": "MOZ",
    "MM": "MMR", "NA": "NAM", "NP": "NPL", "NL": "NLD", "NZ": "NZL",
    "NI": "NIC", "NE": "NER", "NG": "NGA", "MK": "MKD", "NO": "NOR",
    "OM": "OMN", "PK": "PAK", "PA": "PAN", "PG": "PNG", "PY": "PRY",
    "PE": "PER", "PH": "PHL", "PL": "POL", "PT": "PRT", "QA": "QAT",
    "RO": "ROU", "RU": "RUS", "RW": "RWA", "SA": "SAU", "SN": "SEN",
    "RS": "SRB", "SL": "SLE", "SG": "SGP", "SK": "SVK", "SI": "SVN",
    "SO": "SOM", "ZA": "ZAF", "SS": "SSD", "ES": "ESP", "LK": "LKA",
    "SD": "SDN", "SR": "SUR", "SE": "SWE", "CH": "CHE", "SY": "SYR",
    "TW": "TWN", "TJ": "TJK", "TZ": "TZA", "TH": "THA", "TL": "TLS",
    "TG": "TGO", "TN": "TUN", "TR": "TUR", "TM": "TKM", "UG": "UGA",
    "UA": "UKR", "AE": "ARE", "GB": "GBR", "US": "USA", "UY": "URY",
    "UZ": "UZB", "VE": "VEN", "VN": "VNM", "YE": "YEM", "ZM": "ZMB",
    "ZW": "ZWE",
    # French overseas territories
    "GP": "GLP", "MQ": "MTQ", "GF": "GUF", "RE": "REU", "YT": "MYT",
    "PM": "SPM", "BL": "BLM", "MF": "MAF",
}


def iso2_to_iso3(code: str) -> str | None:
    if not code:
        return None
    return ISO2_TO_ISO3.get(str(code).upper())
