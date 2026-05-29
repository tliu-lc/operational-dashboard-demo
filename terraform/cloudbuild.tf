# ── Cloud Build Trigger — déploiement sur merge dans main ─────────────────
# Prérequis : connecter le dépôt GitHub à Cloud Build via la Console GCP
# (Cloud Build → Triggers → Connect Repository → GitHub)

resource "google_cloudbuild_trigger" "deploy_main" {
  name        = "hippocampe-deploy-main"
  description = "Déploie l'application à chaque merge dans main"
  project     = var.project_id
  location    = var.region

  github {
    owner = var.github_owner
    name  = var.github_repo

    push {
      branch = "^main$"
    }
  }

  filename        = "cloudbuild.yaml"
  service_account = google_service_account.hippocampe.id

  substitutions = {
    _REGION   = var.region
    _REGISTRY = "${var.region}-docker.pkg.dev/${var.project_id}/hippocampe"
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.hippocampe,
  ]
}
