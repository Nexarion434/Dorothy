. "$PSScriptRoot\_hooks-common.ps1"

$j = Read-StdinJson
if ($null -eq $j) { Write-PassThrough; exit 0 }
if (-not (Test-ApiAlive)) { Write-PassThrough; exit 0 }

$agentId = Get-AgentId $j.session_id

Invoke-Hook -Endpoint '/api/hooks/status' -Body @{
    agent_id   = $agentId
    session_id = $j.session_id
    status     = 'running'
    prompt     = $j.prompt
}

Write-PassThrough
