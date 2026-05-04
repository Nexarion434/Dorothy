# Post-tool-use hook for dorothy memory system (Windows).
# Captures file edits, writes, and commands.

. "$PSScriptRoot\_hooks-common.ps1"

$j = Read-StdinJson
if ($null -eq $j) { Write-PassThrough; exit 0 }

$toolName  = $j.tool_name
$sessionId = $j.session_id
$cwd       = $j.cwd
if (-not $toolName) { Write-PassThrough; exit 0 }

$agentId     = Get-AgentId $sessionId
$projectPath = Get-ProjectPath $cwd

# Update agent status to "running"
Invoke-Hook -Endpoint '/api/hooks/status' -Body @{
    agent_id   = $agentId
    session_id = $sessionId
    status     = 'running'
}

# Memory: capture file edits + bash commands
$memoryUrl = '/api/memory/remember'

if ($toolName -in @('Edit', 'Write', 'MultiEdit', 'NotebookEdit')) {
    $filePath = $j.tool_input.file_path
    if ($filePath) {
        Invoke-Hook -Endpoint $memoryUrl -Body @{
            agent_id     = $agentId
            project_path = $projectPath
            kind         = 'file_edit'
            content      = "Edited: $filePath"
            tool         = $toolName
        }
    }
} elseif ($toolName -eq 'Bash') {
    $cmd = $j.tool_input.command
    if ($cmd) {
        Invoke-Hook -Endpoint $memoryUrl -Body @{
            agent_id     = $agentId
            project_path = $projectPath
            kind         = 'bash_command'
            content      = $cmd
            tool         = 'Bash'
        }
    }
} elseif ($toolName -eq 'Read') {
    $filePath = $j.tool_input.file_path
    if ($filePath) {
        Invoke-Hook -Endpoint $memoryUrl -Body @{
            agent_id     = $agentId
            project_path = $projectPath
            kind         = 'file_read'
            content      = "Read: $filePath"
            tool         = 'Read'
        }
    }
}

Write-PassThrough
