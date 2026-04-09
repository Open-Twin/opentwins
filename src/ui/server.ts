import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { getDb } from '../db/index.js';
import { loadConfig } from '../config/loader.js';
import { isDaemonRunning, startDaemon, stopDaemon } from '../scheduler/daemon.js';
import { getQualityMetrics, getDisagreementRatio } from './api/quality.js';
import { handleUpdateConfig } from './api/config.js';
import { handleListAgents, handleGetAgent, handleRunAgent, handleStopAgent, handleUpdateLimits, handleUpdateAgent } from './api/agents.js';
import * as log from '../util/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startDashboard(port: number): Promise<void> {
  const app = express();
  app.use(express.json());

  // API routes
  app.get('/api/activity', (req, res) => {
    const { platform, date } = req.query;
    const targetDate = (date as string) || new Date().toISOString().split('T')[0];

    let rows;
    if (platform) {
      rows = getDb()
        .prepare(
          "SELECT * FROM activity_logs WHERE platform = ? AND date(created_at) = ? ORDER BY created_at DESC"
        )
        .all(platform, targetDate);
    } else {
      rows = getDb()
        .prepare("SELECT * FROM activity_logs WHERE date(created_at) = ? ORDER BY created_at DESC")
        .all(targetDate);
    }
    res.json(rows);
  });

  app.get('/api/status', async (_req, res) => {
    const config = loadConfig();
    const running = await isDaemonRunning();
    const today = new Date().toISOString().split('T')[0];

    const recentRuns = getDb()
      .prepare("SELECT * FROM agent_runs WHERE date(started_at) = ? ORDER BY started_at DESC LIMIT 50")
      .all(today);

    // Compute next pipeline run time
    const pipelineHour = Math.max(0, config.pipeline_start_hour - 2);
    const now = new Date();
    const nextPipeline = new Date(now);
    nextPipeline.setHours(pipelineHour, 45, 0, 0);
    if (nextPipeline <= now) nextPipeline.setDate(nextPipeline.getDate() + 1);

    // Compute next heartbeat times per platform
    const enabledPlatforms = config.platforms.filter((p) => p.enabled);
    const platformSchedules = enabledPlatforms.map((p, i) => {
      const minuteOffset = (i * 10) % 60;
      const nextRun = new Date(now);
      nextRun.setMinutes(minuteOffset, 0, 0);
      if (nextRun <= now || nextRun.getHours() < config.active_hours.start || nextRun.getHours() > config.active_hours.end) {
        // Next hour
        nextRun.setHours(nextRun.getHours() + 1, minuteOffset, 0, 0);
      }
      if (nextRun.getHours() > config.active_hours.end) {
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(config.active_hours.start, minuteOffset, 0, 0);
      }
      return { platform: p.platform, nextRun: nextRun.toISOString() };
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
    try {
      const config = loadConfig();
      const safe = { ...config, auth: { ...config.auth, claude_token: '***', api_key: '***' } };
      res.json(safe);
    } catch {
      res.status(500).json({ error: 'Failed to load config' });
    }
  });

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

  app.listen(port, () => {
    log.success(`Dashboard running at http://localhost:${port}`);
  });
}
