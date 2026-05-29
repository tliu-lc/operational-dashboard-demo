# ── Cloud Scheduler — pipeline de données quotidien ───────────────────────
# Déclenche l'ingestion (5h00) puis dbt (5h30) chaque jour.

resource "google_cloud_scheduler_job" "ingestion" {
  name             = "demo-ingestion-daily"
  description      = "Charge les CSV GCS dans BigQuery RAW (5h00 Paris)"
  schedule         = "0 5 * * *"
  time_zone        = "Europe/Paris"
  region           = var.region
  project          = var.project_id
  attempt_deadline = "320s"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.ingestion.name}:run"

    oauth_token {
      service_account_email = google_service_account.demo.email
    }
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_job.ingestion,
  ]
}

resource "google_cloud_scheduler_job" "dbt" {
  name             = "demo-dbt-daily"
  description      = "Transforme RAW → DWH → DTM via dbt (5h30 Paris)"
  schedule         = "30 5 * * *"
  time_zone        = "Europe/Paris"
  region           = var.region
  project          = var.project_id
  attempt_deadline = "540s"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.dbt.name}:run"

    oauth_token {
      service_account_email = google_service_account.demo.email
    }
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_job.dbt,
  ]
}
