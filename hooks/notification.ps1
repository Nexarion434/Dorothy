. "$PSScriptRoot\_hooks-common.ps1"

$j = Read-StdinJson
if ($null -eq $j) { Write-PassThrough; exit 0 }
if (-not (Test-ApiAlive)) { Write-PassThrough; exit 0 }

$agentId = Get-AgentId $j.session_id

Invoke-Hook -Endpoint '/api/hooks/notification' -Body @{
    agent_id          = $agentId
    session_id        = $j.session_id
    title             = $j.title
    message           = $j.message
    notification_type = $j.notification_type
    cwd               = $j.cwd
}

Write-PassThrough
