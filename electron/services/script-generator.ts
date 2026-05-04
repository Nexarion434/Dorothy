/**
 * Cross-platform script generator for scheduled tasks.
 *
 * On macOS/Linux: generates a Bash .sh script.
 * On Windows:     generates a CMD .cmd script.
 */

import * as os from 'os';
import * as path from 'path';

const IS_WIN = os.platform() === 'win32';

/** Extension for generated scripts: '.cmd' on Windows, '.sh' elsewhere. */
export const SCRIPT_EXT = IS_WIN ? '.cmd' : '.sh';

export interface ScriptParams {
  binaryPath: string;
  binaryDir: string;
  projectPath: string;
  prompt: string;
  autonomous: boolean;
  mcpConfigPath: string;
  logPath: string;
  homeDir: string;
  taskId: string;
  flags?: string;
}

/**
 * Generate the header and body of a scheduled script.
 * The caller is responsible for writing the file and setting executable bits (Unix).
 */
export function generateScript(params: ScriptParams): string {
  if (IS_WIN) {
    return generateCmdScript(params);
  }
  return generateBashScript(params);
}

function generateBashScript(p: ScriptParams): string {
  const flags = p.flags ?? (p.autonomous ? '--dangerously-skip-permissions' : '');
  return `#!/usr/bin/env bash
set -euo pipefail

export HOME="${p.homeDir}"

if [ -s "${p.homeDir}/.nvm/nvm.sh" ]; then
  source "${p.homeDir}/.nvm/nvm.sh" 2>/dev/null || true
fi
if [ -f "${p.homeDir}/.bashrc" ]; then
  source "${p.homeDir}/.bashrc" 2>/dev/null || true
elif [ -f "${p.homeDir}/.bash_profile" ]; then
  source "${p.homeDir}/.bash_profile" 2>/dev/null || true
elif [ -f "${p.homeDir}/.zshrc" ]; then
  source "${p.homeDir}/.zshrc" 2>/dev/null || true
fi

export PATH="${p.binaryDir}:$PATH"
cd "${p.projectPath}"
echo "=== Task started at $(date) ===" >> "${p.logPath}"
unset CLAUDECODE
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 \\
  "${p.binaryPath}" ${flags} \\
  --output-format stream-json --verbose \\
  --mcp-config "${p.mcpConfigPath}" \\
  --add-dir "${p.homeDir}/.dorothy" \\
  -p '${p.prompt}' >> "${p.logPath}" 2>&1
echo "=== Task completed at $(date) ===" >> "${p.logPath}"
`;
}

function generateCmdScript(p: ScriptParams): string {
  const flags = p.flags ?? (p.autonomous ? '--dangerously-skip-permissions' : '');
  // Quote paths with spaces using double-quotes
  const q = (s: string) => `"${s}"`;
  return `@echo off\r\nsetlocal EnableDelayedExpansion\r\n\r\nset "HOME=${p.homeDir}"\r\nset "PATH=${p.binaryDir};%PATH%"\r\n\r\ncd /d ${q(p.projectPath)}\r\necho === Task started at %DATE% %TIME% === >> ${q(p.logPath)}\r\nset "CLAUDECODE="\r\nset "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1"\r\n${q(p.binaryPath)} ${flags} --output-format stream-json --verbose --mcp-config ${q(p.mcpConfigPath)} --add-dir ${q(path.join(p.homeDir, '.dorothy'))} -p "${p.prompt}" >> ${q(p.logPath)} 2>&1\r\necho === Task completed at %DATE% %TIME% === >> ${q(p.logPath)}\r\n`;
}
