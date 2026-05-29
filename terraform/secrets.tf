# ── Secret Manager — credentials auth dashboard ────────────────────────────

resource "google_secret_manager_secret" "auth_secret" {
  secret_id = "hippocampe-auth-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "auth_users" {
  secret_id = "hippocampe-auth-users"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

