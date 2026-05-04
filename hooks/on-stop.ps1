. "$PSScriptRoot\_hooks-common.ps1"

$j = Read-StdinJson
if ($null -eq $j) { Write-PassThrough; exit 0 }
if ($j.stop_hook_active -eq $true) { Write-PassThrough; exit 0 }

$agentId = Get-AgentId $j.session_id

# Forward last assistant message to /api/hooks/output (for super-agent telegram capture)
$lastMsg = $j.last_assistant_message
if ($lastMsg) {
    $trimmed = if ($lastMsg.Length -gt 4000) { $lastMsg.Substring(0, 4000) } else { $lastMsg }
    Invoke-Hook -Endpoint '/api/hooks/output' -Body @{
        agent_id   = $agentId
        session_id = $j.session_id
        output     = $trimmed
    }
}

Invoke-Hook -Endpoint '/api/hooks/status' -Body @{
    agent_id   = $agentId
    session_id = $j.session_id
    status     = 'idle'
}

Invoke-Hook -Endpoint '/api/hooks/agent-stopped' -Body @{
    agent_id   = $agentId
    session_id = $j.session_id
}

Write-PassThrough
