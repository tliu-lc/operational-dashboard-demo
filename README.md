# DEMO-MONITOR

Dashboard de monitoring opérationnel pour une société de vente grossiste de vêtements (4 boutiques EBP).

**Stack :** Next.js 15 · FastAPI · BigQuery · dbt · Cloud Run · Cloud Build

---

## Architecture

```
Internet
   │
   ▼
┌─────────────────────────────┐
│  Cloud Run — Next.js        │  ← Seul point d'entrée public
│  demo-frontend        │    Login JWT protège toutes les pages
└──────────────┬──────────────┘
               │ appels internes VPC
               ▼
┌─────────────────────────────┐
│  Cloud Run — FastAPI        │  ← API privée (ingress: internal)
│  demo-api             │    Lit depuis BigQuery
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  BigQuery                   │
│  demo_raw             │  ← CSV EBP chargés par le job ingestion
│  demo_dwh             │  ← Staging tables (dbt)
│  demo_dtm             │  ← Marts consommés par l'API (dbt)
└──────────────┬──────────────┘
               ▲
┌──────────────┴──────────────┐
│  GCS — demo-raw-prod  │  ← CSV EBP déposés par script externe
└─────────────────────────────┘
```

**Pipeline de données quotidien** (Cloud Scheduler → Cloud Run Jobs) :

```
03:00  Job demo-ingestion  →  GCS CSV → BQ demo_raw
03:20  Job demo-dbt        →  dbt seed + dbt run → BQ dwh + dtm
```

**CI/CD** : chaque push sur `main` déclenche Cloud Build qui :
1. `terraform apply` — met à jour l'infra
2. Build + push des 4 images Docker (api, frontend, ingestion, dbt)
3. `gcloud run deploy` — déploie api et frontend
4. Met à jour les Cloud Run Jobs ingestion et dbt

---

## Lancer en local

### Prérequis

| Outil | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 20+ |
| gcloud CLI | récent |

### 1 — Credentials GCP (une seule fois)

```bash
gcloud auth application-default login
```

Cela permet à l'API FastAPI locale de lire BigQuery avec ton compte Google.

### 2 — Backend FastAPI

```bash
# Depuis la racine du projet
pip install -r api/requirements.txt
uvicorn api.main:app --reload --port 8000
```

L'API charge automatiquement `api/.env` (non commité) avec les variables BigQuery.

| URL | Description |
|---|---|
| http://localhost:8000 | API |
| http://localhost:8000/docs | Documentation interactive Swagger |

### 3 — Frontend Next.js

```bash
cd frontend
npm install
npm run dev
```

Application disponible sur **http://localhost:3000**

Le fichier `frontend/.env.local` (non commité, déjà présent) contient :
```
NEXT_PUBLIC_API_URL=http://localhost:8000
AUTH_SECRET=...
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=...
```

---

## Structure du projet

```
demo-monitor/
│
├── api/                        ← Backend FastAPI
│   ├── main.py                 ← Point d'entrée + chargement .env
│   ├── bq.py                   ← Client BigQuery partagé
│   ├── .env                    ← Variables locales (gitignore)
│   ├── requirements.txt
│   └── routers/
│       ├── articles.py         ← /api/articles
│       ├── client.py           ← /api/clients
│       ├── rfm.py              ← /api/rfm
│       ├── churn.py            ← /api/churn
│       ├── geo.py              ← /api/geo
│       ├── stock.py            ← /api/stock
│       ├── perf_season.py      ← /api/perf-season
│       └── monitoring.py       ← /api/monitoring/health
│
├── frontend/                   ← Frontend Next.js 15
│   ├── app/
│   │   ├── page.tsx            ← Accueil / résumé du jour
│   │   ├── articles/           ← Catalogue articles
│   │   ├── client/             ← Fiche client + RFM
│   │   ├── geo/                ← Carte France + International
│   │   ├── churn/              ← Alertes churn
│   │   ├── stock/              ← Stocks par dépôt
│   │   └── perf-saison/        ← Best-sellers & flops par saison
│   ├── .env.local              ← Variables locales (gitignore)
│   └── package.json
│
├── ingestion/                  ← Cloud Run Job — GCS → BQ raw
│   ├── load_to_bq.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── dbt/                        ← Transformations BigQuery
│   ├── models/
│   │   ├── dwh/                ← Staging (stg_*)
│   │   └── dtm/                ← Marts (mart_*)
│   ├── seeds/
│   │   └── ref_departments.csv ← Référentiel départements
│   ├── profiles.yml            ← Connexion BQ (gitignore)
│   ├── profiles.yml.example
│   └── Dockerfile
│
├── terraform/                  ← Infrastructure GCP as code
│   ├── terraform.auto.tfvars   ← Variables non-sensibles (commité)
│   ├── cloudrun.tf             ← Services + Jobs Cloud Run
│   ├── scheduler.tf            ← Cloud Scheduler (3h00/3h20)
│   ├── secrets.tf              ← Conteneurs Secret Manager
│   ├── iam.tf                  ← Compte de service + rôles
│   ├── storage.tf              ← Buckets GCS
│   ├── bigquery.tf             ← Datasets BQ
│   └── cloudbuild.tf           ← Trigger CI/CD
│
├── cloudbuild.yaml             ← Pipeline CI/CD Cloud Build
│
└── vault/Docs/
    └── DEPLOIEMENT-PROD.md     ← Guide de déploiement complet
```

