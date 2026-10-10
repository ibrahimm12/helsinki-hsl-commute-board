output "app_url" {
  description = "Public HTTPS URL of the deployed timetable app."
  value       = "https://${azurerm_container_app.app.latest_revision_fqdn}"
}

output "container_app_name" {
  value = azurerm_container_app.app.name
}

output "acr_name" {
  value = azurerm_container_registry.app.name
}

output "acr_login_server" {
  value = azurerm_container_registry.app.login_server
}
