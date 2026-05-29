# ── BigQuery — Datasets uniquement ────────────────────────────────────────
# Les TABLES sont gérées par dbt. Terraform gère uniquement les datasets
# (conteneurs) et leurs paramètres d'accès.

resource "google_bigquery_dataset" "raw" {
  dataset_id    = "demo_raw"
  friendly_name = "Demo — RAW (données brutes CSV)"
  description   = "Données EBP brutes chargées depuis GCS. Géré par le job d'ingestion."
  location      = var.region
  project       = var.project_id

  delete_contents_on_destroy = false

  access {
    role          = "OWNER"
    user_by_email = google_service_account.demo.email
  }
  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }
  access {
    role          = "WRITER"
    special_group = "projectWriters"
  }
  access {
    role          = "READER"
    special_group = "projectReaders"
  }

  depends_on = [google_project_service.apis]
}

resource "google_bigquery_dataset" "dwh" {
  dataset_id    = "demo_dwh"
  friendly_name = "Demo — DWH (entrepôt unifié)"
  description   = "Tables stg_* nettoyées et unifiées 4 boutiques. Géré par dbt."
  location      = var.region
  project       = var.project_id

  delete_contents_on_destroy = false

  access {
    role          = "OWNER"
    user_by_email = google_service_account.demo.email
  }
  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }
  access {
    role          = "WRITER"
    special_group = "projectWriters"
  }
  access {
    role          = "READER"
    special_group = "projectReaders"
  }

  depends_on = [google_project_service.apis]
}

resource "google_bigquery_dataset" "dtm" {
  dataset_id    = "demo_dtm"
  friendly_name = "Demo — DTM (data marts)"
  description   = "Tables mart_* agrégées, prêtes pour l'API. Géré par dbt."
  location      = var.region
  project       = var.project_id

  delete_contents_on_destroy = false

  access {
    role          = "OWNER"
    user_by_email = google_service_account.demo.email
  }
  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }
  access {
    role          = "WRITER"
    special_group = "projectWriters"
  }
  access {
    role          = "READER"
    special_group = "projectReaders"
  }

  depends_on = [google_project_service.apis]
}
