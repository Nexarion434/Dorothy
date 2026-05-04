. "$PSScriptRoot\_hooks-common.ps1"

$j = Read-StdinJson
if ($null -eq $j) { Write-PassThrough; exit 0 }
if (-not (Test-ApiAlive)) { Write-PassThrough; exit 0 }

$agentId = Get-AgentId $j.session_id

# Try to extract last assistant text from transcript (best-effort)
$transcriptPath = $j.transcript_path
if ($transcriptPath -and (Test-Path $transcriptPath)) {
    try {
        $lines = Get-Content $transcriptPath -ErrorAction Stop | Select-Object -Last 50
        $texts = foreach ($line in $lines) {
            try {
                $entry = $line | ConvertFrom-Json -ErrorAction Stop
                if ($entry.message.content) {
                    foreach ($c in $entry.message.content) {
                        if ($c.type -eq 'text' -and $c.text) { $c.text }
                    }
                }
            } catch { }
        }
        $combined = ($texts -join "`n").Trim()
        if ($combined) {
            $trimmed = if ($combined.Length -gt 4000) { $combined.Substring(0, 4000) } else { $combined }
            Invoke-Hook -Endpoint '/api/hooks/output' -Body @{
                agent_id   = $agentId
                session_id = $j.session_id
                output     = $trimmed
            }
        }
    } catch { }
}

Invoke-Hook -Endpoint '/api/hooks/status' -Body @{
    agent_id   = $agentId
    session_id = $j.session_id
    status     = 'idle'
    reason     = $j.reason
}

Write-PassThrough
