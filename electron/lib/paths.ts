import * as os from 'os';
import * as path from 'path';

const home = os.homedir();

// ── Dorothy data directory ────────────────────────────────────────────────────
export const DOROTHY_DIR        = path.join(home, '.dorothy');
export const AGENTS_FILE        = path.join(DOROTHY_DIR, 'agents.json');
export const APP_SETTINGS_FILE  = path.join(DOROTHY_DIR, 'app-settings.json');
export const KANBAN_FILE        = path.join(DOROTHY_DIR, 'kanban-tasks.json');
export const AUTOMATIONS_FILE   = path.join(DOROTHY_DIR, 'automations.json');
export const VAULT_DIR          = path.join(DOROTHY_DIR, 'vault');
export const VAULT_DB_FILE      = path.join(DOROTHY_DIR, 'vault.db');
export const API_TOKEN_FILE     = path.join(DOROTHY_DIR, 'api-token');
export const TELEGRAM_DOWNLOADS_DIR = path.join(DOROTHY_DIR, 'telegram-downloads');
export const SCRIPTS_DIR        = path.join(DOROTHY_DIR, 'scripts');
export const STATUSLINE_SCRIPT  = path.join(DOROTHY_DIR, 'statusline.sh');

// ── Claude Code data directory ────────────────────────────────────────────────
export const CLAUDE_DIR         = path.join(home, '.claude');
export const CLAUDE_SETTINGS    = path.join(CLAUDE_DIR, 'settings.json');
export const CLAUDE_MCP_CONFIG  = path.join(CLAUDE_DIR, 'mcp.json');
export const CLAUDE_SCHEDULES   = path.join(CLAUDE_DIR, 'schedules.json');
export const LOGS_DIR           = path.join(CLAUDE_DIR, 'logs');
export const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

// ── Legacy (pre-rebrand) directory ───────────────────────────────────────────
export const OLD_DATA_DIR       = path.join(home, '.claude-manager');
