. "$PSScriptRoot\_hooks-common.ps1"

$j = Read-StdinJson
if ($null -eq $j) { Write-PassThrough; exit 0 }
if (-not (Test-ApiAlive)) { Write-PassThrough; exit 0 }

$agentId     = Get-AgentId $j.session_id
$projectPath = Get-ProjectPath $j.cwd
$source      = if ($j.source) { $j.source } else { 'startup' }

Invoke-Hook -Endpoint '/api/hooks/status' -Body @{
    agent_id     = $agentId
    session_id   = $j.session_id
    status       = 'running'
    source       = $source
    project_path = $projectPath
}

# Optional: fetch memory context (non-blocking)
try {
    $u = "$script:ApiUrl/api/memory/context?agent_id=$([uri]::EscapeDataString($agentId))&project_path=$([uri]::EscapeDataString($projectPath))"
    $ctx = Invoke-RestMethod -Method Get -Uri $u -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($ctx -and $ctx.context) {
        # Echo the memory context so Claude Code picks it up
        Write-Output (@{ continue = $true; suppressOutput = $false; additionalContext = $ctx.context } | ConvertTo-Json -Compress)
        exit 0
    }
} catch { }

Write-PassThrough
