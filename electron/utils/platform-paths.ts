import * as path from 'path';
import * as os from 'os';

/**
 * Returns the Dorothy data directory, cross-platform:
 * - Windows : %APPDATA%\Dorothy
 * - macOS/Linux : ~/.dorothy
 */
export const getDorothyDir = (): string =>
  process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'Dorothy')
    : path.join(os.homedir(), '.dorothy');

/**
 * Returns the Claude config directory (~/.claude on all platforms).
 * On Windows this resolves to %USERPROFILE%\.claude.
 */
export const getClaudeDir = (): string =>
  path.join(os.homedir(), '.claude');

/**
 * Returns the appropriate shell for the current platform:
 * - Windows : %COMSPEC% or powershell.exe
 * - macOS/Linux : $SHELL or /bin/bash
 */
export const getShell = (): string =>
  process.platform === 'win32'
    ? (process.env.COMSPEC || 'powershell.exe')
    : (process.env.SHELL || '/bin/bash');

/**
 * Returns shell arguments for login shells.
 * PowerShell does not support -l; Unix shells do.
 */
export const getShellArgs = (): string[] =>
  process.platform === 'win32' ? [] : ['-l'];

/**
 * Returns the file extension for CLI executables on the current platform.
 * - Windows : '.cmd'
 * - macOS/Linux : ''
 */
export const getCliExt = (): string =>
  process.platform === 'win32' ? '.cmd' : '';

/**
 * Returns platform-specific extra PATH directories for spawned processes.
 */
export const getExtraPaths = (): string[] => {
  if (process.platform === 'win32') {
    return [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Claude'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
      'C:\\Program Files\\nodejs',
      'C:\\Windows\\System32',
    ];
  }
  return [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/opt/homebrew/bin',
  ];
};
