import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getPidFile: () => resolve(tmpDir, 'opentwins.pid'),
  };
});

describe('Daemon lifecycle', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-daemon-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('isDaemonRunning returns false when pid file missing', async () => {
    const { isDaemonRunning } = await import('../scheduler/daemon.js');
    const result = await isDaemonRunning();
    expect(result).toBe(false);
  });

  it('isDaemonRunning returns true for current process pid', async () => {
    const { isDaemonRunning } = await import('../scheduler/daemon.js');
    writeFileSync(resolve(tmpDir, 'opentwins.pid'), String(process.pid), 'utf-8');
    const result = await isDaemonRunning();
    expect(result).toBe(true);
  });

  it('isDaemonRunning returns false for stale pid (non-existent process)', async () => {
    const { isDaemonRunning } = await import('../scheduler/daemon.js');
    // PID 999999 is almost certainly not a real process
    writeFileSync(resolve(tmpDir, 'opentwins.pid'), '999999', 'utf-8');
    const result = await isDaemonRunning();
    expect(result).toBe(false);
  });

  it('isDaemonRunning handles invalid pid file content', async () => {
    const { isDaemonRunning } = await import('../scheduler/daemon.js');
    writeFileSync(resolve(tmpDir, 'opentwins.pid'), 'not-a-number', 'utf-8');
    const result = await isDaemonRunning();
    expect(result).toBe(false);
  });

  it('stopDaemon returns false when no pid file exists', async () => {
    const { stopDaemon } = await import('../scheduler/daemon.js');
    const result = await stopDaemon();
    expect(result).toBe(false);
  });

  it('stopDaemon removes pid file even for dead pid', async () => {
    const { stopDaemon } = await import('../scheduler/daemon.js');
    const pidFile = resolve(tmpDir, 'opentwins.pid');
    writeFileSync(pidFile, '999999', 'utf-8');
    await stopDaemon();
    expect(existsSync(pidFile)).toBe(false);
  });

  it('stopDaemon removes pid file when pid is 0', async () => {
    const { stopDaemon } = await import('../scheduler/daemon.js');
    const pidFile = resolve(tmpDir, 'opentwins.pid');
    writeFileSync(pidFile, '0', 'utf-8');
    const result = await stopDaemon();
    expect(result).toBe(false);
    expect(existsSync(pidFile)).toBe(false);
  });

  it('start → isDaemonRunning → stop roundtrip (mocked spawn)', async () => {
    // Mock spawn to simulate a detached process that writes its own PID
    const pidFile = resolve(tmpDir, 'opentwins.pid');
    let mockChildPid = 0;

    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      return {
        ...actual,
        spawn: vi.fn(() => {
          // Simulate a child that writes its PID to the file after a brief delay
          mockChildPid = process.pid; // Use current PID so isDaemonRunning returns true
          setTimeout(() => {
            writeFileSync(pidFile, String(mockChildPid), 'utf-8');
          }, 50);
          return {
            pid: mockChildPid,
            unref: vi.fn(),
            on: vi.fn(),
          };
        }),
      };
    });

    // Import AFTER mock is set up
    const { startDaemon, isDaemonRunning, stopDaemon } = await import('../scheduler/daemon.js');

    // Start
    const pid = await startDaemon();
    expect(pid).toBeGreaterThan(0);

    // Check running
    const running = await isDaemonRunning();
    expect(running).toBe(true);

    // Stop
    const stopped = await stopDaemon();
    expect(stopped).toBe(true);
    expect(existsSync(pidFile)).toBe(false);

    vi.doUnmock('node:child_process');
  });
});
