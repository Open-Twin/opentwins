import Bree from 'bree';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OpenTwinsConfig } from '../config/schema.js';

function findWorker(name: string): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Try common locations
  const candidates = [
    resolve(__dirname, name),                              // dist/pipeline-runner.js
    resolve(__dirname, 'src', 'scheduler', name),          // dist/src/scheduler/pipeline-runner.js
    resolve(__dirname, '..', 'dist', 'src', 'scheduler', name),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Walk up
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const c = resolve(dir, 'dist', 'src', 'scheduler', name);
    if (existsSync(c)) return c;
    dir = resolve(dir, '..');
  }
  return resolve(__dirname, name); // Fallback
}

// Module-level registry so the UI server can reload the scheduler in-place
// after config changes (e.g. interval tweak) without tearing down the host
// process — which would also kill the UI server itself.
let activeScheduler: Bree | null = null;

export function setActiveScheduler(s: Bree | null): void {
  activeScheduler = s;
}

export function getActiveScheduler(): Bree | null {
  return activeScheduler;
}

export async function reloadActiveScheduler(config: OpenTwinsConfig): Promise<boolean> {
  if (!activeScheduler) return false;
  await activeScheduler.stop();
  const next = createScheduler(config);
  await next.start();
  activeScheduler = next;
  return true;
}

export function createScheduler(config: OpenTwinsConfig): Bree {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs: any[] = [];

  // Pipeline job (morning sequence) — only if pipeline enabled AND at least one agent is auto-running
  const hasAutoRunAgents = config.platforms.some((p) => p.enabled && p.auto_run);
  if (config.pipeline_enabled && hasAutoRunAgents) {
    const pipelineMinute = 45;
    const pipelineHour = Math.max(0, config.pipeline_start_hour - 2);

    jobs.push({
      name: 'pipeline',
      cron: `${pipelineMinute} ${pipelineHour} * * *`,
      timezone: config.timezone,
      worker: {
        workerData: {
          configJson: JSON.stringify(config),
        },
      },
      path: findWorker('pipeline-runner.js'),
    });
  }

  // Platform heartbeats - check every 5 minutes during active hours.
  // The agent-runner itself decides whether enough time has passed since
  // the last completed run (based on heartbeat_interval_minutes).
  // This decouples the scheduler from the interval logic.
  const enabledPlatforms = config.platforms.filter((p) => p.enabled && p.auto_run);
  const { start, end } = config.active_hours;
  enabledPlatforms.forEach((platform, index) => {
    // Stagger checks so agents don't all fire at the same minute
    const minuteOffset = (index * 2) % 5; // 0, 2, 4, 1, 3, ...

    jobs.push({
      name: platform.platform,
      cron: `${minuteOffset}/5 ${start}-${end} * * *`,
      timezone: config.timezone,
      worker: {
        workerData: {
          platform: platform.platform,
          configJson: JSON.stringify(config),
        },
      },
      path: findWorker('agent-runner.js'),
    });
  });

  // Custom logger: Bree calls `logger.info(msg, metadata)` where metadata is
  // often `undefined` (when `outputWorkerMetadata` isn't enabled), which
  // default-console prints as a trailing "undefined". Drop the 2nd arg when
  // it's nullish to keep the output clean.
  const cleanLogger = {
    info: (msg: unknown, meta?: unknown) => meta == null ? console.log(msg) : console.log(msg, meta),
    warn: (msg: unknown, meta?: unknown) => meta == null ? console.warn(msg) : console.warn(msg, meta),
    error: (msg: unknown, meta?: unknown) => meta == null ? console.error(msg) : console.error(msg, meta),
  };

  return new Bree({
    jobs,
    root: false,
    defaultExtension: 'js',
    logger: cleanLogger,
    errorHandler: (error: unknown, workerMetadata: { name: string }) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${workerMetadata.name}] Error:`, msg);
    },
    workerMessageHandler: (data: { message: unknown; name: string }) => {
      console.log(`[${data.name}]`, data.message);
    },
  });
}
