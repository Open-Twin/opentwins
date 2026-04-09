import { workerData, parentPort, isMainThread } from 'node:worker_threads';
import { runClaudeAgent } from '../util/claude.js';
import { getPlatformWorkspaceDir } from '../util/paths.js';
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

export async function runPlatformAgent(
  config: OpenTwinsConfig,
  platform: string,
  options?: { skipActiveHoursCheck?: boolean }
): Promise<void> {
  // Check active hours (skip for manual runs)
  if (!options?.skipActiveHoursCheck) {
    const now = new Date();
    const hour = now.getHours();
    if (hour < config.active_hours.start || hour > config.active_hours.end) {
      return;
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
    releaseLock(platform);
  }
}
