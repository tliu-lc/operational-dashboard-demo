# ── Artifact Registry — dépôt Docker ──────────────────────────────────────

resource "google_artifact_registry_repository" "demo" {
  provider      = google
  location      = var.region
  repository_id = "demo"
  description   = "Images Docker DEMO-MONITOR"
  format        = "DOCKER"
  project       = var.project_id

  cleanup_policies {
    id     = "keep-last-5"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  depends_on = [google_project_service.apis]
}
