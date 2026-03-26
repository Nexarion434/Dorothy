# Stop hook for Dorothy (Windows)
$INPUT = [Console]::In.ReadToEnd() | ConvertFrom-Json
$SESSION_ID = $INPUT.session_id
$STOP_HOOK_ACTIVE = $INPUT.stop_hook_active
$AGENT_ID = if ($env:CLAUDE_AGENT_ID) { $env:CLAUDE_AGENT_ID } else { $SESSION_ID }
$API_URL = "http://127.0.0.1:31415"

if ($STOP_HOOK_ACTIVE -eq "true") { Write-Output '{"continue":true,"suppressOutput":true}'; exit 0 }

try { $null = Invoke-RestMethod -Uri "$API_URL/api/health" -TimeoutSec 1 -ErrorAction Stop } catch { Write-Output '{"continue":true,"suppressOutput":true}'; exit 0 }

try {
  $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID; status = "idle" } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/status" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
} catch {}

try {
  $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/agent-stopped" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
} catch {}

$TRANSCRIPT_PATH = $INPUT.transcript_path
if ($TRANSCRIPT_PATH -and (Test-Path $TRANSCRIPT_PATH)) {
  try {
    $lines = Get-Content $TRANSCRIPT_PATH -Tail 100 | Where-Object { $_ -match '"type":"assistant"' }
    if ($lines) {
      $last = ($lines | Select-Object -Last 1 | ConvertFrom-Json).message.content | Where-Object { $_.type -eq "text" } | Select-Object -Last 1
      if ($last.text) {
        $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID; output = ($last.text | Select-Object -First 4000) } | ConvertTo-Json -Compress
        $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/output" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
      }
    }
  } catch {}
}

Write-Output '{"continue":true,"suppressOutput":true}'
exit 0
