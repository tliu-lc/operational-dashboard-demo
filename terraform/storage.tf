# ── Bucket données brutes (CSV EBP déposés par le script d'ingestion) ──────

resource "google_storage_bucket" "raw_data" {
  name          = "demo-raw-${var.project_id}"
  location      = var.region
  project       = var.project_id
  force_destroy = false

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition { age = 90 }
    action    { type = "Delete" }
  }

  versioning {
    enabled = false
  }
}

# ── Bucket état Terraform ──────────────────────────────────────────────────
# Ce bucket doit exister AVANT le premier `terraform init`.
# Créer manuellement : gsutil mb -l europe-west1 gs://demo-tfstate
# On l'importe ensuite : terraform import google_storage_bucket.tfstate demo-tfstate

resource "google_storage_bucket" "tfstate" {
  name          = "demo-tfstate"
  location      = var.region
  project       = var.project_id
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true # Garder l'historique des états TF
  }
}
