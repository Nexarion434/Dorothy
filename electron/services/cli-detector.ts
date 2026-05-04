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
