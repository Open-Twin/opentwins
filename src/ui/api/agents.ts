import type { Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { getPlatformWorkspaceDir, getLockFile, getBrowserProfilesConfigPath, getConfigPath, getLastHeartbeatFile, getLocksDir } from '../../util/paths.js';
import { PLATFORM_TYPES, PLATFORM_API_KEYS } from '../../util/platform-types.js';
import { loadConfig, configExists } from '../../config/loader.js';
import { findLatestSessionFile, extractEventsFromSession } from '../../util/session-parser.js';
import { setupProfile, confirmProfile } from '../../browser/manager.js';

// ── Helpers ───────────────────────────────────────────────────

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function readText(path: string, maxLen = 500): string {
  if (!existsSync(path)) return '';
  try { const t = readFileSync(path, 'utf-8'); return t.length > maxLen ? t.slice(0, maxLen) + '...' : t; } catch { return ''; }
}

function isLocked(platform: string): boolean {
  const lockFile = getLockFile(platform);
  if (!existsSync(lockFile)) return false;
  try {
    const pid = parseInt(readFileSync(lockFile, 'utf-8').trim());
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasBrowserProfile(platform: string): boolean {
  const configPath = getBrowserProfilesConfigPath();
  if (!existsSync(configPath)) return false;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.profiles?.some((p: { platform: string }) => p.platform === platform) ?? false;
  } catch {
    return false;
  }
}

export type AgentState = 'needs_setup' | 'needs_api_keys' | 'ready' | 'running' | 'completed' | 'failed' | 'disabled';

function hasRequiredApiKeys(platform: string, apiKeys?: Record<string, string>): boolean {
  const required = PLATFORM_API_KEYS[platform as keyof typeof PLATFORM_API_KEYS];
  if (!required) return true; // Platform doesn't need API keys
  return required.every((r) => apiKeys?.[r.key] && apiKeys[r.key].length > 0);
}

function getAgentState(platform: string, enabled: boolean, apiKeys?: Record<string, string>, lastRunStatus?: string): AgentState {
  if (!enabled) return 'disabled';
  if (!hasBrowserProfile(platform)) return 'needs_setup';
  if (!hasRequiredApiKeys(platform, apiKeys)) return 'needs_api_keys';
  if (isLocked(platform)) return 'running';
  if (lastRunStatus === 'failed') return 'failed';
  if (lastRunStatus === 'completed') return 'completed';
  return 'ready';
}

// Track running agents and their output
const runningAgents = new Set<string>();
const agentLogs: Record<string, { output: string; startedAt: string; completedAt?: string; exitCode?: number }> = {};

// ── GET /api/agents ───────────────────────────────────────────

export function handleListAgents(_req: Request, res: Response): void {
  if (!configExists()) {
    res.json([]);
    return;
  }
  try {
    const config = loadConfig();
    const agents = config.platforms.map((p) => {
      const dir = getPlatformWorkspaceDir(p.platform);
      const hasWorkspace = existsSync(dir);
      const browser = hasBrowserProfile(p.platform);
      const running = isLocked(p.platform) || runningAgents.has(p.platform);
      const limits = hasWorkspace ? readJson(resolve(dir, 'limits.json')) : null;

      return {
        platform: p.platform,
        handle: p.handle,
        enabled: p.enabled,
        browserConfigured: browser,
        hasWorkspace,
        running,
        state: running ? 'running' as AgentState : getAgentState(p.platform, p.enabled, p.api_keys),
        limits,
      };
    });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list agents' });
  }
}

// ── GET /api/agents/:platform ─────────────────────────────────

export function handleGetAgent(req: Request, res: Response): void {
  const platform = req.params.platform as string;
  if (!PLATFORM_TYPES.includes(platform as any)) {
    res.status(400).json({ error: `Unknown platform: ${platform}` });
    return;
  }
  if (!configExists()) {
    res.status(404).json({ error: 'Not configured' });
    return;
  }

  const config = loadConfig();
  const platformConfig = config.platforms.find((p) => p.platform === platform);
  const enabled = platformConfig?.enabled ?? false;
  const dir = getPlatformWorkspaceDir(platform);
  const hasWorkspace = existsSync(dir);
  const browser = hasBrowserProfile(platform);
  const running = isLocked(platform) || runningAgents.has(platform);

  const limits = hasWorkspace ? readJson(resolve(dir, 'limits.json')) : null;
  const schedule = hasWorkspace ? readJson(resolve(dir, 'schedule.json')) : null;
  const queries = hasWorkspace ? readJson(resolve(dir, 'queries.json')) : null;
  const insights = hasWorkspace ? readText(resolve(dir, 'INSIGHTS.md'), 1000) : '';

  res.json({
    platform,
    handle: platformConfig?.handle || '',
    heartbeat_interval_minutes: platformConfig?.heartbeat_interval_minutes || 60,
    workspace: dir,
    enabled,
    browserConfigured: browser,
    hasWorkspace,
    running,
    state: running ? 'running' as AgentState : getAgentState(platform, enabled, platformConfig?.api_keys),
    limits,
    schedule,
    queries,
    insights,
    behavior: platformConfig?.behavior || {
      style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 },
      disagree_target_pct: 25,
      brand_mention_every_n: 5,
      max_word_count: 80,
    },
    api_keys: platformConfig?.api_keys || {},
    requiredApiKeys: PLATFORM_API_KEYS[platform as keyof typeof PLATFORM_API_KEYS] || null,
    lastRun: agentLogs[platform] || null,
  });
}

// ── POST /api/agents/:platform/run ────────────────────────────

export async function handleRunAgent(req: Request, res: Response): Promise<void> {
  const platform = req.params.platform as string;
  if (!PLATFORM_TYPES.includes(platform as any)) {
    res.status(400).json({ error: `Unknown platform: ${platform}` });
    return;
  }

  const config = loadConfig();
  const platformConfig = config.platforms.find((p) => p.platform === platform);

  if (!hasBrowserProfile(platform)) {
    res.status(400).json({
      error: 'Browser not configured',
      hint: `Run: opentwins browser setup ${platform}`,
    });
    return;
  }

  if (!hasRequiredApiKeys(platform, platformConfig?.api_keys)) {
    const required = PLATFORM_API_KEYS[platform as keyof typeof PLATFORM_API_KEYS];
    res.status(400).json({
      error: 'API keys not configured',
      hint: `Set API keys for ${platform} in the Agents page`,
      requiredKeys: required?.map((r) => r.key),
    });
    return;
  }

  if (isLocked(platform) || runningAgents.has(platform)) {
    res.status(409).json({ error: 'Agent is already running' });
    return;
  }

  if (!platformConfig?.enabled) {
    res.status(400).json({ error: 'Agent is disabled. Enable it first.' });
    return;
  }

  // Spawn as child process, capture output
  try {
    const child = spawn('opentwins', ['run', platform], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    child.unref();

    runningAgents.add(platform);
    agentLogs[platform] = { output: '', startedAt: new Date().toISOString() };

    // Capture stdout/stderr
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString(); });

    child.on('exit', (code) => {
      runningAgents.delete(platform);
      agentLogs[platform] = {
        output: output.slice(-5000), // Keep last 5KB
        startedAt: agentLogs[platform]?.startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        exitCode: code ?? 1,
      };

      // Write heartbeat completion time so the interval timer starts from now
      try {
        const dir = getLocksDir();
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(getLastHeartbeatFile(platform), String(Date.now()), 'utf-8');
      } catch { /* best effort */ }
    });

    // Safety timeout
    setTimeout(() => { runningAgents.delete(platform); }, 1800000);

    res.json({ ok: true, message: `${platform} agent started (PID ${child.pid})` });
  } catch (err) {
    res.status(500).json({ error: `Failed to start agent: ${err instanceof Error ? err.message : err}` });
  }
}

