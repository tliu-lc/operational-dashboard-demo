# ── Bucket données brutes (CSV EBP déposés par le script d'ingestion) ──────

resource "google_storage_bucket" "raw_data" {
  name          = "${var.project_id}-raw"
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
# Créer manuellement : gsutil mb -l europe-west1 gs://delor-demo-tfstate
# On l'importe ensuite : terraform import google_storage_bucket.tfstate delor-demo-tfstate

resource "google_storage_bucket" "tfstate" {
  name          = "delor-demo-tfstate"
  location      = var.region
  project       = var.project_id
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true # Garder l'historique des états TF
  }
}
