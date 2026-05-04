/**
 * Cross-platform script generator for scheduled tasks.
 *
 * On macOS/Linux: generates a Bash .sh script.
 * On Windows:     generates a CMD .cmd script.
 *
 * Each provider can supply its own CLI invocation via bashCommand/cmdCommand.
 * If omitted the Claude-specific defaults are used.
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
  /** Full bash CLI invocation line (excluding log redirect). Overrides the default Claude command. */
  bashCommand?: string;
  /** Full CMD CLI invocation line (excluding log redirect). Overrides the default Claude command. */
  cmdCommand?: string;
}

// ── Quoting helpers ────────────────────────────────────────────────────────────

/** Escape a string for embedding inside a double-quoted CMD argument. */
export function escapeCmdArg(s: string): string {
  // In a double-quoted CMD string, only `"` needs escaping (doubled).
  return s.replace(/"/g, '""');
}

/** Wrap a path in double-quotes for CMD. */
export function qCmd(p: string): string {
  return `"${p}"`;
}

/** Escape a string for embedding inside a single-quoted bash argument. */
export function escapeBashArg(s: string): string {
  return s.replace(/'/g, "'\\''");
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate the header and body of a scheduled script.
 * The caller is responsible for writing the file and setting executable bits (Unix).
 */
export function generateScript(params: ScriptParams): string {
  return IS_WIN ? generateCmdScript(params) : generateBashScript(params);
}

// ── Bash (.sh) ─────────────────────────────────────────────────────────────────

function generateBashScript(p: ScriptParams): string {
  const flags = p.flags ?? (p.autonomous ? '--dangerously-skip-permissions' : '');

  const cliLine = p.bashCommand ?? [
    'unset CLAUDECODE',
    `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 \\`,
    `  "${p.binaryPath}" ${flags} \\`,
    `  --output-format stream-json --verbose \\`,
    `  --mcp-config "${p.mcpConfigPath}" \\`,
    `  --add-dir "${p.homeDir}/.dorothy" \\`,
    `  -p '${escapeBashArg(p.prompt)}'`,
  ].join('\n');

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
${cliLine} >> "${p.logPath}" 2>&1
echo "=== Task completed at $(date) ===" >> "${p.logPath}"
`;
}

// ── CMD (.cmd) ─────────────────────────────────────────────────────────────────

function generateCmdScript(p: ScriptParams): string {
  const flags = p.flags ?? (p.autonomous ? '--dangerously-skip-permissions' : '');
  const promptEscaped = escapeCmdArg(p.prompt);

  const cliLine = p.cmdCommand ?? [
    'set "CLAUDECODE="',
    'set "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1"',
    `${qCmd(p.binaryPath)} ${flags} --output-format stream-json --verbose`,
    `  --mcp-config ${qCmd(p.mcpConfigPath)}`,
    `  --add-dir ${qCmd(path.join(p.homeDir, '.dorothy'))}`,
    `  -p "${promptEscaped}"`,
  ].join('\r\n');

  return [
    '@echo off',
    'setlocal EnableDelayedExpansion',
    '',
    `set "HOME=${p.homeDir}"`,
    `set "PATH=${p.binaryDir};%PATH%"`,
    '',
    `cd /d ${qCmd(p.projectPath)}`,
    `echo === Task started at %DATE% %TIME% === >> ${qCmd(p.logPath)}`,
    cliLine + ` >> ${qCmd(p.logPath)} 2>&1`,
    `echo === Task completed at %DATE% %TIME% === >> ${qCmd(p.logPath)}`,
    '',
  ].join('\r\n');
}
