# Shared helpers for Dorothy Claude Code hooks on Windows.
# Dot-sourced by each hook .ps1 file.

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$script:ApiUrl = 'http://127.0.0.1:31415'

function Read-StdinJson {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    try { return $raw | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
}

function Test-ApiAlive {
    try {
        $r = Invoke-WebRequest -Uri "$script:ApiUrl/api/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch { return $false }
}

function Invoke-Hook {
    param(
        [Parameter(Mandatory)] [string] $Endpoint,
        [Parameter(Mandatory)] $Body
    )
    $json = $Body | ConvertTo-Json -Compress -Depth 8
    try {
        Invoke-RestMethod -Method Post -Uri "$script:ApiUrl$Endpoint" `
            -Body $json -ContentType 'application/json' -TimeoutSec 3 -UseBasicParsing | Out-Null
    } catch {
        # Silent — hooks must never block Claude Code
    }
}

function Get-AgentId {
    param($SessionId)
    if ($env:CLAUDE_AGENT_ID) { return $env:CLAUDE_AGENT_ID }
    return $SessionId
}

function Get-ProjectPath {
    param($Cwd)
    if ($env:CLAUDE_PROJECT_PATH) { return $env:CLAUDE_PROJECT_PATH }
    return $Cwd
}

function Write-PassThrough {
    Write-Output '{"continue":true,"suppressOutput":true}'
}
