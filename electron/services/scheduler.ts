/**
 * In-process scheduler for Windows using node-cron.
 *
 * macOS uses launchd (see scheduler-handlers.ts createLaunchdJob).
 * Linux uses crontab (see scheduler-handlers.ts createCronJob).
 * Windows: this module manages in-process cron jobs via node-cron.
 *
 * The scheduler is started once from main.ts on win32 and registers
 * tasks as they are created/deleted by the IPC handlers.
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { schedule as cronSchedule, ScheduledTask } from 'node-cron';
import { CLAUDE_SCHEDULES, LOGS_DIR, SCRIPTS_DIR } from '../lib/paths';

interface ScheduledJob {
  task: ScheduledTask;
  scriptPath: string;
}

const activeJobs = new Map<string, ScheduledJob>();

/**
 * Register a scheduled task with node-cron.
 * @param taskId   Unique task ID (used for log file naming)
 * @param schedule Standard 5-field cron expression (min hour dom mon dow)
 * @param scriptPath Full path to the .cmd or .sh script to execute
 */
export function registerCronJob(taskId: string, schedule: string, scriptPath: string): void {
  // Remove any previous job for this ID
  removeCronJob(taskId);

  const logPath = path.join(LOGS_DIR, `${taskId}.log`);
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  const task = cronSchedule(schedule, () => {
    const startLine = `=== Task started at ${new Date().toISOString()} ===\n`;
    fs.appendFileSync(logPath, startLine);

    const proc = spawn(scriptPath, [], {
      shell: false,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (d: Buffer) => fs.appendFileSync(logPath, d));
    proc.stderr?.on('data', (d: Buffer) => fs.appendFileSync(logPath, d));
    proc.on('close', (code) => {
      fs.appendFileSync(logPath, `=== Task completed at ${new Date().toISOString()} (exit ${code}) ===\n`);
    });
  }, {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  activeJobs.set(taskId, { task, scriptPath });
  console.log(`[scheduler] Registered node-cron job ${taskId} (${schedule})`);
}

/**
 * Remove a node-cron job by task ID.
 */
export function removeCronJob(taskId: string): void {
  const job = activeJobs.get(taskId);
  if (job) {
    job.task.stop();
    activeJobs.delete(taskId);
    console.log(`[scheduler] Removed node-cron job ${taskId}`);
  }
}

/**
 * Re-hydrate all jobs from ~/.claude/schedules.json on app startup.
 * Call this once from main.ts when running on win32.
 */
export function rehydrateSchedules(scriptExt: string): void {
  if (!fs.existsSync(CLAUDE_SCHEDULES)) return;

  try {
    const raw = fs.readFileSync(CLAUDE_SCHEDULES, 'utf-8');
    const schedules: Array<{ id: string; schedule?: string; cron?: string }> = JSON.parse(raw);

    for (const s of schedules) {
      const id = s.id;
      const expr = s.schedule || s.cron;
      if (!id || !expr) continue;

      const scriptPath = path.join(SCRIPTS_DIR, `${id}${scriptExt}`);
      if (fs.existsSync(scriptPath)) {
        try {
          registerCronJob(id, expr, scriptPath);
        } catch (err) {
          console.warn(`[scheduler] Failed to rehydrate job ${id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[scheduler] Error reading schedules.json:', err);
  }
}

export function getActiveJobIds(): string[] {
  return [...activeJobs.keys()];
}
