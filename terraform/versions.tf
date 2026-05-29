terraform {
  required_version = ">= 1.7"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # État Terraform stocké dans GCS.
  # Créer le bucket manuellement avant le premier `terraform init` :
  #   gsutil mb -l europe-west1 gs://hippocampe-tfstate
  backend "gcs" {
    bucket = "hippocampe-tfstate"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
