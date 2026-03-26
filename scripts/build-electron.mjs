/**
 * Cross-platform Electron build helper.
 * Handles the api/icon backup-restore dance required for Next.js static export,
 * then runs electron-builder with the requested platform flag(s).
 *
 * Usage:
 *   node scripts/build-electron.mjs --mac
 *   node scripts/build-electron.mjs --win
 *   node scripts/build-electron.mjs --win --dir    (pack only, no installer)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const args = process.argv.slice(2);
const dirFlag = args.includes('--dir');
const platform = args.includes('--win') ? '--win' : '--mac';

// ── Paths that need to be hidden during static export ────────────────────────
const apiDir = path.join(root, 'src', 'app', 'api');
const apiBackup = path.join(root, 'src', 'app', '_api_backup');
const iconFile = path.join(root, 'src', 'app', 'icon.tsx');
const iconBackup = path.join(root, 'src', 'app', '_icon_backup.tsx');

function rename(from, to) {
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
  }
}

function restore() {
  rename(apiBackup, apiDir);
  rename(iconBackup, iconFile);
}

function run(cmd, { cwd: runCwd = root, env: extraEnv = {} } = {}) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: runCwd, env: { ...process.env, ...extraEnv } });
}

// ── Main ──────────────────────────────────────────────────────────────────────
try {
  // 1. Hide API routes + icon (incompatible with static export)
  rename(apiDir, apiBackup);
  rename(iconFile, iconBackup);

  // 2. Build Next.js static export
  run('npx next build', { env: { ELECTRON_BUILD: '1' } });

  // 3. Compile Electron TypeScript
  run('npx tsc -p electron/tsconfig.json');

  // 4. Build all MCP servers
  const mcpDirs = [
    'mcp-orchestrator', 'mcp-telegram', 'mcp-kanban',
    'mcp-vault', 'mcp-socialdata', 'mcp-x', 'mcp-world',
  ];
  for (const dir of mcpDirs) {
    const dirPath = path.join(root, dir);
    if (fs.existsSync(dirPath)) {
      run('npm install', { cwd: dirPath });
      run('npm run build', { cwd: dirPath });
    }
  }

  // 5. Run electron-builder
  const builderCmd = dirFlag
    ? `npx electron-builder ${platform} --dir --publish never`
    : `npx electron-builder ${platform} --publish never`;
  run(builderCmd);

} catch (err) {
  console.error('\nBuild failed:', err.message);
  restore();
  process.exit(1);
}

restore();
console.log('\nBuild complete.');
