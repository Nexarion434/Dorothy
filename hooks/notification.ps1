# Notification hook for Dorothy (Windows)
$INPUT = [Console]::In.ReadToEnd() | ConvertFrom-Json
$SESSION_ID = $INPUT.session_id
$AGENT_ID = if ($env:CLAUDE_AGENT_ID) { $env:CLAUDE_AGENT_ID } else { $SESSION_ID }
$NOTIFICATION_TYPE = $INPUT.notification_type
$API_URL = "http://127.0.0.1:31415"

if (-not $NOTIFICATION_TYPE) { Write-Output '{"continue":true,"suppressOutput":true}'; exit 0 }

try { $null = Invoke-RestMethod -Uri "$API_URL/api/health" -TimeoutSec 1 -ErrorAction Stop } catch { Write-Output '{"continue":true,"suppressOutput":true}'; exit 0 }

try {
  $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID; type = $NOTIFICATION_TYPE; title = $INPUT.title; message = $INPUT.message } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/notification" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
} catch {}

if ($NOTIFICATION_TYPE -eq "idle_prompt") {
  try {
    $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID; status = "waiting"; waiting_reason = "idle" } | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/status" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
  } catch {}
}

Write-Output '{"continue":true,"suppressOutput":true}'
exit 0
