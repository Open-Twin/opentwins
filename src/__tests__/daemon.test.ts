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
    // Mock spawn to simulate a detached process that writes its own PID.
    // We MUST reset the module cache before doMock so daemon.js is re-imported
    // with our mocked node:child_process. Otherwise the prior import caches the
    // real spawn and ENOENT leaks as an unhandled exception.
    //
    // We ALSO stub process.kill — otherwise stopDaemon's negative-pid path
    // would send SIGTERM to our own process group and kill the test worker.
    const pidFile = resolve(tmpDir, 'opentwins.pid');
    const ourPid = process.pid;

    vi.resetModules();
    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      return {
        ...actual,
        spawn: vi.fn(() => {
          // Simulate a detached child that writes its PID into the file.
          writeFileSync(pidFile, String(ourPid), 'utf-8');
          return { pid: ourPid, unref: vi.fn(), on: vi.fn() };
        }),
      };
    });

    // Stub process.kill: signal 0 (alive check) returns true; real signals are no-ops.
    const realKill = process.kill.bind(process);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
      if (signal === 0) {
        // Keep normal aliveness-probing behavior only for our real pid check.
        if (pid === ourPid) return true;
        throw new Error('ESRCH');
      }
      // Swallow SIGTERM/SIGKILL — do NOT actually kill our own process.
      return true;
    }) as typeof process.kill);

    try {
      // Import AFTER mock is set up.
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
    } finally {
      killSpy.mockRestore();
      // Paranoia: ensure process.kill is fully restored.
      process.kill = realKill;
      vi.doUnmock('node:child_process');
      vi.resetModules();
    }
  });

  it('isDaemonRunning returns false when pid file is empty', async () => {
    const { isDaemonRunning } = await import('../scheduler/daemon.js');
    writeFileSync(resolve(tmpDir, 'opentwins.pid'), '', 'utf-8');
    expect(await isDaemonRunning()).toBe(false);
  });

  it('isDaemonRunning handles pid file with whitespace', async () => {
    const { isDaemonRunning } = await import('../scheduler/daemon.js');
    writeFileSync(resolve(tmpDir, 'opentwins.pid'), `  ${process.pid}  \n`, 'utf-8');
    expect(await isDaemonRunning()).toBe(true);
  });

  it('stopDaemon on already-dead pid leaves no pid file and returns truthy', async () => {
    const { stopDaemon } = await import('../scheduler/daemon.js');
    const pidFile = resolve(tmpDir, 'opentwins.pid');
    writeFileSync(pidFile, '999999', 'utf-8');

    // 999999 doesn't exist → process.kill throws, but stopDaemon swallows it
    // and still removes the pid file.
    await stopDaemon();
    expect(existsSync(pidFile)).toBe(false);
  });
});
