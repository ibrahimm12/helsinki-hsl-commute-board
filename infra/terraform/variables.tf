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

variable "acr_name" {
  description = "Globally unique lowercase Azure Container Registry name (5-50 alphanumeric characters)."
  type        = string

  validation {
    condition     = length(var.acr_name) >= 5 && length(var.acr_name) <= 50 && can(regex("^[a-z0-9]+$", var.acr_name))
    error_message = "acr_name must be 5-50 lowercase alphanumeric characters."
  }
}

variable "container_image" {
  description = "Full image reference to deploy. The workflow overrides this with an ACR image tagged by commit SHA."
  type        = string
  default     = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
}

variable "deployment_principal_object_id" {
  description = "Object ID of the GitHub Actions service principal; granted AcrPush on this deployment's registry."
  type        = string
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
