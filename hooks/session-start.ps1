# Session start hook for Dorothy (Windows)
$INPUT = [Console]::In.ReadToEnd() | ConvertFrom-Json
$SESSION_ID = $INPUT.session_id
$CWD = $INPUT.cwd
$SOURCE = if ($INPUT.source) { $INPUT.source } else { "startup" }
$AGENT_ID = if ($env:CLAUDE_AGENT_ID) { $env:CLAUDE_AGENT_ID } else { $SESSION_ID }
$PROJECT_PATH = if ($env:CLAUDE_PROJECT_PATH) { $env:CLAUDE_PROJECT_PATH } else { $CWD }
$API_URL = "http://127.0.0.1:31415"

try { $null = Invoke-RestMethod -Uri "$API_URL/api/health" -TimeoutSec 1 -ErrorAction Stop } catch { Write-Output '{"continue":true,"suppressOutput":true}'; exit 0 }

try {
  $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID; status = "idle"; source = $SOURCE } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/status" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
} catch {}

try {
  $ctx = Invoke-RestMethod -Uri "$API_URL/api/memory/context?agent_id=$AGENT_ID&project_path=$PROJECT_PATH" -TimeoutSec 2
  if ($ctx -and $ctx.context -and $ctx.context -ne "No previous context found for this agent/project.") {
    $out = @{ continue = $true; suppressOutput = $false; hookSpecificOutput = @{ hookEventName = "SessionStart"; additionalContext = $ctx.context } } | ConvertTo-Json -Compress
    Write-Output $out
    exit 0
  }
} catch {}

Write-Output '{"continue":true,"suppressOutput":true}'
exit 0
