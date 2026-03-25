import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AppSettings, CLIPaths } from '../types';
import { getDorothyDir, getCliExt, getExtraPaths } from '../utils/platform-paths';

const execAsync = promisify(exec);

// Shared config file path that MCP can read
const CLI_PATHS_CONFIG_FILE = path.join(getDorothyDir(), 'cli-paths.json');

export interface CLIPathsHandlerDependencies {
  getAppSettings: () => AppSettings;
  setAppSettings: (settings: AppSettings) => void;
  saveAppSettings: (settings: AppSettings) => void;
}

/**
 * Detect CLI paths from the system — cross-platform.
 */
async function detectCLIPaths(): Promise<{ claude: string; codex: string; gemini: string; opencode: string; pi: string; gws: string; gcloud: string; gh: string; node: string }> {
  const homeDir = os.homedir();
  const ext = getCliExt();
  const isWin = process.platform === 'win32';
  const pathSep = path.delimiter; // ':' on Unix, ';' on Windows

  const paths = { claude: '', codex: '', gemini: '', opencode: '', pi: '', gws: '', gcloud: '', gh: '', node: '' };

  // Platform-specific search directories
  const commonPaths = isWin
    ? [
        path.join(homeDir, 'AppData', 'Roaming', 'npm'),
        path.join(homeDir, 'AppData', 'Local', 'Programs'),
        'C:\\Program Files\\nodejs',
        'C:\\Program Files (x86)\\nodejs',
      ]
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        path.join(homeDir, '.local/bin'),
      ];

  // Add nvm paths (Unix only)
  if (!isWin) {
    const nvmDir = path.join(homeDir, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      try {
        const versions = fs.readdirSync(nvmDir);
        for (const version of versions) {
          commonPaths.push(path.join(nvmDir, version, 'bin'));
        }
      } catch {
        // Ignore errors
      }
    }
  }

  /** Check filesystem + shell lookup for a given binary name */
  async function findBinary(name: string, extraDirs: string[] = []): Promise<string> {
    const allDirs = [...extraDirs, ...commonPaths];
    const candidates = isWin
      ? ['.cmd', '.exe', ''].map(e => `${name}${e}`)
      : [name];

    for (const dir of allDirs) {
      for (const candidate of candidates) {
        const p = path.join(dir, candidate);
        if (fs.existsSync(p)) return p;
      }
    }

    // Shell lookup: `where` on Windows, `which` on Unix
    const lookupCmd = isWin ? `where ${name}` : `which ${name}`;
    try {
      const { stdout } = await execAsync(lookupCmd, {
        env: { ...process.env, PATH: `${allDirs.join(pathSep)}${pathSep}${process.env.PATH}` },
      });
      const first = stdout.trim().split(/\r?\n/)[0];
      if (first) return first;
    } catch {
      // Ignore
    }

    return '';
  }

  const gcloudExtraDirs = isWin
    ? [
        path.join(homeDir, 'AppData', 'Local', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin'),
        'C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin',
      ]
    : [
        '/opt/homebrew/share/google-cloud-sdk/bin',
        '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin',
        path.join(homeDir, 'google-cloud-sdk/bin'),
      ];

  [
    paths.claude,
    paths.codex,
    paths.gemini,
    paths.opencode,
    paths.pi,
    paths.gws,
    paths.gh,
    paths.node,
    paths.gcloud,
  ] = await Promise.all([
    findBinary(`claude${ext}`),
    findBinary(`codex${ext}`),
    findBinary(`gemini${ext}`),
    findBinary(`opencode${ext}`),
    findBinary(`pi${ext}`),
    findBinary(`gws${ext}`),
    findBinary(`gh${ext}`),
    findBinary('node'),
    findBinary('gcloud', gcloudExtraDirs),
  ]);

  return paths;
}

/**
 * Save CLI paths to the shared config file that MCP can read
 */
function saveCLIPathsConfig(paths: CLIPaths): void {
  const configDir = path.dirname(CLI_PATHS_CONFIG_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const defaultPaths = getExtraPaths();

  // Combine all paths using the platform path delimiter
  const allPaths = [...new Set([
    ...paths.additionalPaths,
    ...defaultPaths,
    ...(process.env.PATH || '').split(path.delimiter),
  ])];

  const config = {
    ...paths,
    fullPath: allPaths.join(path.delimiter),
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

  // Detect CLI paths
  ipcMain.handle('cliPaths:detect', async () => {
    return detectCLIPaths();
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

  // Return defaults
  const defaultPaths = getExtraPaths();

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
    fullPath: [...new Set([...defaultPaths, ...(process.env.PATH || '').split(path.delimiter)])].join(path.delimiter),
  };
}

/**
 * Get the full PATH string including configured and default paths
 */
export function getFullPath(): string {
  const config = getCLIPathsConfig();
  return config.fullPath;
}
