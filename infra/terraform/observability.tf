resource "azurerm_application_insights_workbook" "app" {
  name                = uuidv5("url", "${lower(data.azurerm_resource_group.app.id)}/${var.app_name}/operations")
  resource_group_name = data.azurerm_resource_group.app.name
  location            = var.location
  display_name        = "${var.app_name} - Operations"
  description         = "Request health, latency, platform logs, and Digitransit dependency telemetry for the HSL timetable app."
  category            = "workbook"
  source_id           = lower(azurerm_log_analytics_workspace.app.id)

  data_json = jsonencode({
    version = "Notebook/1.0"
    items = [
      {
        type = 1
        name = "operations-overview"
        content = {
          json = "## ${var.app_name} operations\n\nAzure Container Apps ingress, application, and HSL Digitransit dependency signals. HTTP logs can take several minutes to appear after first deployment."
        }
      },
      {
        type = 3
        name = "request-volume-and-latency"
        content = {
          version       = "KqlItem/1.0"
          query         = <<-KQL
            ContainerAppHTTPLogs
            | where TimeGenerated > ago(24h)
            | where ContainerAppName == '${var.app_name}'
            | summarize Requests=count(), ServerErrors=countif(StatusCode >= 500), P95LatencyMs=percentile(RequestDuration, 95) by bin(TimeGenerated, 5m)
            | order by TimeGenerated asc
            | render timechart
          KQL
          size          = 0
          queryType     = 0
          resourceType  = "microsoft.operationalinsights/workspaces"
          visualization = "timechart"
        }
      },
      {
        type = 3
        name = "recent-http-errors"
        content = {
          version       = "KqlItem/1.0"
          query         = <<-KQL
            ContainerAppHTTPLogs
            | where TimeGenerated > ago(24h)
            | where ContainerAppName == '${var.app_name}' and StatusCode >= 400
            | project TimeGenerated, Method, Path, StatusCode, ResponseCodeDetails, RequestDuration, RequestId, RevisionName
            | order by TimeGenerated desc
            | take 100
          KQL
          size          = 0
          queryType     = 0
          resourceType  = "microsoft.operationalinsights/workspaces"
          visualization = "table"
        }
      },
      {
        type = 3
        name = "digitransit-dependency-health"
        content = {
          version       = "KqlItem/1.0"
          query         = <<-KQL
            ContainerAppConsoleLogs_CL
            | where TimeGenerated > ago(24h) and ContainerAppName_s == '${var.app_name}'
            | extend Entry=parse_json(Log_s)
            | where tostring(Entry.event) startswith 'digitransit.request.'
            | project TimeGenerated, Event=tostring(Entry.event), Operation=tostring(Entry.operation), StatusCode=toint(Entry.statusCode), DurationMs=toint(Entry.durationMs), FailureType=tostring(Entry.failureType), RequestId=tostring(Entry.requestId)
            | order by TimeGenerated desc
            | take 200
          KQL
          size          = 0
          queryType     = 0
          resourceType  = "microsoft.operationalinsights/workspaces"
          visualization = "table"
        }
      },
      {
        type = 3
        name = "container-platform-errors"
        content = {
          version       = "KqlItem/1.0"
          query         = <<-KQL
            ContainerAppSystemLogs_CL
            | where TimeGenerated > ago(24h) and ContainerAppName_s == '${var.app_name}'
            | where Log_s has_any ('Error', 'error', 'Failed', 'failed', 'Crash', 'crash')
            | project TimeGenerated, Revision=RevisionName_s, Message=Log_s
            | order by TimeGenerated desc
            | take 100
          KQL
          size          = 0
          queryType     = 0
          resourceType  = "microsoft.operationalinsights/workspaces"
          visualization = "table"
        }
      }
    ]
    isLocked            = false
    fallbackResourceIds = [lower(azurerm_log_analytics_workspace.app.id)]
  })

  tags = {
    application = "eficode-timetables"
    managed-by  = "terraform"
  }
}

resource "azurerm_monitor_action_group" "email" {
  count               = var.alert_email == "" ? 0 : 1
  name                = "${var.app_name}-alerts"
  resource_group_name = data.azurerm_resource_group.app.name
  short_name          = "Timetable"

  email_receiver {
    name                    = "operations-email"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "http_5xx" {
  name                = "${var.app_name}-http-5xx"
  resource_group_name = data.azurerm_resource_group.app.name
  location            = var.location
  display_name        = "${var.app_name}: repeated application or HSL API failures"
  description         = "Fires when five or more HTTP 5xx responses or Digitransit request failures occur in five minutes."
  severity            = 2
  enabled             = true

  evaluation_frequency    = "PT5M"
  window_duration         = "PT5M"
  scopes                  = [azurerm_log_analytics_workspace.app.id]
  auto_mitigation_enabled = true
  skip_query_validation   = true

  criteria {
    query                   = <<-KQL
      let HttpFailures = ContainerAppHTTPLogs
        | where TimeGenerated > ago(5m)
        | where ContainerAppName == '${var.app_name}' and StatusCode >= 500
        | project TimeGenerated;
      let DependencyFailures = ContainerAppConsoleLogs_CL
        | where TimeGenerated > ago(5m) and ContainerAppName_s == '${var.app_name}'
        | extend Entry=parse_json(Log_s)
        | where tostring(Entry.event) == 'digitransit.request.failed'
        | project TimeGenerated;
      union HttpFailures, DependencyFailures
      | summarize FailureCount=count()
      | where FailureCount >= 5
    KQL
    time_aggregation_method = "Count"
    threshold               = 0
    operator                = "GreaterThan"
  }

  dynamic "action" {
    for_each = var.alert_email == "" ? [] : [1]
    content {
      action_groups = [azurerm_monitor_action_group.email[0].id]
    }
  }

  depends_on = [
    azurerm_monitor_diagnostic_setting.container_apps_http,
  ]
}
