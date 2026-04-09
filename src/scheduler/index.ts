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

export function createScheduler(config: OpenTwinsConfig): Bree {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs: any[] = [];

  // Pipeline job (morning sequence)
  if (config.pipeline_enabled) {
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

  // Platform heartbeats (staggered within active hours)
  const enabledPlatforms = config.platforms.filter((p) => p.enabled);
  enabledPlatforms.forEach((platform, index) => {
    const minuteOffset = (index * 10) % 60;
    const { start, end } = config.active_hours;

    jobs.push({
      name: platform.platform,
      cron: `${minuteOffset} ${start}-${end} * * *`,
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

  return new Bree({
    jobs,
    root: false,
    defaultExtension: 'js',
    errorHandler: (error: unknown, workerMetadata: { name: string }) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${workerMetadata.name}] Error:`, msg);
    },
    workerMessageHandler: (data: { message: unknown; name: string }) => {
      console.log(`[${data.name}]`, data.message);
    },
  });
}
