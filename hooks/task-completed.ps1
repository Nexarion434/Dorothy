# TaskCompleted hook for Dorothy (Windows)
$INPUT = [Console]::In.ReadToEnd() | ConvertFrom-Json
$SESSION_ID = $INPUT.session_id
$AGENT_ID = if ($env:CLAUDE_AGENT_ID) { $env:CLAUDE_AGENT_ID } else { $SESSION_ID }
$API_URL = "http://127.0.0.1:31415"

try { $null = Invoke-RestMethod -Uri "$API_URL/api/health" -TimeoutSec 1 -ErrorAction Stop } catch { Write-Output '{"continue":true,"suppressOutput":true}'; exit 0 }

try {
  $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/task-completed" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
} catch {}

Write-Output '{"continue":true,"suppressOutput":true}'
exit 0
