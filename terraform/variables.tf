variable "project_id" {
  type        = string
  description = "ID du projet GCP"
}

variable "region" {
  type        = string
  default     = "europe-west1"
  description = "Région GCP principale"
}

variable "github_owner" {
  type        = string
  description = "Propriétaire du dépôt GitHub (username ou organisation)"
}

variable "github_repo" {
  type        = string
  default     = "hippocampe-monitor"
  description = "Nom du dépôt GitHub"
}