// ── POST /api/agents/:platform/stop ───────────────────────────

export async function handleStopAgent(req: Request, res: Response): Promise<void> {
  const platform = req.params.platform as string;
  const lockFile = getLockFile(platform);

  const isTracked = runningAgents.has(platform);
  const hasLock = existsSync(lockFile);

  if (!isTracked && !hasLock) {
    res.status(400).json({ error: 'Agent is not running' });
    return;
  }

  runningAgents.delete(platform);

  if (hasLock) {
    try {
      const pid = parseInt(readFileSync(lockFile, 'utf-8').trim());
      // Don't kill our own process!
      if (pid === process.pid) {
        unlinkSync(lockFile);
        res.json({ ok: true, message: 'Cleared stale lock (was server PID)' });
        return;
      }
      // Check if alive before killing
      try {
        process.kill(pid, 0); // test if alive
        process.kill(pid, 'SIGTERM');
      } catch {
        // Process already dead, clean up lock
        unlinkSync(lockFile);
      }
    } catch {
      try { unlinkSync(lockFile); } catch {}
    }
  }

  // Stop the browser for this platform
  try {
    const { stopChrome } = await import('../../browser/chrome.js');
    stopChrome(`ot-${platform}`);
  } catch { /* best effort */ }

  res.json({ ok: true, message: `Stopped ${platform} agent and browser` });
}

// ── PUT /api/agents/:platform/limits ──────────────────────────