---

## Sur GCP

### Services Cloud Run

| Service | Visibilité | Rôle |
|---|---|---|
| `demo-frontend` | Public | Interface web Next.js |
| `demo-api` | Interne | API FastAPI |

### Cloud Run Jobs

| Job | Heure | Rôle |
|---|---|---|
| `demo-ingestion` | 03:00 (Europe/Paris) | Charge les CSV GCS dans BQ raw |
| `demo-dbt` | 03:20 (Europe/Paris) | Transforme raw → dwh → dtm |

### BigQuery — datasets

| Dataset | Contenu |
|---|---|
| `demo_raw` | Tables brutes chargées depuis les CSV (`raw_hip_*`, `raw_sed_*`, …) |
| `demo_dwh` | Staging dbt (`stg_customers`, `stg_sale_documents`, …) |
| `demo_dtm` | Marts consommés par l'API (`mart_customer_rfm`, `mart_geo_sales`, …) |

### Secrets (Secret Manager)

| Secret | Contenu |
|---|---|
| `demo-auth-secret` | Clé JWT NextAuth |
| `demo-auth-username` | Identifiant de connexion |
| `demo-auth-password-hash` | Hash bcrypt du mot de passe |

### Déploiement

Voir [`vault/Docs/DEPLOIEMENT-PROD.md`](vault/Docs/DEPLOIEMENT-PROD.md) pour le guide complet de premier déploiement.

---

## Les 4 boutiques

| Code | Dossier GCS |
|---|---|
| `HIP` | `fashion_center/` |
| `SED` | `sedaine/` |
| `HPC` | `demo/` |
| `ACC` | `accessoires/` |

---

## Modèle de données

```
GCS CSV (EBP)
    │
    ▼ ingestion/load_to_bq.py
demo_raw.raw_{boutique}_{table}   ← tout STRING, schéma depuis header CSV
    │
    ▼ dbt/models/dwh/
demo_dwh.stg_customers            ← clients unifiés 4 boutiques
demo_dwh.stg_sale_documents       ← factures
demo_dwh.stg_sale_lines           ← lignes de factures
demo_dwh.stg_items                ← articles
demo_dwh.stg_stock_items          ← niveaux de stock
demo_dwh.stg_stock_movements      ← mouvements de stock
demo_dwh.stg_storehous            ← dépôts
    │
    ▼ dbt/models/dtm/
demo_dtm.mart_customer_rfm        ← RFM + statuts clients
demo_dtm.mart_customer_detail     ← détail client + commandes
demo_dtm.mart_churn_alerts        ← scores churn + signaux
demo_dtm.mart_geo_sales           ← CA par département
demo_dtm.mart_geo_international   ← CA par pays
demo_dtm.mart_item_perf_by_season ← performance articles par saison
demo_dtm.mart_item_top5_by_customer
demo_dtm.mart_item_clients
demo_dtm.mart_customers_by_dept
demo_dtm.mart_stock_status        ← stocks + alertes urgence
```
