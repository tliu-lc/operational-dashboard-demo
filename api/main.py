from dotenv import load_dotenv
load_dotenv()  # charge api/.env si présent (dev local), no-op en prod

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request

from google.oauth2 import id_token
from google.auth.transport import requests as grequests

from api.routers import rfm, churn, client, geo, stock, perf_season, monitoring, articles, payments, analyse, prospects

_project = os.environ.get("GCP_PROJECT_ID", "")
TRUSTED_SA_EMAILS = {
    f"demo-frontend-sa@{_project}.iam.gserviceaccount.com",
    f"demo-sa@{_project}.iam.gserviceaccount.com",
}

app = FastAPI(title="DEMO-MONITOR API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "PATCH"],
    allow_headers=["*"],
)


@app.middleware("http")
async def verify_identity_token(request: Request, call_next):
    # Toujours autoriser en dev local et health check
    if request.url.path == "/api/health":
        return await call_next(request)

    # Sauter la vérification en développement local
    if os.getenv("SKIP_AUTH_MIDDLEWARE"):
        return await call_next(request)

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    token = auth[7:]
    try:
        info = id_token.verify_oauth2_token(token, grequests.Request())
        email = info.get("email", "")
        if email not in TRUSTED_SA_EMAILS:
            return JSONResponse({"detail": "Forbidden"}, status_code=403)
    except Exception:
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    return await call_next(request)


app.include_router(rfm.router)
app.include_router(churn.router)
app.include_router(client.router)
app.include_router(geo.router)
app.include_router(stock.router)
app.include_router(perf_season.router)
app.include_router(monitoring.router)
app.include_router(articles.router)
app.include_router(payments.router)
app.include_router(analyse.router)
app.include_router(prospects.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def get_config():
    app_name = os.getenv("APP_NAME", "DEMO")
    boutiques_env = os.getenv("APP_BOUTIQUES_JSON", "")
    if boutiques_env:
        import json
        cfg = json.loads(boutiques_env)
        return cfg
    return {
        "app_name": app_name,
        "boutiques": {"HIP": "Paris 11e", "SED": "Lyon Presqu'île", "HPC": "Bordeaux Chartrons", "ACC": "Nantes Commerce", "ALL": "Maison Delor"},
        "boutique_order": ["HIP", "SED", "HPC", "ACC", "ALL"],
    }
