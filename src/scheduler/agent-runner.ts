import { workerData, parentPort, isMainThread } from 'node:worker_threads';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { runClaudeAgent } from '../util/claude.js';
import { getPlatformWorkspaceDir, getLastHeartbeatFile, getLocksDir } from '../util/paths.js';
import { acquireLock, releaseLock } from './lock.js';
import { resetLimitsIfNeeded } from './limits-reset.js';
import type { OpenTwinsConfig } from '../config/schema.js';

// Only run worker logic when executed as a Bree worker thread
if (!isMainThread && workerData?.configJson) {
  const config: OpenTwinsConfig = JSON.parse(workerData.configJson);
  const platform: string = workerData.platform;

  runPlatformAgent(config, platform)
    .then(() => parentPort?.postMessage(`${platform}: heartbeat complete`))
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
): Promise<void> {
  // Check active hours (skip for manual runs)
  if (!options?.skipActiveHoursCheck) {
    const now = new Date();
    const hour = now.getHours();
    if (hour < config.active_hours.start || hour > config.active_hours.end) {
      return;
    }
  }

  // Check interval since last completed run (skip for manual runs)
  if (!options?.skipIntervalCheck) {
    const platformConfig = config.platforms.find((p) => p.platform === platform);
    const intervalMs = ((platformConfig?.heartbeat_interval_minutes || 60) * 60 * 1000);
    const lastCompleted = getLastHeartbeatTime(platform);
    const elapsed = Date.now() - lastCompleted;
    if (lastCompleted > 0 && elapsed < intervalMs) {
      return; // Not enough time since last completion
    }
  }

  // Reset daily/weekly limits if needed
  resetLimitsIfNeeded();

  // Acquire lock
  const locked = acquireLock(platform);
  if (!locked) {
    return;
  }

  try {
    const workspaceDir = getPlatformWorkspaceDir(platform);

    const result = await runClaudeAgent({
      workingDir: workspaceDir,
      model: 'sonnet',
      prompt: 'Execute your heartbeat. Follow HEARTBEAT.md step by step.',
      timeoutMs: 1800000,
      auth: config.auth,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Agent exited with code ${result.exitCode}`);
    }
  } finally {
    // Record completion time THEN release lock
    writeHeartbeatTime(platform);
    releaseLock(platform);
  }
}
