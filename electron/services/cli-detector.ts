/**
 * Cross-platform CLI detection and shell resolution.
 *
 * Replaces all usages of:
 *   execSync('which <bin>')
 *   spawn('/bin/bash', ['-l', '-c', 'which <bin>'])
 *   process.env.SHELL || '/bin/zsh'
 */

import * as os from 'os';
import * as path from 'path';
import which from 'which';

const IS_WIN = os.platform() === 'win32';

// ── Shell-arg quoting ──────────────────────────────────────────────────────────

/**
 * Quote a single argument for the current shell.
 * Windows (PowerShell): single-quotes, internal `'` escaped as `''` (literal,
 *                       no variable interpolation, exactly what we want).
 * Unix (bash/zsh):      single-quotes, internal `'` escaped as `'\''`.
 */
export function quoteArg(s: string): string {
  if (IS_WIN) return `'${s.replace(/'/g, "''")}'`;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Build a `cd <dir> && <cmd>` prefix for the current shell.
 * Windows (PowerShell): `Set-Location -LiteralPath <q>; <cmd>`.
 * Unix (bash):          `cd <q> && <cmd>`.
 */
export function cdAndRun(dir: string, cmd: string): string {
  if (IS_WIN) return `Set-Location -LiteralPath ${quoteArg(dir)}; ${cmd}`;
  return `cd ${quoteArg(dir)} && ${cmd}`;
}

// ── Hook extension ─────────────────────────────────────────────────────────────

/**
 * Extension to use for Claude Code / Gemini hook scripts.
 * win32 → '.cmd' (with a co-located .ps1 doing the real work).
 * unix  → '.sh'  (the original bash hooks).
 */
export function getHookExt(): string {
  return IS_WIN ? '.cmd' : '.sh';
}

/**
 * Convert a .sh hook filename to the platform-correct extension.
 * E.g. 'post-tool-use.sh' → 'post-tool-use.cmd' on win32.
 */
export function hookFileForPlatform(file: string): string {
  if (!IS_WIN) return file;
  return file.replace(/\.sh$/, '.cmd');
}

// ── Shell detection ────────────────────────────────────────────────────────────

/**
 * Return the default interactive shell for the current OS.
 * On Windows: COMSPEC (cmd.exe) or 'powershell.exe'.
 * On Unix:    SHELL env var or '/bin/bash'.
 */
export function getDefaultShell(): string {
  if (IS_WIN) {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

/**
 * Shell to use for *agent* PTYs.
 *
 * On Windows we use PowerShell — it's the default shell that Win11 + Windows
 * Terminal surface to ConPTY, and trying to force cmd.exe was unreliable
 * (rc10 still saw PowerShell). All command building below targets PowerShell
 * syntax: `& 'binary' 'arg' ...`, `Set-Location -LiteralPath`, `;` separator,
 * single-quoted args with `''` escape.
 *
 * On Unix this falls back to the user's preferred shell.
 */
export function getAgentShell(): string {
  if (IS_WIN) {
    const sysRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
    return `${sysRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  }
  return process.env.SHELL || '/bin/bash';
}

/**
 * Return the extra args to pass after the shell binary for a login/interactive
 * session.  On Windows shells do not support '-l'; on Unix keep '-l' so that
 * nvm, homebrew, etc. are in PATH (matches existing behaviour).
 */
export function getLoginShellArgs(): string[] {
  return IS_WIN ? [] : ['-l'];
}

/**
 * Return pty.spawn options that are specific to the current OS.
 */
export function getPtyPlatformOptions(): Record<string, unknown> {
  return IS_WIN ? { useConpty: true } : {};
}

// ── CLI path detection ─────────────────────────────────────────────────────────

/**
 * Find a CLI binary using the `which` module (handles PATHEXT on Windows).
 * Returns the full path string, or null if not found.
 */
export async function findCli(name: string): Promise<string | null> {
  try {
    return await which(name);
  } catch {
    return null;
  }
}

/**
 * Find a CLI binary synchronously.  Prefer the async version when possible.
 */
export function findCliSync(name: string): string | null {
  try {
    return which.sync(name);
  } catch {
    return null;
  }
}

// ── PATH construction ──────────────────────────────────────────────────────────

/** PATH separator: ';' on Windows, ':' everywhere else. */
const PATH_SEP = IS_WIN ? ';' : ':';

/**
 * Build a full PATH string that prepends extra directories.
 * On Windows, common Unix paths (/opt/homebrew/bin, etc.) are omitted.
 */
export function buildFullPath(extraPaths: string[] = []): string {
  const home = os.homedir();

  const basePaths = IS_WIN
    ? [
        // Windows equivalents: npm global, nvm-windows, scoop, etc.
        path.join(home, 'AppData', 'Roaming', 'npm'),
        path.join(home, 'AppData', 'Local', 'nvm'),
        path.join(home, 'scoop', 'shims'),
      ]
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        path.join(home, '.local', 'bin'),
        path.join(home, 'Library', 'pnpm'),
        path.join(home, '.yarn', 'bin'),
      ];

  const parts = [
    ...extraPaths.filter(Boolean),
    ...basePaths,
    ...(process.env.PATH || '').split(IS_WIN ? ';' : ':'),
  ];

  return [...new Set(parts)].join(PATH_SEP);
}
