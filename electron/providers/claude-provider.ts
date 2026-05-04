import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { generateScript, escapeBashArg, escapeCmdArg, qCmd } from '../services/script-generator';
import { hookFileForPlatform, quoteArg } from '../services/cli-detector';
import { execSync } from 'child_process';
import type { AppSettings } from '../types';
import type {
  CLIProvider,
  InteractiveCommandParams,
  ScheduledCommandParams,
  OneShotCommandParams,
  ProviderModel,
  HookConfig,
} from './cli-provider';

export class ClaudeProvider implements CLIProvider {
  readonly id = 'claude' as const;
  readonly displayName = 'Claude Code';
  readonly binaryName = 'claude';
  readonly configDir = path.join(os.homedir(), '.claude');

  getModels(): ProviderModel[] {
    return [
      { id: 'default', name: 'Default', description: 'Recommended' },
      { id: 'sonnet', name: 'Sonnet', description: 'Daily coding' },
      { id: 'opus', name: 'Opus', description: 'Complex reasoning' },
      { id: 'haiku', name: 'Haiku', description: 'Fast & efficient' },
      { id: 'sonnet[1m]', name: 'Sonnet 1M', description: '1M context window' },
      { id: 'opusplan', name: 'Opus Plan', description: 'Extended thinking' },
    ];
  }

  resolveBinaryPath(appSettings: AppSettings): string {
    return appSettings.cliPaths?.claude || 'claude';
  }

  buildInteractiveCommand(params: InteractiveCommandParams): string {
    // Use quoteArg() for cross-platform shell-correct quoting (single-quotes
    // on Unix, double-quotes on Windows cmd.exe).
    let command = quoteArg(params.binaryPath);

    // MCP config
    if (params.mcpConfigPath && fs.existsSync(params.mcpConfigPath)) {
      command += ` --mcp-config ${quoteArg(params.mcpConfigPath)}`;
    }

    // System prompt file (Super Agent instructions)
    if (params.systemPromptFile && fs.existsSync(params.systemPromptFile)) {
      command += ` --append-system-prompt-file ${quoteArg(params.systemPromptFile)}`;
    }

    // Model
    if (params.model) {
      if (!/^[a-zA-Z0-9._:\/\[\]-]+$/.test(params.model)) {
        throw new Error('Invalid model name');
      }
      command += ` --model ${quoteArg(params.model)}`;
    }

    // Verbose
    if (params.verbose) {
      command += ' --verbose';
    }

    // Permission mode
    if (params.permissionMode === 'normal') {
      command += ' --permission-mode default';
    } else if (params.permissionMode === 'auto') {
      command += ' --permission-mode auto';
    } else if (params.permissionMode === 'bypass') {
      command += ' --dangerously-skip-permissions';
    }

    // Effort level
    if (params.effort && params.effort !== 'medium') {
      command += ` --effort ${params.effort}`;
    }

    // Chrome browser sharing (uses the user's logged-in Chrome via claude-in-chrome extension)
    if (params.chrome) {
      command += ' --chrome';
    }

    // Secondary project
    if (params.secondaryProjectPath) {
      command += ` --add-dir ${quoteArg(params.secondaryProjectPath)}`;
    }

    // Obsidian vaults (read-only access)
    if (params.obsidianVaultPaths) {
      for (const vp of params.obsidianVaultPaths) {
        if (fs.existsSync(vp)) {
          command += ` --add-dir ${quoteArg(vp)}`;
        }
      }
    }

    // Dorothy's CLAUDE.md via ~/.dorothy
    command += ` --add-dir ${quoteArg(path.join(os.homedir(), '.dorothy'))}`;

    // Prompt with skills directive
    let finalPrompt = params.prompt;
    if (params.skills && params.skills.length > 0 && !params.isSuperAgent) {
      const skillsList = params.skills.join(', ');
      finalPrompt = `[IMPORTANT: Use these skills for this session: ${skillsList}. Invoke them with /<skill-name> when relevant to the task.] ${params.prompt}`;
    }

    if (finalPrompt) {
      command += ` ${quoteArg(finalPrompt)}`;
    }

    return command;
  }

