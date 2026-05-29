# Operational Dashboard Demo — Description CV

## Titre du poste

**Développeur Full-Stack & Data Engineer — Conception d'une plateforme de monitoring décisionnel (GCP)**

*Variantes selon le poste visé : « Ingénieur Data / Full-Stack Cloud », « Développeur Full-Stack orienté Data », « Data Engineer & Développeur Cloud ».*

---

## Description de l'architecture

> Conception et développement **de bout en bout** d'un **tableau de bord de monitoring opérationnel** pour un grossiste textile **multi-boutiques** (4 enseignes), de l'ingestion des données jusqu'à la visualisation décisionnelle.

Architecture **cloud-native** sur **Google Cloud Platform (GCP)**, structurée en **pipeline analytique** complet :

### Frontend

Application **Next.js 15** / **React** / **TypeScript** (**Tailwind CSS**) — 14 modules métier : **segmentation client RFM**, **prédiction de churn**, **cartographie géographique des ventes** (**Plotly** / choropleth), **suivi de stock**, **performance saisonnière**, **suivi des paiements** et **prospection commerciale**.

### Backend

API **FastAPI** (**Python**) exposant les **KPIs métier**, avec **cache TTL** et **authentification JWT** / **service account**.

### Pipeline de données (ELT)

**Ingestion quotidienne** de fichiers **CSV** depuis **Cloud Storage** vers **BigQuery**, puis **transformation** en couches modélisées via **dbt** (**raw → staging → data marts**). **Enrichissement** par croisement avec la base **SIRENE / INSEE** (2,6 Go) pour la **prospection ciblée** par **code NAF** et géographie.

### Infrastructure as Code

Provisionnement complet via **Terraform** : **Cloud Run** (services + jobs), **Cloud Scheduler** (**orchestration cron**), **Secret Manager**, **datasets BigQuery**, **IAM**.

### CI/CD

**Google Cloud Build** déclenché sur push : **build Docker** parallélisé (API, frontend, ingestion, dbt) et **déploiement automatisé** sur **Cloud Run**.

### Flux de données

`EBP CSV / SIRENE → GCS → BigQuery (raw) → dbt (dwh/dtm) → FastAPI → Next.js`

---

## 5 compétences pertinentes (≤ 10 caractères)

1. **BigQuery**
2. **dbt**
3. **Next.js**
4. **FastAPI**
5. **Terraform**
