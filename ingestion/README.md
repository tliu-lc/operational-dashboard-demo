# ingestion/

Scripts d'ingestion vers BigQuery dataset `demo_raw`.

| Script | Source | Cible | Fréquence |
|---|---|---|---|
| `load_to_bq.py` | GCS (exports EBP CSV par boutique) | `demo_raw.raw_<code>_<table>` | Quotidienne (Cloud Run Job `demo-ingestion`) |
| `import_sirene_naf4771z.py` | data.gouv.fr — StockEtablissement INSEE | `demo_raw.raw_sirene_etab` | Manuel MVP (orchestration mensuelle = backlog) |
| `setup_prospect_status.sql` | — (DDL one-shot) | `demo_prospects.prospect_status` | Une fois par environnement |

---

## `import_sirene_naf4771z.py` — Import SIRENE NAF 47.71Z

Alimente la page `/prospection` (Sprint 17). Source : fichier public **StockEtablissement** INSEE — **~2.6 GB zip, ~12 GB CSV, ~32 M lignes nationales** (vérifié 2026-05-19 — la doc historique mentionnant 600 MB est obsolète, le packaging INSEE a évolué).

Filtres appliqués au streaming (cf [[DATA-014]] §2) :
- `activitePrincipaleEtablissement = '47.71Z'` (commerce détail habillement en magasin spécialisé)
- `etatAdministratifEtablissement = 'A'` (actif)
- `codePaysEtrangerEtablissement` vide (France métropole + DROM uniquement)

Volume attendu après filtres : **25 000 à 40 000 établissements**.

### Prérequis

- Auth GCP active : `gcloud auth application-default login` ou variable `GOOGLE_APPLICATION_CREDENTIALS`
- Variable d'environnement `GCP_PROJECT_ID` définie
- Dépendances : `pip install -r ingestion/requirements.txt`

### Usage

Import complet (téléchargement + filtrage + upload BQ) :

```bash
GCP_PROJECT_ID=demo-xxx BQ_RAW_DATASET=demo_raw \
  python ingestion/import_sirene_naf4771z.py
```

Le script écrit dans `demo_raw.raw_sirene_etab` en mode `WRITE_TRUNCATE` (la table est entièrement remplacée à chaque run).

### Options

| Flag | Effet |
|---|---|
| `--source-url URL` | URL alternative du zip (par défaut : data.gouv stable) |
| `--zip-cache PATH` | Réutilise un zip déjà téléchargé localement (skip download) |
| `--tmp-dir PATH` | Dossier temporaire (défaut : `tempfile.gettempdir()`) |
| `--keep-tmp` | Conserve le CSV filtré local après upload (debug) |
| `--dry-run` | Filtre et écrit le CSV local, sans upload BQ |

### Pipeline complet `/prospection`

Après chaque import, lancer le `dbt run` pour rafraîchir les marts :

```bash
cd dbt
dbt run --select stg_prospects_sirene+ mart_prospects+ mart_prospects_par_departement+ prospect_matches_incertains+
```

### Hors-scope MVP

- **Orchestration mensuelle** : à wrapper dans un Cloud Run Job + Cloud Scheduler (release INSEE le 1er du mois) — ticket backlog.
- **Enrichissement `denominationUniteLegale`** : la colonne est écrite vide (absente de StockEtablissement) — à enrichir via jointure `StockUniteLegale` sur SIREN dans un sprint ultérieur.

---

## `setup_prospect_status.sql` — Setup dataset éditable

DDL one-shot qui crée le dataset `demo_prospects` et la table `prospect_status` (statuts saisis manuellement par l'utilisateur via la page `/prospection`).

**Pourquoi un fichier SQL standalone et pas un modèle dbt ?**
La table doit **persister entre les imports SIRENE** : si elle était matérialisée par dbt, chaque `dbt run` écraserait les statuts saisis utilisateur. Le DDL est donc séparé du pipeline dbt et exécuté une seule fois par environnement.

Exécution :

```bash
bq --project_id=$GCP_PROJECT_ID query --use_legacy_sql=false < ingestion/setup_prospect_status.sql
```

ou via la console BigQuery (UI > Query editor > coller le contenu).

`CREATE SCHEMA IF NOT EXISTS` et `CREATE TABLE IF NOT EXISTS` sont idempotents — réexécuter le script ne casse rien.

---

## Pipeline complet de bootstrap `/prospection`

Ordre d'exécution la première fois :

```bash
# 1. Créer dataset + table prospect_status (one-shot par environnement)
bq --project_id=$GCP_PROJECT_ID query --use_legacy_sql=false < ingestion/setup_prospect_status.sql

# 2. Importer la source SIRENE (peut être ré-exécuté à chaque release INSEE)
GCP_PROJECT_ID=demo-xxx BQ_RAW_DATASET=demo_raw \
  python ingestion/import_sirene_naf4771z.py

# 3. Rafraîchir les marts dbt
cd dbt
dbt run --select stg_prospects_sirene+ mart_prospects+ mart_prospects_par_departement+ prospect_matches_incertains+
```

Les étapes 2 et 3 forment le run mensuel de rafraîchissement. Seule l'étape 1 est unique.
