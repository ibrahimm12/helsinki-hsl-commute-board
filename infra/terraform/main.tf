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

resource "azurerm_container_registry" "app" {
  name                = var.acr_name
  resource_group_name = data.azurerm_resource_group.app.name
  location            = var.location
  sku                 = "Basic"
  admin_enabled       = false
}

resource "azurerm_role_assignment" "github_acr_push" {
  scope                = azurerm_container_registry.app.id
  role_definition_name = "AcrPush"
  principal_id         = var.deployment_principal_object_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_container_app" "app" {
  name                         = var.app_name
  resource_group_name          = data.azurerm_resource_group.app.name
  container_app_environment_id = azurerm_container_app_environment.app.id
  revision_mode                = "Single"

  identity {
    type = "SystemAssigned"
  }

  registry {
    server   = azurerm_container_registry.app.login_server
    identity = "system"
  }

  secret {
    name  = "digitransit-subscription-key"
    value = var.digitransit_subscription_key
  }

  template {
    min_replicas = 0
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

  depends_on = [
    azurerm_role_assignment.github_acr_push,
  ]
}

resource "azurerm_role_assignment" "app_acr_pull" {
  scope                = azurerm_container_registry.app.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_container_app.app.identity[0].principal_id
  principal_type       = "ServicePrincipal"
}
