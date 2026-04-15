import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { VALID_CONFIG } from './fixtures/config.js';

// Test the main-thread tick that drives platform heartbeats. We mock Bree
// with a minimal class that records run() calls, mock the heartbeat-file
// path into a temp dir, and drive the tick with fake timers.

let tmpDir: string;
const breeRunMock = vi.fn<(name: string) => Promise<void>>();
const breeStartMock = vi.fn<() => Promise<void>>();
const breeStopMock = vi.fn<(name?: string) => Promise<void>>();

vi.mock('bree', () => {
  return {
    default: class MockBree {
      constructor() { /* capture nothing — we test behavior, not registration */ }
      async start() { return breeStartMock(); }
      async stop(name?: string) { return breeStopMock(name); }
      async run(name: string) { return breeRunMock(name); }
    },
  };
});

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getLastHeartbeatFile: (name: string) => resolve(tmpDir, 'locks', `${name}.last_heartbeat`),
  };
});

// Helper: build a config with a single auto_run platform at a known interval.
// Default active_hours span the whole day so time-of-day doesn't affect the tick.
function configWith(platform: string, intervalMin: number) {
  return {
    ...VALID_CONFIG,
    active_hours: { start: 0, end: 23 },
    pipeline_enabled: false,
    platforms: [
      {
        ...VALID_CONFIG.platforms.find((p) => p.platform === platform)!,
        auto_run: true,
        heartbeat_interval_minutes: intervalMin,
      },
    ],
  };
}

function writeHeartbeat(platform: string, msAgo: number) {
  writeFileSync(
    resolve(tmpDir, 'locks', `${platform}.last_heartbeat`),
    String(Date.now() - msAgo),
    'utf-8',
  );
}

describe('scheduler tick', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-tick-'));
    mkdirSync(resolve(tmpDir, 'locks'), { recursive: true });
    breeRunMock.mockReset();
    breeStartMock.mockClear();
    breeStopMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fires bree.run after the heartbeat interval has elapsed', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    const handle = createScheduler(configWith('linkedin', 15));

    // Last heartbeat was 10 min ago — under 15 min interval.
    writeHeartbeat('linkedin', 10 * 60 * 1000);
    await handle.start();
    // Immediate tick on start: should NOT fire (only 10 min elapsed).
    expect(breeRunMock).not.toHaveBeenCalled();

    // Advance 5 minutes past the interval boundary. Tick fires every 60s,
    // so we'll have ~5 tick attempts; the one at t+5m should see 15m+ elapsed.
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(breeRunMock).toHaveBeenCalledWith('linkedin');

    await handle.stop();
  });

  it('skips bree.run while still within the interval', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    const handle = createScheduler(configWith('linkedin', 15));

    // Last heartbeat was 1 minute ago — nowhere near due.
    writeHeartbeat('linkedin', 60 * 1000);
    await handle.start();
    // Advance 10 minutes — still well under 15 min interval.
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(breeRunMock).not.toHaveBeenCalled();

    await handle.stop();
  });

  it('fires on start when no heartbeat file exists (first-run)', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    const handle = createScheduler(configWith('linkedin', 15));

    // No heartbeat written — lastCompleted = 0, agent is "due now".
    await handle.start();
    expect(breeRunMock).toHaveBeenCalledWith('linkedin');

    await handle.stop();
  });

  it('clears the tick interval on stop so it stops firing', async () => {
    const { createScheduler } = await import('../scheduler/index.js');
    const handle = createScheduler(configWith('linkedin', 15));

    // Never-run platform: initial tick fires once.
    await handle.start();
    expect(breeRunMock).toHaveBeenCalledTimes(1);

    // Stop and advance time — no further ticks should reach bree.run.
    await handle.stop();
    breeRunMock.mockClear();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(breeRunMock).not.toHaveBeenCalled();
  });
});
