/**
 * Windows Task Scheduler wrapper using schtasks.exe
 * Used on Windows instead of launchd (macOS) or cron (Linux).
 *
 * Scripts are stored in %APPDATA%\Dorothy\scripts\
 * Tasks are created under the "Dorothy" task folder.
 */

import { execSync, ExecSyncOptions } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const DOROTHY_DIR =
  process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'Dorothy')
    : path.join(os.homedir(), '.dorothy');

const SCRIPTS_DIR = path.join(DOROTHY_DIR, 'scripts');

function ensureScriptsDir(): void {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  }
}

function execSafe(cmd: string): { stdout: string; error?: string } {
  try {
    const opts: ExecSyncOptions = { encoding: 'utf8', windowsHide: true };
    const stdout = execSync(cmd, opts) as unknown as string;
    return { stdout };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: '', error: message };
  }
}

/**
 * Creates a Windows scheduled task that runs a PowerShell script.
 *
 * @param taskName - Unique name (used as task label under "Dorothy\")
 * @param scriptContent - PowerShell script content to write and schedule
 * @param intervalMinutes - How often to run (in minutes, minimum 1)
 */
export function createTask(
  taskName: string,
  scriptContent: string,
  intervalMinutes: number,
): { success: boolean; error?: string } {
  if (process.platform !== 'win32') {
    return { success: false, error: 'schedule-win is only supported on Windows' };
  }

  ensureScriptsDir();

  const scriptPath = path.join(SCRIPTS_DIR, `${taskName}.ps1`);
  try {
    fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
  } catch (err) {
    return { success: false, error: `Failed to write script: ${err}` };
  }

  // schtasks /create with a repetition trigger
  // /sc MINUTE /mo <interval> runs the task every N minutes
  const tn = `Dorothy\\${taskName}`;
  const tr = `powershell.exe -NonInteractive -File "${scriptPath}"`;
  const cmd = `schtasks /create /tn "${tn}" /tr "${tr}" /sc MINUTE /mo ${intervalMinutes} /f /rl LIMITED`;

  const result = execSafe(cmd);
  if (result.error) {
    return { success: false, error: result.error };
  }
  return { success: true };
}

/**
 * Removes a scheduled task and its associated PowerShell script.
 *
 * @param taskName - Same name used in createTask()
 */
export function deleteTask(taskName: string): { success: boolean; error?: string } {
  if (process.platform !== 'win32') {
    return { success: false, error: 'schedule-win is only supported on Windows' };
  }

  const tn = `Dorothy\\${taskName}`;
  const result = execSafe(`schtasks /delete /tn "${tn}" /f`);

  // Also remove the script file
  const scriptPath = path.join(SCRIPTS_DIR, `${taskName}.ps1`);
  if (fs.existsSync(scriptPath)) {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Non-fatal
    }
  }

  if (result.error && !result.error.includes('does not exist')) {
    return { success: false, error: result.error };
  }
  return { success: true };
}

/**
 * Lists all Dorothy scheduled tasks.
 */
export function listTasks(): { tasks: string[]; error?: string } {
  if (process.platform !== 'win32') {
    return { tasks: [] };
  }

  const result = execSafe('schtasks /query /tn "Dorothy" /fo LIST 2>nul');
  if (result.error) {
    return { tasks: [] };
  }

  const tasks = (result.stdout.match(/TaskName:\s+Dorothy\\(.+)/g) || [])
    .map((line) => line.replace(/TaskName:\s+Dorothy\\/, '').trim());

  return { tasks };
}
