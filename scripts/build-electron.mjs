/**
 * Cross-platform Electron build script — replaces the bash -c inline in package.json.
 *
 * Usage:
 *   node scripts/build-electron.mjs win [--pack]
 *   node scripts/build-electron.mjs mac [--pack]
 *   node scripts/build-electron.mjs linux [--pack]
 *
 * --pack  → electron-builder --dir (unpacked folder, no installer)
 */

import { execSync } from 'node:child_process';
import { renameSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Sleep synchronously for ms milliseconds. */
function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

/** Rename with retry — handles transient EPERM on Windows (file watchers, AV). */
function renameRetry(src, dst, attempts = 8, delayMs = 250) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      renameSync(src, dst);
      return;
    } catch (err) {
      lastErr = err;
      if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'EACCES') throw err;
      sleepSync(delayMs);
    }
  }
  throw lastErr;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const target = process.argv[2] || 'win';
const packOnly = process.argv.includes('--pack');

if (!['win', 'mac', 'linux'].includes(target)) {
  console.error(`Unknown target "${target}". Use win | mac | linux.`);
  process.exit(1);
}

// ── Paths that must be temporarily hidden from Next.js during Electron build ──
const apiDir    = path.join(root, 'src', 'app', 'api');
const apiBackup = path.join(root, 'src', 'app', '_api_backup');
const iconFile  = path.join(root, 'src', 'app', 'icon.tsx');
const iconBackup = path.join(root, 'src', 'app', '_icon_backup.tsx');

function restore() {
  try {
    if (existsSync(apiBackup))   renameRetry(apiBackup,  apiDir);
    if (existsSync(iconBackup))  renameRetry(iconBackup, iconFile);
  } catch (e) {
    console.error('  ⚠  restore failed:', e.message);
  }
}

// Always restore on exit (clean or error)
process.on('exit', restore);
process.on('SIGINT',  () => { restore(); process.exit(1); });
process.on('SIGTERM', () => { restore(); process.exit(1); });
// Windows Ctrl+Break
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => { restore(); process.exit(1); });
}

function run(cmd, opts = {}) {
  console.log(`\n▶  ${cmd}`);
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts });
}

try {
  // ── 0. Heal from a previously interrupted build (backup still in place) ──
  if (existsSync(apiBackup) && !existsSync(apiDir))   renameRetry(apiBackup, apiDir);
  if (existsSync(iconBackup) && !existsSync(iconFile)) renameRetry(iconBackup, iconFile);

  // ── 1. Hide API routes and icon from Next.js (Electron build skips them) ──
  if (existsSync(apiDir))   renameRetry(apiDir,   apiBackup);
  if (existsSync(iconFile)) renameRetry(iconFile,  iconBackup);

  // ── 2. Clean stale Next.js cache (dev server leaves type files that break prod build) ──
  const nextDir = path.join(root, '.next');
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
    console.log('  🗑  Removed stale .next/ cache');
  }

  // ── 3. Next.js production build ──
  run('next build', { cwd: root, env: { ...process.env, ELECTRON_BUILD: '1' } });

  // ── 4. Compile Electron TypeScript ──
  run('tsc -p electron/tsconfig.json', { cwd: root });

  // ── 5. Build MCP servers ──
  const mcpServers = [
    'mcp-orchestrator',
    'mcp-telegram',
    'mcp-kanban',
    'mcp-vault',
    'mcp-socialdata',
    'mcp-x',
    'mcp-world',
  ];

  for (const mcp of mcpServers) {
    const mcpDir = path.join(root, mcp);
    if (!existsSync(mcpDir)) {
      console.warn(`  ⚠  ${mcp} not found, skipping`);
      continue;
    }
    run('npm install --ignore-scripts', { cwd: mcpDir });
    run('npm run build', { cwd: mcpDir });
  }

  // ── 6. electron-builder ──
  // CSC_IDENTITY_AUTO_DISCOVERY=false → skip macOS signing discovery
  // CSC_LINK=''                       → no Windows cert, skips winCodeSign download
  const signingEnv = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    CSC_LINK: '',
  };
  const dirFlag = packOnly ? '--dir' : '';
  run(`npx electron-builder --${target} ${dirFlag}`, { cwd: root, env: signingEnv });

  console.log('\n✅  Build complete.\n');
} catch (err) {
  console.error('\n❌  Build failed:', err.message);
  process.exit(1);
}
