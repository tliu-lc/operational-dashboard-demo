# ── Compte de service principal ────────────────────────────────────────────

resource "google_service_account" "demo" {
  account_id   = "demo-sa"
  display_name = "Demo Monitor — Service Account"
  project      = var.project_id
}

locals {
  sa = "serviceAccount:${google_service_account.demo.email}"
}

# ── Rôles projet ───────────────────────────────────────────────────────────

resource "google_project_iam_member" "roles" {
  for_each = toset([
    # Déploiement applicatif
    "roles/run.developer",                    # déployer Cloud Run
    "roles/artifactregistry.writer",          # pousser les images Docker
    # Données
    "roles/bigquery.dataEditor",              # lire/écrire les tables BQ
    "roles/bigquery.jobUser",                 # exécuter les requêtes BQ
    "roles/storage.admin",                    # gérer les buckets GCS (requis par Terraform)
    # Logs
    "roles/logging.logWriter",                # écrire les logs Cloud Build
    # Requis par Terraform pour gérer les ressources (state refresh + apply)
    "roles/resourcemanager.projectIamAdmin",  # lire/modifier les IAM du projet
    "roles/secretmanager.admin",              # gérer les secrets (remplace secretAccessor)
    "roles/cloudscheduler.admin",             # gérer les jobs Scheduler
    "roles/cloudbuild.builds.editor",         # gérer les triggers Cloud Build
    "roles/iam.securityAdmin",                # getIamPolicy sur les service accounts
    "roles/iam.serviceAccountAdmin",          # créer/supprimer des service accounts (requis pour demo-ebp-sa)
    "roles/serviceusage.serviceUsageAdmin",   # activer/désactiver les APIs GCP
  ])

  project = var.project_id
  role    = each.key
  member  = local.sa
}

# Le SA peut s'impersonner lui-même (nécessaire pour Cloud Run deploy)
resource "google_service_account_iam_member" "self_impersonate" {
  service_account_id = google_service_account.demo.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.sa
}

# Cloud Build peut utiliser ce SA
resource "google_project_iam_member" "cloudbuild_sa" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
}

# demo-sa (deploy) peut actAs sur chaque SA runtime
# Requis pour assigner ces SAs aux services/jobs Cloud Run via Terraform
resource "google_service_account_iam_member" "deploy_actas_api" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.sa
}

resource "google_service_account_iam_member" "deploy_actas_frontend" {
  service_account_id = google_service_account.frontend.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.sa
}

resource "google_service_account_iam_member" "deploy_actas_ingestion" {
  service_account_id = google_service_account.ingestion.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.sa
}

resource "google_service_account_iam_member" "deploy_actas_dbt" {
  service_account_id = google_service_account.dbt.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.sa
}

data "google_project" "project" {
  project_id = var.project_id
}

# ── Compte de service machine EBP (export CSV → GCS) ───────────────────────

resource "google_service_account" "ebp" {
  account_id   = "demo-ebp-sa"
  display_name = "Demo Monitor — Export EBP vers GCS"
  project      = var.project_id
}

# Permission restreinte au seul bucket raw — aucun accès projet
resource "google_storage_bucket_iam_member" "ebp_raw_writer" {
  bucket = google_storage_bucket.raw_data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.ebp.email}"
}

# ── SA runtime — API FastAPI ───────────────────────────────────────────────

resource "google_service_account" "api" {
  account_id   = "demo-api-sa"
  display_name = "Demo Monitor — Cloud Run API"
  project      = var.project_id
}

resource "google_project_iam_member" "api_roles" {
  for_each = toset([
    "roles/bigquery.dataViewer",
    "roles/bigquery.jobUser",
    "roles/logging.logWriter",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.api.email}"
}

# ── SA runtime — Frontend Next.js ─────────────────────────────────────────

resource "google_service_account" "frontend" {
  account_id   = "demo-frontend-sa"
  display_name = "Demo Monitor — Cloud Run Frontend"
  project      = var.project_id
}

resource "google_project_iam_member" "frontend_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.frontend.email}"
}

# Le frontend peut invoquer le service API (binding ressource-level)
resource "google_cloud_run_v2_service_iam_member" "frontend_api_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.frontend.email}"
}

# Accès secrets auth (binding ressource-level)
resource "google_secret_manager_secret_iam_member" "frontend_auth_secret" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.auth_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.frontend.email}"
}

resource "google_secret_manager_secret_iam_member" "frontend_auth_users" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.auth_users.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.frontend.email}"
}

# ── SA runtime — Job ingestion ─────────────────────────────────────────────

resource "google_service_account" "ingestion" {
  account_id   = "demo-ingestion-sa"
  display_name = "Demo Monitor — Cloud Run Job ingestion"
  project      = var.project_id
}

# Accès bucket raw uniquement (binding bucket-level)
resource "google_storage_bucket_iam_member" "ingestion_raw_writer" {
  bucket = google_storage_bucket.raw_data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.ingestion.email}"
}

resource "google_project_iam_member" "ingestion_roles" {
  for_each = toset([
    "roles/bigquery.dataEditor",
    "roles/bigquery.jobUser",
    "roles/logging.logWriter",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.ingestion.email}"
}

# ── SA runtime — Job dbt ───────────────────────────────────────────────────

resource "google_service_account" "dbt" {
  account_id   = "demo-dbt-sa"
  display_name = "Demo Monitor — Cloud Run Job dbt"
  project      = var.project_id
}

resource "google_project_iam_member" "dbt_roles" {
  for_each = toset([
    "roles/bigquery.dataEditor",
    "roles/bigquery.jobUser",
    "roles/logging.logWriter",
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.dbt.email}"
}

