locals {
  registry = "${var.region}-docker.pkg.dev/${var.project_id}/demo"
  # Image placeholder — remplacée à chaque déploiement Cloud Build
  placeholder_image = "gcr.io/cloudrun/placeholder"
}

# ── Service FastAPI (public réseau, protégé par IAM — identity token requis) ──────

resource "google_cloud_run_v2_service" "api" {
  name     = "demo-api"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = local.placeholder_image

      resources {
        limits = {
          memory = "1Gi"
          cpu    = "1"
        }
        startup_cpu_boost = true
      }

      # Variables d'environnement
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "BQ_RAW_DATASET"
        value = "demo_raw"
      }
      env {
        name  = "BQ_DWH_DATASET"
        value = "demo_dwh"
      }
      env {
        name  = "BQ_DTM_DATASET"
        value = "demo_dtm"
      }

      ports {
        container_port = 8000
      }
    }
  }

  depends_on = [
    google_artifact_registry_repository.demo,
  ]

  lifecycle {
    # Cloud Build gère l'image — Terraform ne doit pas l'écraser
    ignore_changes = [
      template[0].containers[0].image,
      template[0].revision,
      client,
      client_version,
    ]
  }
}

# ── Service Next.js (public) ───────────────────────────────────────────────

resource "google_cloud_run_v2_service" "frontend" {
  name     = "demo-frontend"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.frontend.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    containers {
      image = local.placeholder_image

      resources {
        limits = {
          memory = "512Mi"
          cpu    = "1"
        }
        startup_cpu_boost = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = ""  # Vide → rewrites Next.js vers API_URL interne
      }
      env {
        name  = "API_URL"
        value = google_cloud_run_v2_service.api.uri
      }

      # Secrets auth
      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.auth_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "AUTH_USERS"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.auth_users.secret_id
            version = "latest"
          }
        }
      }

      ports {
        container_port = 3000
      }
    }
  }

  depends_on = [
    google_cloud_run_v2_service.api,
    google_secret_manager_secret.auth_secret,
    google_secret_manager_secret.auth_users,
    google_service_account.frontend,
    google_secret_manager_secret_iam_member.frontend_auth_secret,
    google_secret_manager_secret_iam_member.frontend_auth_users,
  ]

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].containers[0].env,  # API_URL mis à jour par Cloud Build
      template[0].revision,
      client,
      client_version,
    ]
  }
}

# Accès public au frontend (unauthenticated)
resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Le binding run.invoker frontend → API est défini dans iam.tf (frontend_api_invoker)

# ── Cloud Run Jobs (post-migration BQ) ────────────────────────────────────

resource "google_cloud_run_v2_job" "ingestion" {
  name     = "demo-ingestion"
  location = var.region
  project  = var.project_id

  template {
    template {
      service_account = google_service_account.ingestion.email

      containers {
        image = "${local.registry}/ingestion:latest"

        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }
        env {
          name  = "GCS_BUCKET"
          value = google_storage_bucket.raw_data.name
        }
        env {
          name  = "BQ_RAW_DATASET"
          value = "demo_raw"
        }

        resources {
          limits = {
            memory = "512Mi"
            cpu    = "1"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_artifact_registry_repository.demo]
}

resource "google_cloud_run_v2_job" "dbt" {
  name     = "demo-dbt"
  location = var.region
  project  = var.project_id

  template {
    template {
      service_account = google_service_account.dbt.email

      containers {
        image = "${local.registry}/dbt:latest"

        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }

        resources {
          limits = {
            memory = "1Gi"
            cpu    = "2"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_artifact_registry_repository.demo]
}
