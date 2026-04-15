import Bree from 'bree';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getLastHeartbeatFile } from '../util/paths.js';
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

export interface SchedulerHandle {
  start(): Promise<void>;
  stop(name?: string): Promise<void>;
}

// Module-level registry so the UI server can reload the scheduler in-place
// after config changes (e.g. interval tweak) without tearing down the host
// process — which would also kill the UI server itself.
let activeScheduler: SchedulerHandle | null = null;

export function setActiveScheduler(s: SchedulerHandle | null): void {
  activeScheduler = s;
}

export function getActiveScheduler(): SchedulerHandle | null {
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

// How often the main-thread tick runs a pre-check across all platforms.
// Checks are cheap (1 fs.readFile + arithmetic per platform), so firing every
// minute gives 1-min latency on "becomes due" without the cost of spawning a
// worker thread per cron tick.
const TICK_MS = 60_000;

export function createScheduler(config: OpenTwinsConfig): SchedulerHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs: any[] = [];

  // Pipeline job (morning sequence) — only if pipeline enabled AND at least one agent is auto-running.
  // Keeps its cron: genuinely once-a-day scheduling.
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

  // Platform heartbeats — registered as manual Bree jobs (no cron/interval).
  // We fire them from a main-thread tick below that pre-checks active hours +
  // heartbeat_interval elapsed, so we never spawn a worker for a no-op cycle.
  const enabledPlatforms = config.platforms.filter((p) => p.enabled && p.auto_run);
  for (const platform of enabledPlatforms) {
    jobs.push({
      name: platform.platform,
      worker: {
        workerData: {
          platform: platform.platform,
          configJson: JSON.stringify(config),
        },
      },
      path: findWorker('agent-runner.js'),
    });
  }

  // Custom logger: silence Bree's per-worker lifecycle noise (online /
  // exited with code 0) — a worker spawn per due heartbeat plus the exit
  // line floods stdout. Keep non-zero exits, warnings, and errors visible.
  // Also drop trailing `undefined` that Bree passes when metadata isn't
  // configured.
  const isLifecycleNoise = (msg: unknown): boolean => {
    if (typeof msg !== 'string') return false;
    return / online$/.test(msg) || / exited with code 0/.test(msg);
  };
  // Bree logs "Job X is already running" as warn when we fire a platform
  // while its worker is still alive. That's expected — heartbeats can run
  // long. Silence it.
  const isAlreadyRunning = (msg: unknown): boolean => {
    const text = msg instanceof Error ? msg.message : (typeof msg === 'string' ? msg : '');
    return /is already running$/.test(text);
  };
  const cleanLogger = {
    info: (msg: unknown, meta?: unknown) => {
      if (isLifecycleNoise(msg)) return;
      meta == null ? console.log(msg) : console.log(msg, meta);
    },
    warn: (msg: unknown, meta?: unknown) => {
      if (isAlreadyRunning(msg)) return;
      meta == null ? console.warn(msg) : console.warn(msg, meta);
    },
    error: (msg: unknown, meta?: unknown) => meta == null ? console.error(msg) : console.error(msg, meta),
  };

  const bree = new Bree({
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

  let tickInterval: NodeJS.Timeout | null = null;

  function readLastHeartbeat(platform: string): number {
    const file = getLastHeartbeatFile(platform);
    try {
      if (!existsSync(file)) return 0;
      return parseInt(readFileSync(file, 'utf-8').trim()) || 0;
    } catch {
      return 0;
    }
  }

  function tick(): void {
    const hour = new Date().getHours();
    if (hour < config.active_hours.start || hour > config.active_hours.end) return;
    for (const platform of enabledPlatforms) {
      const lastCompleted = readLastHeartbeat(platform.platform);
      const intervalMs = (platform.heartbeat_interval_minutes || 60) * 60 * 1000;
      if (lastCompleted > 0 && Date.now() - lastCompleted < intervalMs) continue;
      // Fire — bree.run will log "already running" (filtered) if worker is
      // still alive from a previous tick; not our problem here.
      bree.run(platform.platform).catch(() => { /* best effort */ });
    }
  }

  return {
    async start() {
      await bree.start();
      if (enabledPlatforms.length > 0) {
        // Fire once immediately so newly-due agents don't wait up to TICK_MS.
        tick();
        tickInterval = setInterval(tick, TICK_MS);
      }
    },
    async stop(name?: string) {
      if (!name && tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      return bree.stop(name);
    },
  };
}
