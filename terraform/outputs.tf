output "frontend_url" {
  description = "URL publique du dashboard"
  value       = google_cloud_run_v2_service.frontend.uri
}

output "api_url" {
  description = "URL interne de l'API FastAPI"
  value       = google_cloud_run_v2_service.api.uri
}

output "registry" {
  description = "Chemin Artifact Registry pour les images Docker"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/hippocampe"
}

output "raw_bucket" {
  description = "Bucket GCS pour les données brutes EBP"
  value       = google_storage_bucket.raw_data.name
}

output "service_account" {
  description = "Email du compte de service"
  value       = google_service_account.hippocampe.email
}
