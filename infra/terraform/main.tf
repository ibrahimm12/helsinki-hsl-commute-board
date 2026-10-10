data "azurerm_resource_group" "app" {
  name = var.resource_group_name
}

resource "azurerm_log_analytics_workspace" "app" {
  name                = "${var.app_name}-logs"
  location            = var.location
  resource_group_name = data.azurerm_resource_group.app.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "app" {
  name                       = "${var.app_name}-env"
  location                   = var.location
  resource_group_name        = data.azurerm_resource_group.app.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id
}

resource "azurerm_monitor_diagnostic_setting" "container_apps_http" {
  name                           = "${var.app_name}-http-logs"
  target_resource_id             = azurerm_container_app_environment.app.id
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.app.id
  log_analytics_destination_type = "Dedicated"

  enabled_log {
    category = "HTTPLogs"
  }
}

resource "azurerm_container_app" "app" {
  name                         = var.app_name
  resource_group_name          = data.azurerm_resource_group.app.name
  container_app_environment_id = azurerm_container_app_environment.app.id
  revision_mode                = "Single"

  secret {
    name  = "digitransit-subscription-key"
    value = var.digitransit_subscription_key
  }

  template {
    min_replicas = 1
    max_replicas = 2

    container {
      name   = "timetables"
      image  = var.container_image
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "PORT"
        value = "4000"
      }

      env {
        name        = "DIGITRANSIT_SUBSCRIPTION_KEY"
        secret_name = "digitransit-subscription-key"
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 4000
    transport        = "auto"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  tags = {
    application = "eficode-timetables"
    managed-by  = "terraform"
  }

}
