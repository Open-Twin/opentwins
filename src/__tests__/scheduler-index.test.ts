import { describe, it, expect, vi, afterEach } from 'vitest';
import { VALID_CONFIG } from './fixtures/config.js';

// Bree constructs worker threads from real file paths on instantiation, so we
// mock it out and just capture the jobs/config it was handed.
const BreeCtor = vi.fn();
vi.mock('bree', () => {
  return {
    default: class MockBree {
      jobs: unknown[];
      opts: Record<string, unknown>;
      constructor(opts: { jobs: unknown[] } & Record<string, unknown>) {
        BreeCtor(opts);
        this.jobs = opts.jobs;
        this.opts = opts;
      }
      async start() { /* no-op */ }
      async stop() { /* no-op */ }
    },
  };
});

describe('scheduler/index createScheduler', () => {
  afterEach(() => {
    BreeCtor.mockReset();
  });

  it('registers one job per auto_run platform plus a pipeline job', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    createScheduler(VALID_CONFIG);

    expect(BreeCtor).toHaveBeenCalledTimes(1);
    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    const names = opts.jobs.map((j) => j.name);

    expect(names).toContain('pipeline');
    for (const p of VALID_CONFIG.platforms.filter((p) => p.enabled && p.auto_run)) {
      expect(names).toContain(p.platform);
    }
  });

  it('omits the pipeline job when pipeline_enabled is false', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    createScheduler({ ...VALID_CONFIG, pipeline_enabled: false });

    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    expect(opts.jobs.find((j) => j.name === 'pipeline')).toBeUndefined();
  });

  it('pipeline cron fires 2 hours before pipeline_start_hour at :45', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    createScheduler({ ...VALID_CONFIG, pipeline_enabled: true, pipeline_start_hour: 9 });

    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    const pipeline = opts.jobs.find((j) => j.name === 'pipeline') as { cron: string };
    expect(pipeline.cron).toBe('45 7 * * *');
  });

  it('clamps pipeline_start_hour of 0-1 to a non-negative hour', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    createScheduler({ ...VALID_CONFIG, pipeline_enabled: true, pipeline_start_hour: 1 });

    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    const pipeline = opts.jobs.find((j) => j.name === 'pipeline') as { cron: string };
    // Math.max(0, 1-2) = 0
    expect(pipeline.cron).toBe('45 0 * * *');
  });

  it('registers platform jobs as manual (no cron) — main-thread tick fires them', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    createScheduler(VALID_CONFIG);

    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    const platformJobs = opts.jobs.filter((j) => j.name !== 'pipeline');
    for (const job of platformJobs) {
      expect(job.cron).toBeUndefined();
      expect(job.interval).toBeUndefined();
      expect(job.timeout).toBeUndefined();
    }
  });

  it('passes platform and serialized config to each job via workerData', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    createScheduler({ ...VALID_CONFIG, timezone: 'Europe/London' });

    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    const linkedin = opts.jobs.find((j) => j.name === 'linkedin') as {
      worker: { workerData: { configJson: string; platform: string } };
    };
    expect(linkedin.worker.workerData.platform).toBe('linkedin');

    const parsed = JSON.parse(linkedin.worker.workerData.configJson);
    expect(parsed.name).toBe(VALID_CONFIG.name);
    expect(parsed.timezone).toBe('Europe/London');
  });

  it('skips disabled platforms', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    const config = {
      ...VALID_CONFIG,
      platforms: VALID_CONFIG.platforms.map((p) =>
        p.platform === 'twitter' ? { ...p, enabled: false } : p,
      ),
    };
    createScheduler(config);

    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    const names = opts.jobs.map((j) => j.name);
    expect(names).toContain('linkedin');
    expect(names).not.toContain('twitter');
  });

  it('skips platforms with auto_run=false', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    const config = {
      ...VALID_CONFIG,
      platforms: VALID_CONFIG.platforms.map((p) =>
        p.platform === 'twitter' ? { ...p, auto_run: false } : p,
      ),
    };
    createScheduler(config);

    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    const names = opts.jobs.map((j) => j.name);
    expect(names).toContain('linkedin');
    expect(names).not.toContain('twitter');
  });

  it('omits pipeline when no agents have auto_run even if pipeline_enabled', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    const config = {
      ...VALID_CONFIG,
      pipeline_enabled: true,
      platforms: VALID_CONFIG.platforms.map((p) => ({ ...p, auto_run: false })),
    };
    createScheduler(config);

    const opts = BreeCtor.mock.calls[0][0] as { jobs: Array<Record<string, unknown>> };
    const names = opts.jobs.map((j) => j.name);
    expect(names).not.toContain('pipeline');
    expect(opts.jobs).toHaveLength(0);
  });
});
