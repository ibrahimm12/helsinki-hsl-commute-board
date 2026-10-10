output "app_url" {
  description = "Public HTTPS URL of the deployed timetable app."
  value       = "https://${azurerm_container_app.app.latest_revision_fqdn}"
}

output "container_app_name" {
  value = azurerm_container_app.app.name
}

output "log_analytics_workspace_id" {
  description = "Resource ID of the workspace used by Container Apps logs and the operations workbook."
  value       = azurerm_log_analytics_workspace.app.id
}

output "observability_workbook_id" {
  description = "Resource ID of the Azure Monitor operations workbook."
  value       = azurerm_application_insights_workbook.app.id
}
