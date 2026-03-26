# UserPromptSubmit hook for Dorothy (Windows)
$INPUT = [Console]::In.ReadToEnd() | ConvertFrom-Json
$SESSION_ID = $INPUT.session_id
$PROMPT = $INPUT.prompt
$AGENT_ID = if ($env:CLAUDE_AGENT_ID) { $env:CLAUDE_AGENT_ID } else { $SESSION_ID }
$API_URL = "http://127.0.0.1:31415"

try { $null = Invoke-RestMethod -Uri "$API_URL/api/health" -TimeoutSec 1 -ErrorAction Stop } catch { Write-Output '{"continue":true,"suppressOutput":true}'; exit 0 }

try {
  $task = if ($PROMPT) { $PROMPT.Substring(0, [Math]::Min(200, $PROMPT.Length)) } else { "" }
  $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID; status = "running"; current_task = $task } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/status" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
} catch {}

Write-Output '{"continue":true,"suppressOutput":true}'
exit 0
