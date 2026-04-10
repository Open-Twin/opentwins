import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { getLockFile, getLastHeartbeatFile } from '../util/paths.js';
import { getDb } from '../db/index.js';
import { loadConfig, configExists } from '../config/loader.js';
import { isDaemonRunning, startDaemon, stopDaemon } from '../scheduler/daemon.js';
import { getQualityMetrics, getDisagreementRatio } from './api/quality.js';
import { handleUpdateConfig } from './api/config.js';
import { handleListAgents, handleGetAgent, handleRunAgent, handleStopAgent, handleUpdateLimits, handleUpdateAgent, handleGetAgentFeed, handleBrowserSetup, handleBrowserConfirm } from './api/agents.js';
import { handleSetup, handleSetupStatus, handleValidateAuth } from './api/setup.js';
import { handleHealth } from './api/health.js';
import { handleUsage } from './api/usage.js';
import { getSessions } from '../util/session-parser.js';
import * as log from '../util/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getRunningPlatforms(platforms: string[]): Set<string> {
  const running = new Set<string>();
  for (const platform of platforms) {
    const lockFile = getLockFile(platform);
    if (!existsSync(lockFile)) continue;
    try {
      const pid = parseInt(readFileSync(lockFile, 'utf-8').trim());
      process.kill(pid, 0);
      running.add(platform);
    } catch {
      // stale lock, not running
    }
  }
  return running;
}

