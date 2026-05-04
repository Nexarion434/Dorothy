. "$PSScriptRoot\_hooks-common.ps1"

$j = Read-StdinJson
if ($null -eq $j) { Write-PassThrough; exit 0 }

$agentId = Get-AgentId $j.session_id

$lastMsg = $j.last_assistant_message
if ($lastMsg) {
    $trimmed = if ($lastMsg.Length -gt 4000) { $lastMsg.Substring(0, 4000) } else { $lastMsg }
    Invoke-Hook -Endpoint '/api/hooks/output' -Body @{
        agent_id   = $agentId
        session_id = $j.session_id
        output     = $trimmed
    }
}

Invoke-Hook -Endpoint '/api/hooks/task-completed' -Body @{
    agent_id   = $agentId
    session_id = $j.session_id
}

Write-PassThrough
