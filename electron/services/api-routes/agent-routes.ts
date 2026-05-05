import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as pty from 'node-pty';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { agents, saveAgents } from '../../core/agent-manager';
import { ptyProcesses, writeProgrammaticInput } from '../../core/pty-manager';
import { buildFullPath } from '../../utils/path-builder';
import { findCli, getPtyPlatformOptions } from '../cli-detector';
import { getProvider } from '../../providers';
import { AgentStatus, AgentCharacter } from '../../types';
import { RouteApp, RouteContext } from './types';

export function registerAgentRoutes(app_: RouteApp, ctx: RouteContext): void {
  // GET /api/agents/:id/wait — long-poll until agent status changes
  app_.get(/^\/api\/agents\/([^/]+)\/wait$/, (req, sendJson) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      sendJson({ error: 'Agent not found' }, 404);
      return;
    }

    const timeoutSec = parseInt(req.url.searchParams.get('timeout') || '300', 10);
    const currentStatus = agent.status;

    // Return immediately if already in terminal state
    if (currentStatus === 'completed' || currentStatus === 'error' || currentStatus === 'idle' || currentStatus === 'waiting') {
      sendJson({
        status: agent.status,
        lastCleanOutput: agent.lastCleanOutput,
        error: agent.error,
      });
      return;
    }

    // Long-poll: wait for status change event
    const agentId = req.params.id;
    let resolved = false;

    const respond = () => {
      if (resolved) return;
      resolved = true;
      const a = agents.get(agentId);
      sendJson({
        status: a?.status || 'idle',
        lastCleanOutput: a?.lastCleanOutput,
        error: a?.error,
      });
    };

    const onStatusChange = () => respond();
    ctx.agentStatusEmitter.on(`status:${agentId}`, onStatusChange);

    const timeout = setTimeout(() => {
      ctx.agentStatusEmitter.off(`status:${agentId}`, onStatusChange);
      if (!resolved) {
        resolved = true;
        const a = agents.get(agentId);
        sendJson({
          status: a?.status || 'running',
          lastCleanOutput: a?.lastCleanOutput,
          timeout: true,
        });
      }
    }, timeoutSec * 1000);

    // Clean up if client disconnects
    req.raw.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        ctx.agentStatusEmitter.off(`status:${agentId}`, onStatusChange);
      }
    });
  });

  // GET /api/agents
  app_.get('/api/agents', (req, sendJson) => {
    const agentList = Array.from(agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      projectPath: a.projectPath,
      secondaryProjectPath: a.secondaryProjectPath,
      skills: a.skills,
      currentTask: a.currentTask,
      lastActivity: a.lastActivity,
      character: a.character,
      branchName: a.branchName,
      error: a.error,
    }));
    sendJson({ agents: agentList });
  });

  // GET /api/agents/:id
  app_.get(/^\/api\/agents\/([^/]+)$/, (req, sendJson) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      sendJson({ error: 'Agent not found' }, 404);
      return;
    }
    sendJson({ agent });
  });

  // GET /api/agents/:id/output
  app_.get(/^\/api\/agents\/([^/]+)\/output$/, (req, sendJson) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      sendJson({ error: 'Agent not found' }, 404);
      return;
    }
    const lines = parseInt(req.url.searchParams.get('lines') || '100', 10);
    const output = agent.output.slice(-lines).join('');
    sendJson({ output, status: agent.status });
  });

  // POST /api/agents
  app_.post('/api/agents', (req, sendJson) => {
    const { projectPath, name, skills = [], character, permissionMode, secondaryProjectPath } = req.body as {
      projectPath: string;
      name?: string;
      skills?: string[];
      character?: AgentCharacter;
      permissionMode?: 'normal' | 'auto' | 'bypass';
      secondaryProjectPath?: string;
    };

    if (!projectPath) {
      sendJson({ error: 'projectPath is required' }, 400);
      return;
    }

    const id = uuidv4();
    const agent: AgentStatus = {
      id,
      status: 'idle',
      projectPath,
      secondaryProjectPath,
      skills,
      output: [],
      lastActivity: new Date().toISOString(),
      character,
      name: name || `Agent ${id.slice(0, 6)}`,
      permissionMode: permissionMode || 'auto',
    };
    agents.set(id, agent);
    saveAgents();
    sendJson({ agent });
  });

  // POST /api/agents/:id/start
  app_.post(/^\/api\/agents\/([^/]+)\/start$/, async (req, sendJson) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      sendJson({ error: 'Agent not found' }, 404);
      return;
    }

    const { prompt, model, permissionMode: bodyPermissionMode, printMode } = req.body as {
      prompt: string; model?: string; permissionMode?: 'normal' | 'auto' | 'bypass'; printMode?: boolean;
    };
    if (!prompt) {
      sendJson({ error: 'prompt is required' }, 400);
      return;
    }

    const workingDir = agent.worktreePath || agent.projectPath;
    const isAutomationAgent = agent.name?.toLowerCase().includes('automation:');
    const usePrintMode = printMode || isAutomationAgent;
    const isSuperAgentApi = agent.name?.toLowerCase().includes('super agent') ||
                            agent.name?.toLowerCase().includes('orchestrator');

    const effectiveMode = bodyPermissionMode ?? agent.permissionMode ?? (agent.skipPermissions ? 'auto' : 'normal');
    const resolvedModel = model || agent.model;
    if (resolvedModel && !/^[a-zA-Z0-9._:/-]+$/.test(resolvedModel)) {
      sendJson({ error: 'Invalid model name' }, 400);
      return;
    }

    let finalPrompt = prompt;
    if (agent.skills && agent.skills.length > 0 && !isSuperAgentApi) {
      const skillsList = agent.skills.join(', ');
      finalPrompt = `[IMPORTANT: Use these skills for this session: ${skillsList}. Invoke them with /<skill-name> when relevant to the task.] ${prompt}`;
    }

    // Resolve the absolute claude binary path. node-pty/ConPTY does not apply
    // PATHEXT, so a bare 'claude' fails on Windows ('Cannot create process,
    // error code: 2'). Same fix as ipc-handlers agent:start (#BUG-009/010).
    const claudeFromSettings = getProvider('claude').resolveBinaryPath(ctx.getAppSettings());
    let claudeBinary = claudeFromSettings;
    if (!path.isAbsolute(claudeBinary)) {
      const found = await findCli(claudeBinary);
      if (found) claudeBinary = found;
    }

    // Build args natively as a string[] — no shell escape semantics needed.
    const args: string[] = [];
    if (usePrintMode) args.push('-p');
    if (isSuperAgentApi || isAutomationAgent) {
      const mcpConfigPath = path.join(app.getPath('home'), '.claude', 'mcp.json');
      if (fs.existsSync(mcpConfigPath)) args.push('--mcp-config', mcpConfigPath);
    }
    if (agent.secondaryProjectPath) args.push('--add-dir', agent.secondaryProjectPath);
    if (effectiveMode === 'auto' || effectiveMode === 'bypass') args.push('--dangerously-skip-permissions');
    if (resolvedModel) args.push('--model', resolvedModel);
    args.push(finalPrompt);

    const fullPath = buildFullPath();
    const spawnCwd = fs.existsSync(workingDir) ? workingDir : os.homedir();

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(claudeBinary, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: spawnCwd,
        env: {
          ...process.env,
          PATH: fullPath,
          TERM: 'xterm-256color',
          CLAUDE_SKILLS: agent.skills?.join(',') || '',
          CLAUDE_AGENT_ID: agent.id,
          CLAUDE_PROJECT_PATH: agent.projectPath,
        },
        ...getPtyPlatformOptions(),
      });
    } catch (spawnErr) {
      sendJson({ error: `Failed to start agent: ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}` }, 500);
      return;
    }

    const ptyId = uuidv4();
    ptyProcesses.set(ptyId, ptyProcess);

    agent.ptyId = ptyId;
    agent.status = 'running';
    agent.currentTask = prompt;
    agent.output = [];
    agent.lastCleanOutput = undefined;  // Clear stale output from previous task
    agent.error = undefined;            // Clear previous error state
    agent.lastActivity = new Date().toISOString();
    saveAgents();

    ptyProcess.onData((data: string) => {
      agent.output.push(data);
      if (agent.output.length > 10000) {
        agent.output = agent.output.slice(-5000);
      }
      agent.lastActivity = new Date().toISOString();

      if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
        ctx.mainWindow.webContents.send('agent:output', { agentId: agent.id, data });
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      // Delay status change to let hooks (on-stop.sh, task-completed.sh) finish
      // capturing output before wait_for_agent resolves.
      setTimeout(() => {
        if (agent.status === 'running') {
          agent.status = exitCode === 0 ? 'completed' : 'error';
        }
        if (exitCode !== 0) {
          agent.error = `Process exited with code ${exitCode}`;
        }
        agent.lastActivity = new Date().toISOString();
        ptyProcesses.delete(ptyId);
        saveAgents();
        ctx.agentStatusEmitter.emit(`status:${agent.id}`);
      }, 1500);
    });

    sendJson({ success: true, agent: { id: agent.id, status: agent.status } });
  });

  // POST /api/agents/:id/stop
  app_.post(/^\/api\/agents\/([^/]+)\/stop$/, (req, sendJson) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      sendJson({ error: 'Agent not found' }, 404);
      return;
    }

    if (agent.ptyId) {
      const ptyProcess = ptyProcesses.get(agent.ptyId);
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcesses.delete(agent.ptyId);
      }
    }
    agent.status = 'idle';
    agent.currentTask = undefined;
    agent.lastActivity = new Date().toISOString();
    saveAgents();
    ctx.agentStatusEmitter.emit(`status:${agent.id}`);
    sendJson({ success: true });
  });

  // POST /api/agents/:id/message
  app_.post(/^\/api\/agents\/([^/]+)\/message$/, async (req, sendJson) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      sendJson({ error: 'Agent not found' }, 404);
      return;
    }

    const { message } = req.body as { message: string };
    if (!message) {
      sendJson({ error: 'message is required' }, 400);
      return;
    }

    if (!agent.ptyId || !ptyProcesses.has(agent.ptyId)) {
      const ptyId = await ctx.initAgentPtyCallback(agent);
      agent.ptyId = ptyId;
    }

    const ptyProcess = ptyProcesses.get(agent.ptyId);
    if (ptyProcess) {
      writeProgrammaticInput(ptyProcess, message, true);
      agent.status = 'running';
      agent.lastActivity = new Date().toISOString();
      saveAgents();
      sendJson({ success: true });
      return;
    }
    sendJson({ error: 'Failed to send message - PTY not available' }, 500);
  });

  // DELETE /api/agents/:id
  app_.delete(/^\/api\/agents\/([^/]+)$/, (req, sendJson) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      sendJson({ error: 'Agent not found' }, 404);
      return;
    }

    if (agent.ptyId) {
      const ptyProcess = ptyProcesses.get(agent.ptyId);
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcesses.delete(agent.ptyId);
      }
    }
    agents.delete(req.params.id);
    saveAgents();
    sendJson({ success: true });
  });
}