  buildScheduledCommand(params: ScheduledCommandParams): string {
    let command = `"${params.binaryPath}"`;

    if (params.autonomous) {
      command += ' --dangerously-skip-permissions';
    }

    if (params.outputFormat) {
      command += ` --output-format ${params.outputFormat}`;
    }

    if (params.verbose) {
      command += ' --verbose';
    }

    if (params.mcpConfigPath) {
      command += ` --mcp-config "${params.mcpConfigPath}"`;
    }

    command += ` --add-dir "${os.homedir()}/.dorothy"`;

    const escaped = params.prompt.replace(/'/g, "'\\''");
    command += ` -p '${escaped}'`;

    return command;
  }

  buildOneShotCommand(params: OneShotCommandParams): string {
    let command = `'${params.binaryPath.replace(/'/g, "'\\''")}'`;

    command += ' -p';

    if (params.model) {
      command += ` --model ${params.model}`;
    }

    const escaped = params.prompt.replace(/'/g, "'\\''");
    command += ` '${escaped}'`;

    return command;
  }

  getPtyEnvVars(agentId: string, projectPath: string, skills: string[]): Record<string, string> {
    return {
      CLAUDE_SKILLS: skills.join(','),
      CLAUDE_AGENT_ID: agentId,
      CLAUDE_PROJECT_PATH: projectPath,
    };
  }

  getEnvVarsToDelete(): string[] {
    return ['CLAUDECODE'];
  }

  getHookConfig(): HookConfig {
    return {
      supportsNativeHooks: true,
      configDir: this.configDir,
      settingsFile: path.join(this.configDir, 'settings.json'),
    };
  }

  async configureHooks(hooksDir: string): Promise<void> {
    const settingsPath = path.join(this.configDir, 'settings.json');

    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    let settings: {
      hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
      [key: string]: unknown;
    } = {};

    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    if (!settings.hooks) {
      settings.hooks = {};
    }

    const hookFiles = [
      { type: 'PostToolUse', file: 'post-tool-use.sh', matcher: '*' },
      { type: 'Stop', file: 'on-stop.sh', matcher: undefined },
      { type: 'SessionStart', file: 'session-start.sh', matcher: '*' },
      { type: 'SessionEnd', file: 'session-end.sh', matcher: '*' },
      { type: 'Notification', file: 'notification.sh', matcher: '*' },
      { type: 'PermissionRequest', file: 'permission-request.sh', matcher: undefined },
      { type: 'TaskCompleted', file: 'task-completed.sh', matcher: undefined },
      { type: 'UserPromptSubmit', file: 'user-prompt-submit.sh', matcher: undefined },
    ];

    let updated = false;

    type HookEntry = { matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> };

    for (const { type, file, matcher } of hookFiles) {
      const platformFile = hookFileForPlatform(file);
      const commandPath = path.join(hooksDir, platformFile);
      if (!fs.existsSync(commandPath)) continue;

      // Match either the bash filename or the cmd filename to detect existing entries
      // (handles upgrades from a previous install where the .sh path was registered).
      const existing: HookEntry[] = settings.hooks![type] || [];
      const entryIndex = existing.findIndex((h: HookEntry) =>
        h.hooks?.some((hh: { command?: string }) =>
          hh.command?.includes(file) || hh.command?.includes(platformFile)
        )
      );

      if (entryIndex >= 0) {
        const entry: HookEntry = existing[entryIndex];
        const hookIndex = entry.hooks.findIndex((hh: { command?: string }) =>
          hh.command?.includes(file) || hh.command?.includes(platformFile)
        );
        if (hookIndex >= 0 && entry.hooks[hookIndex].command !== commandPath) {
          entry.hooks[hookIndex].command = commandPath;
          updated = true;
        }
      } else {
        const hookConfig: { matcher?: string; hooks: Array<{ type: string; command: string; timeout: number }> } = {
          hooks: [{ type: 'command', command: commandPath, timeout: 30 }]
        };
        if (matcher) hookConfig.matcher = matcher;
        settings.hooks![type] = [...existing, hookConfig];
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log('Claude hooks configured/updated in', settingsPath);
    } else {
      console.log('Claude hooks already configured');
    }
  }

  async registerMcpServer(name: string, command: string, args: string[]): Promise<void> {
    // Try claude mcp add -s user first
    try {
      const argsStr = args.map(a => `"${a}"`).join(' ');
      execSync(`claude mcp add -s user ${name} ${command} ${argsStr}`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      console.log(`[claude] Registered MCP server ${name} via claude mcp add`);
      return;
    } catch {
      // Fallback: write to mcp.json
    }

    const mcpConfigPath = path.join(this.configDir, 'mcp.json');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    let mcpConfig: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(mcpConfigPath)) {
      try {
        mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
      } catch {
        mcpConfig = { mcpServers: {} };
      }
    }

    mcpConfig.mcpServers![name] = { command, args };
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log(`[claude] Registered MCP server ${name} via mcp.json fallback`);
  }

  async removeMcpServer(name: string): Promise<void> {
    // Try claude mcp remove -s user
    try {
      execSync(`claude mcp remove -s user ${name} 2>&1`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch {
      // Ignore if doesn't exist
    }

    // Also clean mcp.json
    const mcpConfigPath = path.join(this.configDir, 'mcp.json');
    if (fs.existsSync(mcpConfigPath)) {
      try {
        const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        if (mcpConfig?.mcpServers?.[name]) {
          delete mcpConfig.mcpServers[name];
          fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  isMcpServerRegistered(name: string, expectedServerPath: string): boolean {
    const mcpConfigPath = path.join(this.configDir, 'mcp.json');
    if (!fs.existsSync(mcpConfigPath)) return false;
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
      const existing = mcpConfig?.mcpServers?.[name];
      if (!existing?.args) return false;
      return existing.args[existing.args.length - 1] === expectedServerPath;
    } catch {
      return false;
    }
  }

  getMcpConfigStrategy(): 'flag' | 'config-file' {
    return 'flag';
  }

  getSkillDirectories(): string[] {
    return [
      path.join(this.configDir, 'skills'),
      path.join(os.homedir(), '.agents', 'skills'),
    ];
  }

  getInstalledSkills(): string[] {
    const skills = new Set<string>();

    // Scan skill directories for subdirectory names
    for (const dir of this.getSkillDirectories()) {
      if (fs.existsSync(dir)) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() || entry.isSymbolicLink()) {
              skills.add(entry.name);
            }
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    // Also read enabledPlugins keys from settings.json (skills are stored as "name@source")
    const settingsPath = path.join(this.configDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (settings.enabledPlugins) {
          for (const key of Object.keys(settings.enabledPlugins)) {
            if (settings.enabledPlugins[key]) {
              skills.add(key.split('@')[0]);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    return Array.from(skills);
  }

  supportsSkills(): boolean {
    return true;
  }

  getMemoryBasePath(): string {
    return path.join(this.configDir, 'projects');
  }

  getAddDirFlag(): string {
    return '--add-dir';
  }

  buildScheduledScript(params: {
    binaryPath: string;
    binaryDir: string;
    projectPath: string;
    prompt: string;
    autonomous: boolean;
    mcpConfigPath: string;
    logPath: string;
    homeDir: string;
  }): string {
    const flags = params.autonomous ? '--dangerously-skip-permissions' : '';
    const bp = params.binaryPath;
    const mcp = params.mcpConfigPath;
    const hd = params.homeDir;

    const bashCommand = [
      'unset CLAUDECODE',
      `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 \\`,
      `  "${bp}" ${flags} \\`,
      `  --output-format stream-json --verbose \\`,
      `  --mcp-config "${mcp}" \\`,
      `  --add-dir "${hd}/.dorothy" \\`,
      `  -p '${escapeBashArg(params.prompt)}'`,
    ].join('\n');

    const cmdCommand = [
      'set "CLAUDECODE="',
      'set "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1"',
      [
        `${qCmd(bp)} ${flags} --output-format stream-json --verbose`,
        `--mcp-config ${qCmd(mcp)}`,
        `--add-dir ${qCmd(path.join(hd, '.dorothy'))}`,
        `-p "${escapeCmdArg(params.prompt)}"`,
      ].join(' '),
    ].join('\r\n');

    return generateScript({
      ...params,
      taskId: '',
      flags,
      bashCommand,
      cmdCommand,
    });
  }
}
