"""Pleine page overlay spinner for DB query blocking (Sprint 05 / S05-07)."""
import streamlit as st

OVERLAY_CSS = """
<style>
#query-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.35);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 16px;
}
#query-overlay .spinner-ring {
    width: 48px; height: 48px;
    border: 5px solid rgba(255,255,255,0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
#query-overlay .spinner-label {
    color: #ffffff;
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 0.02em;
}
@keyframes spin { to { transform: rotate(360deg); } }
body.loading-active > div[data-testid="stAppViewContainer"] {
    pointer-events: none;
    user-select: none;
}
body.loading-active { overflow: hidden; }
</style>
<script>
document.body.classList.add('loading-active');
</script>
<div id="query-overlay">
  <div class="spinner-ring"></div>
  <div class="spinner-label">Chargement en cours…</div>
</div>
"""

OVERLAY_REMOVE_JS = """
<script>
(function() {
    var el = document.getElementById('query-overlay');
    if (el) el.remove();
    document.body.classList.remove('loading-active');
})();
</script>
"""


def show_overlay(placeholder: "st.delta_generator.DeltaGenerator") -> None:
    placeholder.markdown(OVERLAY_CSS, unsafe_allow_html=True)


def hide_overlay(placeholder: "st.delta_generator.DeltaGenerator") -> None:
    placeholder.markdown(OVERLAY_REMOVE_JS, unsafe_allow_html=True)
    placeholder.empty()