export function handleUpdateLimits(req: Request, res: Response): void {
  const platform = req.params.platform as string;
  const dir = getPlatformWorkspaceDir(platform);
  const limitsPath = resolve(dir, 'limits.json');

  if (!existsSync(dir)) {
    res.status(404).json({ error: `Workspace not found for ${platform}` });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Invalid body' });
    return;
  }

  const current = readJson(limitsPath) as Record<string, Record<string, Record<string, number>>> | null;
  const merged: Record<string, Record<string, Record<string, number>>> = {};

  for (const period of ['daily', 'weekly'] as const) {
    if (!body[period]) {
      if (current?.[period]) merged[period] = current[period];
      continue;
    }
    merged[period] = {};
    for (const [action, val] of Object.entries(body[period] as Record<string, { limit: number }>)) {
      const currentCounter = current?.[period]?.[action]?.current ?? 0;
      merged[period][action] = { limit: val.limit, current: currentCounter };
    }
  }

  writeFileSync(limitsPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  res.json({ ok: true });
}

// ── PUT /api/agents/:platform ─────────────────────────────────

export async function handleUpdateAgent(req: Request, res: Response): Promise<void> {
  const platform = req.params.platform as string;
  const dir = getPlatformWorkspaceDir(platform);

  if (!existsSync(dir)) {
    res.status(404).json({ error: `Workspace not found for ${platform}` });
    return;
  }

  const { limits, queries, behavior, heartbeat_interval_minutes } = req.body;

  if (heartbeat_interval_minutes !== undefined) {
    try {
      const { saveConfig } = await import('../../config/loader.js');
      const config = loadConfig();
      const platformIndex = config.platforms.findIndex((p) => p.platform === platform);
      if (platformIndex === -1) {
        res.status(404).json({ error: 'Platform not in config' });
        return;
      }
      const val = Math.max(15, Math.min(480, parseInt(heartbeat_interval_minutes) || 60));
      config.platforms[platformIndex].heartbeat_interval_minutes = val;
      saveConfig(config);
      res.json({ ok: true, heartbeat_interval_minutes: val });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save interval' });
    }
    return;
  }

  if (limits) {
    handleUpdateLimits({ ...req, body: limits } as Request, res);
    return;
  }

  if (queries) {
    writeFileSync(resolve(dir, 'queries.json'), JSON.stringify(queries, null, 2) + '\n', 'utf-8');
    res.json({ ok: true });
    return;
  }

  if (behavior) {
    // Update behavior in config.json and regenerate templates
    try {
      const { saveConfig } = await import('../../config/loader.js');
      const { generateAgentFiles } = await import('../../config/generator.js');
      const config = loadConfig();
      const platformIndex = config.platforms.findIndex((p) => p.platform === platform);
      if (platformIndex === -1) {
        res.status(404).json({ error: 'Platform not in config' });
        return;
      }
      config.platforms[platformIndex].behavior = behavior;
      saveConfig(config);
      await generateAgentFiles(config);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save behavior' });
    }
    return;
  }

  res.status(400).json({ error: 'Nothing to update. Send limits, queries, or behavior.' });
}

// ── GET /api/agents/:platform/feed ────────────────────────────
// Return parsed events from the most recent Claude session JSONL for an agent

export function handleGetAgentFeed(req: Request, res: Response): void {
  const platform = req.params.platform as string;
  if (!PLATFORM_TYPES.includes(platform as any)) {
    res.status(400).json({ error: `Unknown platform: ${platform}` });
    return;
  }

  const sessionFile = findLatestSessionFile(platform);
  if (!sessionFile) {
    res.json({ events: [], sessionFile: null });
    return;
  }

  try {
    const events = extractEventsFromSession(sessionFile);
    res.json({ events, sessionFile, totalEvents: events.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read session' });
  }
}

// ── POST /api/agents/:platform/browser-setup ──────────────────
// Launch Chrome with a dedicated profile for this platform so the user can log in.
// This calls the same setupProfile() used by `opentwins browser setup <platform>`.

export async function handleBrowserSetup(req: Request, res: Response): Promise<void> {
  const platform = req.params.platform as string;
  if (!PLATFORM_TYPES.includes(platform as any)) {
    res.status(400).json({ error: `Unknown platform: ${platform}` });
    return;
  }

  try {
    await setupProfile(platform);
    res.json({
      ok: true,
      message: `Chrome launched for ${platform}. Log in, then confirm.`,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Browser setup failed',
    });
  }
}

// ── POST /api/agents/:platform/browser-confirm ────────────────
// Called when the user clicks "I've logged in" — marks the browser profile as configured.

export function handleBrowserConfirm(req: Request, res: Response): void {
  const platform = req.params.platform as string;
  if (!PLATFORM_TYPES.includes(platform as any)) {
    res.status(400).json({ error: `Unknown platform: ${platform}` });
    return;
  }
  try {
    confirmProfile(platform);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Confirm failed' });
  }
}
