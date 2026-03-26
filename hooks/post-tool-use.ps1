# PostToolUse hook for Dorothy (Windows)
$INPUT = [Console]::In.ReadToEnd() | ConvertFrom-Json
$TOOL_NAME = $INPUT.tool_name
$SESSION_ID = $INPUT.session_id
$CWD = $INPUT.cwd
$AGENT_ID = if ($env:CLAUDE_AGENT_ID) { $env:CLAUDE_AGENT_ID } else { $SESSION_ID }
$PROJECT_PATH = if ($env:CLAUDE_PROJECT_PATH) { $env:CLAUDE_PROJECT_PATH } else { $CWD }
$API_URL = "http://127.0.0.1:31415"

if (-not $TOOL_NAME) { Write-Output '{"continue":true,"suppressOutput":true}'; exit 0 }

try {
  $body = @{ agent_id = $AGENT_ID; session_id = $SESSION_ID; status = "running" } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "$API_URL/api/hooks/status" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
} catch {}

function Store-Observation($content, $type) {
  try {
    $body = @{ agent_id = $AGENT_ID; project_path = $PROJECT_PATH; content = $content; type = $type } | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Uri "$API_URL/api/memory/remember" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3
  } catch {}
}

switch ($TOOL_NAME) {
  "Write" { if ($INPUT.tool_input.file_path) { Store-Observation "Created/wrote file: $($INPUT.tool_input.file_path)" "file_edit" } }
  "Edit" {
    $fp = $INPUT.tool_input.file_path
    if ($fp) {
      $old = if ($INPUT.tool_input.old_string) { $INPUT.tool_input.old_string.Substring(0, [Math]::Min(100, $INPUT.tool_input.old_string.Length)) } else { "" }
      if ($old) { Store-Observation "Edited $fp`: replaced '$old...'" "file_edit" } else { Store-Observation "Edited file: $fp" "file_edit" }
    }
  }
  "Bash" {
    $cmd = $INPUT.tool_input.command
    if ($cmd) {
      $desc = $INPUT.tool_input.description
      $short = $cmd.Substring(0, [Math]::Min(200, $cmd.Length))
      if ($desc) { Store-Observation "Ran command: $desc ($short)" "command" } else { Store-Observation "Ran command: $short" "command" }
    }
  }
  default {
    if ($TOOL_NAME -match "^mcp__") { Store-Observation "Used MCP tool: $TOOL_NAME" "tool_use" }
  }
}

Write-Output '{"continue":true,"suppressOutput":true}'
exit 0
