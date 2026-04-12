import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { VALID_CONFIG } from './fixtures/config.js';

let tmpDir: string;
const runClaudeAgentMock = vi.fn();

// Path overrides and a mocked runClaudeAgent so no real subprocess is spawned.
vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getLocksDir: () => resolve(tmpDir, 'locks'),
    getLockFile: (name: string) => resolve(tmpDir, 'locks', `${name}.lock`),
    getLastHeartbeatFile: (name: string) => resolve(tmpDir, 'locks', `${name}.last_heartbeat`),
    getWorkspacesDir: () => resolve(tmpDir, 'workspaces'),
    getPlatformWorkspaceDir: (platform: string) =>
      resolve(tmpDir, 'workspaces', `agent-${platform}`),
  };
});

vi.mock('../util/claude.js', () => ({
  runClaudeAgent: (opts: unknown) => runClaudeAgentMock(opts),
  validateAuth: vi.fn(async () => true),
  isClaudeInstalled: vi.fn(async () => true),
}));

function withHour(hour: number): void {
  const base = new Date(2026, 3, 11, hour, 0, 0);
  vi.useFakeTimers();
  vi.setSystemTime(base);
}

describe('scheduler/agent-runner runPlatformAgent', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-agentrun-'));
    mkdirSync(resolve(tmpDir, 'workspaces'), { recursive: true });
    mkdirSync(resolve(tmpDir, 'workspaces', 'agent-linkedin'), { recursive: true });
    runClaudeAgentMock.mockReset();
    runClaudeAgentMock.mockResolvedValue({ output: 'ok', durationMs: 100, exitCode: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips when current hour is before active_hours.start', async () => {
    withHour(2); // active_hours = 8..23 in VALID_CONFIG
    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin');
    expect(runClaudeAgentMock).not.toHaveBeenCalled();
  });

  it('skips when current hour is after active_hours.end', async () => {
    withHour(23 + 1);
    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin');
    expect(runClaudeAgentMock).not.toHaveBeenCalled();
  });

  it('runs when hour is at the start of active hours', async () => {
    withHour(8);
    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin');
    expect(runClaudeAgentMock).toHaveBeenCalledTimes(1);
  });

  it('skipActiveHoursCheck allows running outside the window', async () => {
    withHour(3);
    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin', {
      skipActiveHoursCheck: true,
      skipIntervalCheck: true,
    });
    expect(runClaudeAgentMock).toHaveBeenCalledTimes(1);
  });

  it('skips when last heartbeat was more recent than interval', async () => {
    withHour(12);
    // LinkedIn interval in VALID_CONFIG = 60 min. Pretend it ran 10 min ago.
    const hbFile = resolve(tmpDir, 'locks', 'linkedin.last_heartbeat');
    mkdirSync(resolve(tmpDir, 'locks'), { recursive: true });
    writeFileSync(hbFile, String(Date.now() - 10 * 60 * 1000), 'utf-8');

    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin');
    expect(runClaudeAgentMock).not.toHaveBeenCalled();
  });

  it('runs when last heartbeat is older than the interval', async () => {
    withHour(12);
    const hbFile = resolve(tmpDir, 'locks', 'linkedin.last_heartbeat');
    mkdirSync(resolve(tmpDir, 'locks'), { recursive: true });
    writeFileSync(hbFile, String(Date.now() - 2 * 60 * 60 * 1000), 'utf-8');

    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin');
    expect(runClaudeAgentMock).toHaveBeenCalledTimes(1);
  });

  it('passes auth config through to runClaudeAgent', async () => {
    withHour(12);
    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin', {
      skipActiveHoursCheck: true,
      skipIntervalCheck: true,
    });
    expect(runClaudeAgentMock).toHaveBeenCalledTimes(1);
    const call = runClaudeAgentMock.mock.calls[0][0];
    expect(call.auth).toEqual(VALID_CONFIG.auth);
    expect(call.workingDir).toContain('agent-linkedin');
    expect(call.model).toBe('sonnet');
  });

  it('releases the lock after running (so next call can acquire it)', async () => {
    withHour(12);
    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    const { acquireLock } = await import('../scheduler/lock.js');

    await runPlatformAgent(VALID_CONFIG, 'linkedin', {
      skipActiveHoursCheck: true,
      skipIntervalCheck: true,
    });

    // The lock should be released and re-acquirable.
    expect(acquireLock('linkedin')).toBe(true);
  });

  it('writes heartbeat completion timestamp on success', async () => {
    withHour(12);
    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin', {
      skipActiveHoursCheck: true,
      skipIntervalCheck: true,
    });

    const hbFile = resolve(tmpDir, 'locks', 'linkedin.last_heartbeat');
    expect(existsSync(hbFile)).toBe(true);
    const ts = parseInt(readFileSync(hbFile, 'utf-8'));
    expect(ts).toBeGreaterThan(0);
  });

  it('still writes heartbeat and releases lock even when agent throws', async () => {
    withHour(12);
    runClaudeAgentMock.mockResolvedValueOnce({ output: 'fail', durationMs: 1, exitCode: 3 });

    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await expect(
      runPlatformAgent(VALID_CONFIG, 'linkedin', {
        skipActiveHoursCheck: true,
        skipIntervalCheck: true,
      }),
    ).rejects.toThrow(/Agent exited with code 3/);

    const hbFile = resolve(tmpDir, 'locks', 'linkedin.last_heartbeat');
    expect(existsSync(hbFile)).toBe(true);

    // Lock released despite the throw.
    const { acquireLock } = await import('../scheduler/lock.js');
    expect(acquireLock('linkedin')).toBe(true);
  });

  it('skips if another process already holds the lock', async () => {
    withHour(12);
    // Simulate an in-flight run by taking the lock up front.
    const { acquireLock } = await import('../scheduler/lock.js');
    expect(acquireLock('linkedin')).toBe(true);

    const { runPlatformAgent } = await import('../scheduler/agent-runner.js');
    await runPlatformAgent(VALID_CONFIG, 'linkedin', {
      skipActiveHoursCheck: true,
      skipIntervalCheck: true,
    });

    expect(runClaudeAgentMock).not.toHaveBeenCalled();
  });
});
