# ── Cloud Build Trigger — déploiement sur merge dans main ─────────────────
# Trigger 2nd gen : connexion GitHub App configurée manuellement dans la console
# (Cloud Build → Triggers → Manage repositories → Connect)

resource "google_cloudbuild_trigger" "deploy_main" {
  name        = "deploy-on-push-main"
  description = "Déploie la démo sur push dans main"
  project     = var.project_id
  location    = var.region

  repository_event_config {
    repository = "projects/${var.project_id}/locations/${var.region}/connections/${var.github_owner}/repositories/${var.github_owner}-${var.github_repo}"
    push {
      branch = "^main$"
    }
  }

  filename        = "cloudbuild.yaml"
  service_account = google_service_account.demo.id

  substitutions = {
    _REGION   = var.region
    _REGISTRY = "${var.region}-docker.pkg.dev/${var.project_id}/demo"
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.demo,
  ]
}
