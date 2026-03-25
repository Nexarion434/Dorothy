# Dorothy — Windows Fork
## Project overview
Electron/Next.js app for AI agent management. This repo is a Windows-compatible fork of [Charlie85270/Dorothy](https://github.com/Charlie85270/Dorothy), maintained at [Nexarion434/Dorothy](https://github.com/Nexarion434/Dorothy).
**Goal**: produce a Windows build (.exe / NSIS installer) while keeping macOS/Linux compatibility.
## Stack
- Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Zustand 5
- Electron 33 · xterm.js · node-pty · better-sqlite3
- TypeScript 5 · npm
## Architecture
```
electron/
├── handlers/        # IPC handlers — must stay platform-agnostic
├── services/
│   ├── claude-service.ts   # detect .cmd/.exe on Windows
│   └── hooks-manager.ts    # cross-platform paths
└── core/
    └── pty-manager.ts      # shell: powershell/cmd on Windows
scripts/
├── notarize.js             # macOS only — guard with process.platform check
└── schedule-win.ts         # Windows Task Scheduler wrapper (schtasks)
build/
├── icon.ico                # generated for Windows
└── entitlements.mac.plist  # macOS only — do not touch
```
## Platform rules
**Always:**
- Use `path.join()` / `path.resolve()` — never hardcode `/` separators
- Detect platform with `process.platform === 'win32'` before any OS-specific call
- Use `app.getPath('userData')` (Electron) or `path.join(os.homedir(), ...)` (Node) for user data paths
**Never:**
- Hardcode `~/.dorothy/` or `~/.claude/` paths
- Use `/bin/sh -c` without a Windows fallback
- Call macOS-specific APIs (launchd, notarize) without a platform guard
## Path mapping
| macOS/Linux | Windows |
|---|---|
| `~/.dorothy/agents.json` | `%APPDATA%\Dorothy\agents.json` |
| `~/.dorothy/vault.db` | `%APPDATA%\Dorothy\vault.db` |
| `~/.dorothy/scripts/` | `%APPDATA%\Dorothy\scripts\` |
| `~/.claude/settings.json` | `%USERPROFILE%\.claude\settings.json` |
| `~/.claude/logs/` | `%USERPROFILE%\.claude\logs\` |
## Build targets
```json
// package.json > build
"win": {
  "target": ["nsis", "zip"],
  "icon": "public/icon.ico"
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "installerIcon": "public/icon.ico",
  "uninstallerIcon": "public/icon.ico"
}
```
Scripts to add:
- `electron:build:win` — Windows-only build
- `electron:pack:win` — Windows-only pack
- `electron:build` — keep existing, add `--win` target alongside `--mac`
## Native modules
After any `npm install`, run:
```bash
npx @electron/rebuild
```
Critical for: `node-pty` and `better-sqlite3`.
**PTY shell detection:**
```ts
const shell = process.platform === 'win32'
  ? (process.env.COMSPEC || 'powershell.exe')
  : (process.env.SHELL || '/bin/bash')
```
## Scheduled tasks
| Platform | Method |
|---|---|
| macOS | `launchd` |
| Linux | `cron` |
| Windows | `schtasks` via `child_process` |
Implement in `scripts/schedule-win.ts`. Store scripts in `%APPDATA%\Dorothy\scripts\`.
## CLI detection (Windows)
`gh`, `claude-code`, `gws` may be installed as `.cmd` or `.exe`. In `claude-service.ts`:
```ts
const ext = process.platform === 'win32' ? '.cmd' : ''
const claudeBin = `claude${ext}`
```
## Do NOT touch
- MCP logic (stdio, all 7 servers) — natively cross-platform
- React/Next.js UI
- Telegram/Slack configs
- `.agents/`, `.claude/`, `.cursor/` skill files
## Git workflow
- Main branch: `main`
- All platform changes: `feat/windows-support`
- PR to `main` once Windows build is validated
- CI: test on `windows-latest` via GitHub Actions
## Testing
```bash
npm run test   # Vitest — works on Windows as-is
```
Validate native modules rebuild on Windows before shipping.

## Memory System

Dorothy exposes Claude Code's **native memory** (`~/.claude/projects/*/memory/`) via the Memory page. No custom storage — reads real Claude Code memory files. Project dir names use path-as-folder-name encoding (slashes → dashes).

## Memory

Use auto memory (`~/.claude/projects/.../memory/`) actively on this project:
- Save architectural decisions, key file locations, and debugging insights to `MEMORY.md`
- Create topic files (e.g. `patterns.md`, `debugging.md`) for detailed notes — keep `MEMORY.md` under 200 lines
- At session start, review `MEMORY.md` for relevant context before diving in
- After any correction or new discovery, update memory so the next session benefits
