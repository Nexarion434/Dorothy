import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { AppSettings, CLIPaths } from '../types';
import { findCli, buildFullPath } from '../services/cli-detector';

// Shared config file path that MCP can read
const CLI_PATHS_CONFIG_FILE = path.join(os.homedir(), '.dorothy', 'cli-paths.json');

export interface CLIPathsHandlerDependencies {
  getAppSettings: () => AppSettings;
  setAppSettings: (settings: AppSettings) => void;
  saveAppSettings: (settings: AppSettings) => void;
}

const CLI_NAMES = ['claude', 'codex', 'gemini', 'opencode', 'pi', 'gws', 'gcloud', 'gh', 'node'] as const;

/**
 * Detect CLI paths from the system using cross-platform `which` (handles PATHEXT on Windows).
 * Manually-set paths from savedPaths take precedence when the binary exists.
 */
async function detectCLIPaths(savedPaths?: Partial<CLIPaths>): Promise<{ claude: string; codex: string; gemini: string; opencode: string; pi: string; gws: string; gcloud: string; gh: string; node: string }> {
  const paths: Record<string, string> = { claude: '', codex: '', gemini: '', opencode: '', pi: '', gws: '', gcloud: '', gh: '', node: '' };

  // Honour manually-configured paths first
  if (savedPaths) {
    for (const key of CLI_NAMES) {
      const saved = savedPaths[key];
      if (saved && fs.existsSync(saved)) {
        paths[key] = saved;
      }
    }
  }

  // Find remaining binaries via the which module (cross-platform, handles PATHEXT)
  const detections = await Promise.all(
    CLI_NAMES.map(async (name) => {
      if (paths[name]) return { name, result: paths[name] };
      return { name, result: await findCli(name) || '' };
    })
  );
  for (const { name, result } of detections) {
    if (!paths[name]) paths[name] = result;
  }

  return paths as { claude: string; codex: string; gemini: string; opencode: string; pi: string; gws: string; gcloud: string; gh: string; node: string };
}

/**
 * Save CLI paths to the shared config file that MCP can read
 */
function saveCLIPathsConfig(paths: CLIPaths): void {
  const configDir = path.dirname(CLI_PATHS_CONFIG_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const config = {
    ...paths,
    fullPath: buildFullPath(paths.additionalPaths),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(CLI_PATHS_CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Load CLI paths config from file
 */
function loadCLIPathsConfig(): CLIPaths | null {
  try {
    if (fs.existsSync(CLI_PATHS_CONFIG_FILE)) {
      const content = fs.readFileSync(CLI_PATHS_CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Register CLI paths IPC handlers
 */
export function registerCLIPathsHandlers(deps: CLIPathsHandlerDependencies): void {
  const { getAppSettings, setAppSettings, saveAppSettings } = deps;

  // Detect CLI paths (use saved settings as overrides if binary exists at saved path)
  ipcMain.handle('cliPaths:detect', async () => {
    const settings = getAppSettings();
    return detectCLIPaths(settings.cliPaths);
  });

  // Get CLI paths from app settings
  ipcMain.handle('cliPaths:get', async () => {
    const settings = getAppSettings();
    return settings.cliPaths || { claude: '', codex: '', gemini: '', opencode: '', pi: '', gws: '', gcloud: '', gh: '', node: '', additionalPaths: [] };
  });

  // Save CLI paths
  ipcMain.handle('cliPaths:save', async (_event, paths: CLIPaths) => {
    try {
      const settings = getAppSettings();
      const updatedSettings = { ...settings, cliPaths: paths };
      setAppSettings(updatedSettings);
      saveAppSettings(updatedSettings);

      // Also save to shared config file for MCP
      saveCLIPathsConfig(paths);

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

/**
 * Get CLI paths config for use by other parts of the app
 */
export function getCLIPathsConfig(): CLIPaths & { fullPath: string } {
  const config = loadCLIPathsConfig();
  if (config) {
    return config as CLIPaths & { fullPath: string };
  }

  return {
    claude: '',
    codex: '',
    gemini: '',
    opencode: '',
    pi: '',
    gws: '',
    gcloud: '',
    gh: '',
    node: '',
    additionalPaths: [],
    fullPath: buildFullPath(),
  };
}

/**
 * Get the full PATH string including configured and default paths
 */
export function getFullPath(): string {
  return getCLIPathsConfig().fullPath;
}