export async function startDashboard(port: number): Promise<void> {
  const app = express();
  app.use(express.json());

  // API routes — read agent sessions directly from Claude session JSONLs
  app.get('/api/activity', (req, res) => {
    const { platform, date } = req.query;
    const targetDate = (date as string) || new Date().toISOString().split('T')[0];

    if (!configExists()) {
      res.json({ sessions: [] });
      return;
    }

    try {
      const config = loadConfig();
      const platforms = platform
        ? config.platforms.filter((p) => p.platform === platform).map((p) => p.platform)
        : config.platforms.map((p) => p.platform);

      const runningPlatforms = getRunningPlatforms(platforms);
      const sessions = getSessions(platforms, targetDate, runningPlatforms);
      res.json({ sessions });
    } catch (err) {
      log.warn(`Activity read failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Activity read failed' });
    }
  });

  app.get('/api/status', async (_req, res) => {
    if (!configExists()) {
      res.json({ configured: false });
      return;
    }
    const config = loadConfig();
    const running = await isDaemonRunning();
    const today = new Date().toISOString().split('T')[0];

    // Derive recent runs from Claude sessions (one session = one run)
    const allPlatforms = config.platforms.map((p) => p.platform);
    const runningPlatforms = getRunningPlatforms(allPlatforms);
    const todaySessions = getSessions(allPlatforms, today, runningPlatforms);
    const recentRuns = todaySessions.slice(0, 50).map((s) => ({
      id: s.sessionId,
      agent_name: s.platform,
      status: s.status,
      started_at: s.startedAt,
      completed_at: s.status === 'completed' ? s.endedAt : null,
      duration_ms: s.durationMs,
      error: null,
    }));

    // Compute next pipeline run time
    const pipelineHour = Math.max(0, config.pipeline_start_hour - 2);
    const now = new Date();
    const nextPipeline = new Date(now);
    nextPipeline.setHours(pipelineHour, 45, 0, 0);
    if (nextPipeline <= now) nextPipeline.setDate(nextPipeline.getDate() + 1);

    // Compute next heartbeat times per platform
    // Next run = last completed + interval (not fixed cron boundaries)
    const enabledPlatforms = config.platforms.filter((p) => p.enabled);
    const platformSchedules = enabledPlatforms.map((p) => {
      const intervalMin = p.heartbeat_interval_minutes || 60;
      const intervalMs = intervalMin * 60 * 1000;
      const { start, end } = config.active_hours;

      // Read last heartbeat completion time
      const hbFile = getLastHeartbeatFile(p.platform);
      let lastCompleted = 0;
      try {
        if (existsSync(hbFile)) lastCompleted = parseInt(readFileSync(hbFile, 'utf-8').trim()) || 0;
      } catch { /* no file yet */ }

      let nextRun: Date;
      if (lastCompleted > 0) {
        // Next run = last completed + interval
        nextRun = new Date(lastCompleted + intervalMs);
      } else {
        // Never run before — next run is now (or start of active hours)
        nextRun = new Date(now);
      }

      // Ensure within active hours
      if (nextRun.getHours() > end || nextRun.getHours() < start) {
        // Push to start of next active window
        if (nextRun.getHours() > end) nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(start, 0, 0, 0);
      }

      // If nextRun is in the past, it means the agent is due now
      if (nextRun.getTime() < now.getTime()) {
        nextRun = new Date(now);
      }

      return { platform: p.platform, nextRun: nextRun.toISOString(), intervalMin };
    });

    res.json({
      daemon: running,
      timezone: config.timezone,
      activeHours: config.active_hours,
      pipelineEnabled: config.pipeline_enabled,
      pipelineStartHour: config.pipeline_start_hour,
      nextPipelineRun: config.pipeline_enabled ? nextPipeline.toISOString() : null,
      platforms: config.platforms.map((p) => ({
        platform: p.platform,
        enabled: p.enabled,
        handle: p.handle,
      })),
      platformSchedules,
      recentRuns,
    });
  });

  app.get('/api/config', (_req, res) => {
    if (!configExists()) {
      res.status(404).json({ error: 'Not configured' });
      return;
    }
    try {
      const config = loadConfig();
      const safe = { ...config, auth: { ...config.auth, claude_token: '***', api_key: '***' } };
      res.json(safe);
    } catch {
      res.status(500).json({ error: 'Failed to load config' });
    }
  });

  // Setup / onboarding
  app.get('/api/setup/status', (req, res) => handleSetupStatus(req, res));
  app.post('/api/setup/validate-auth', (req, res) => { handleValidateAuth(req, res); });
  app.post('/api/setup', (req, res) => { handleSetup(req, res); });

  // Live health monitor — OpenClaw gateway + Claude service status
  app.get('/api/health', (req, res) => { handleHealth(req, res); });

  // Token usage & cost report
  app.get('/api/usage', (req, res) => { handleUsage(req, res); });

  app.get('/api/quality', (req, res) => getQualityMetrics(req, res));
  app.get('/api/quality/disagreement', (req, res) => getDisagreementRatio(req, res));

  // Scheduler control
  app.post('/api/scheduler/start', async (_req, res) => {
    try {
      const running = await isDaemonRunning();
      if (running) {
        res.json({ ok: true, message: 'Scheduler already running' });
        return;
      }
      const pid = await startDaemon();
      res.json({ ok: true, message: `Scheduler started (PID ${pid})` });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start scheduler' });
    }
  });

  app.post('/api/scheduler/stop', async (_req, res) => {
    try {
      const stopped = await stopDaemon();
      res.json({ ok: true, stopped });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to stop scheduler' });
    }
  });

  // Config editing
  app.put('/api/config', (req, res) => { handleUpdateConfig(req, res); });

  // Agent lifecycle endpoints
  app.get('/api/agents', (req, res) => handleListAgents(req, res));
  app.get('/api/agents/:platform', (req, res) => handleGetAgent(req, res));
  app.get('/api/agents/:platform/feed', (req, res) => handleGetAgentFeed(req, res));
  app.post('/api/agents/:platform/browser-setup', (req, res) => { handleBrowserSetup(req, res); });
  app.post('/api/agents/:platform/browser-confirm', (req, res) => { handleBrowserConfirm(req, res); });
  app.post('/api/agents/:platform/run', (req, res) => { handleRunAgent(req, res); });
  app.post('/api/agents/:platform/stop', (req, res) => handleStopAgent(req, res));
  app.put('/api/agents/:platform/limits', (req, res) => handleUpdateLimits(req, res));
  app.put('/api/agents/:platform', (req, res) => handleUpdateAgent(req, res));

  // Serve static client files - find client dist by walking up to package root
  let clientDir = '';
  let searchDir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(searchDir, 'src', 'ui', 'client', 'dist');
    if (existsSync(resolve(candidate, 'index.html'))) {
      clientDir = candidate;
      break;
    }
    searchDir = resolve(searchDir, '..');
  }
  if (clientDir) {
    app.use(express.static(clientDir));
    app.get('*', (_req, res) => {
      res.sendFile(resolve(clientDir, 'index.html'));
    });
  } else {
    app.get('*', (_req, res) => {
      res.status(200).send(
        '<html><body style="background:#0a0a0a;color:#666;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">' +
        '<div style="text-align:center"><h2>OpenTwins Dashboard</h2><p>Client not built. Run: cd src/ui/client && npm run build</p></div>' +
        '</body></html>'
      );
    });
  }

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, () => {
      log.success(`Dashboard running at http://localhost:${port}`);
      resolve();
    });
    server.on('error', async (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log.warn(`Port ${port} is already in use. Stopping the old process…`);
        try {
          // Kill whatever is on the port and retry once
          const { execaCommand } = await import('execa');
          await execaCommand(`lsof -ti :${port} | xargs kill`, { shell: true, reject: false });
          await new Promise((r) => setTimeout(r, 1000));
          app.listen(port, () => {
            log.success(`Dashboard running at http://localhost:${port}`);
            resolve();
          });
        } catch {
          log.error(`Could not free port ${port}. Stop the other process manually.`);
          reject(err);
        }
      } else {
        reject(err);
      }
    });
  });
}
