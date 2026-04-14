import { workerData, parentPort, isMainThread } from 'node:worker_threads';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { runClaudeAgent } from '../util/claude.js';
import { getPlatformWorkspaceDir, getLastHeartbeatFile, getLocksDir, getLockFile } from '../util/paths.js';
import { acquireLock, releaseLock } from './lock.js';
import { resetLimitsIfNeeded } from './limits-reset.js';
import { fileLog, fileError } from '../util/logger.js';
import type { OpenTwinsConfig } from '../config/schema.js';

// Only run worker logic when executed as a Bree worker thread
if (!isMainThread && workerData?.configJson) {
  const config: OpenTwinsConfig = JSON.parse(workerData.configJson);
  const platform: string = workerData.platform;

  runPlatformAgent(config, platform)
    .then((ran) => {
      if (ran) parentPort?.postMessage(`${platform}: heartbeat complete`);
    })
    .catch((err) => parentPort?.postMessage(`${platform}: ERROR - ${err.message}`));
}

function getLastHeartbeatTime(platform: string): number {
  const file = getLastHeartbeatFile(platform);
  if (!existsSync(file)) return 0;
  try {
    return parseInt(readFileSync(file, 'utf-8').trim()) || 0;
  } catch {
    return 0;
  }
}

function writeHeartbeatTime(platform: string): void {
  const dir = getLocksDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getLastHeartbeatFile(platform), String(Date.now()), 'utf-8');
}

export async function runPlatformAgent(
  config: OpenTwinsConfig,
  platform: string,
  options?: { skipActiveHoursCheck?: boolean; skipIntervalCheck?: boolean }
): Promise<boolean> {
  // Check active hours (skip for manual runs)
  if (!options?.skipActiveHoursCheck) {
    const now = new Date();
    const hour = now.getHours();
    if (hour < config.active_hours.start || hour > config.active_hours.end) {
      return false;
    }
  }

  // Check interval since last completed run (skip for manual runs)
  if (!options?.skipIntervalCheck) {
    const platformConfig = config.platforms.find((p) => p.platform === platform);
    const intervalMs = ((platformConfig?.heartbeat_interval_minutes || 60) * 60 * 1000);
    const lastCompleted = getLastHeartbeatTime(platform);
    const elapsed = Date.now() - lastCompleted;
    if (lastCompleted > 0 && elapsed < intervalMs) {
      return false; // Not enough time since last completion
    }
  }

  // Reset daily/weekly limits if needed
  resetLimitsIfNeeded();

  // Acquire lock
  const locked = acquireLock(platform);
  if (!locked) {
    fileLog('agent', 'Skipped (locked)', { platform });
    return false;
  }

  const startTime = Date.now();
  fileLog('agent', 'Run started', { platform });

  try {
    const workspaceDir = getPlatformWorkspaceDir(platform);

    const result = await runClaudeAgent({
      workingDir: workspaceDir,
      model: 'sonnet',
      prompt: 'Execute your heartbeat. Follow HEARTBEAT.md step by step.',
      timeoutMs: 1800000,
      auth: config.auth,
      onSpawn: (pid) => {
        try { writeFileSync(getLockFile(platform), String(pid), 'utf-8'); } catch { /* best effort */ }
      },
    });

    if (result.exitCode !== 0) {
      throw new Error(`Agent exited with code ${result.exitCode}`);
    }

    fileLog('agent', 'Run completed', { platform, durationMs: Date.now() - startTime });
  } catch (err) {
    fileError('agent', 'Run failed', { platform, durationMs: Date.now() - startTime, error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    writeHeartbeatTime(platform);
    releaseLock(platform);
  }
  return true;
}
