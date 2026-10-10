variable "resource_group_name" {
  description = "Existing resource group where Terraform will create the timetable resources."
  type        = string
}

variable "location" {
  description = "Azure region for the Container Apps environment."
  type        = string
  default     = "swedencentral"
}

variable "app_name" {
  description = "Globally unique Azure Container App name."
  type        = string
  default     = "eficode-timetables"

  validation {
    condition     = length(var.app_name) >= 2 && length(var.app_name) <= 32 && can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", var.app_name))
    error_message = "app_name must be 2-32 characters, lowercase letters, digits, or hyphens, and start/end with a letter or digit."
  }
}

variable "container_image" {
  description = "Full reference to the public GHCR image built by GitHub Actions."
  type        = string
  default     = "ghcr.io/ibrahimm12/helsinki-hsl-commute-board:latest"
}

variable "digitransit_subscription_key" {
  description = "Digitransit Routing v2 HSL GTFS subscription key. Sensitive; Terraform state contains this value."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.digitransit_subscription_key)) > 0
    error_message = "Set the Digitransit key as the DIGITRANSIT_SUBSCRIPTION_KEY GitHub environment secret."
  }
}

variable "alert_email" {
  description = "Optional email recipient for the HTTP 5xx alert. Leave empty to create the alert without notifications."
  type        = string
  default     = ""

  validation {
    condition     = var.alert_email == "" || can(regex("^[^ @]+@[^ @]+\\.[^ @]+$", var.alert_email))
    error_message = "alert_email must be empty or a valid email address."
  }
}
