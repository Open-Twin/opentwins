import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getLocksDir: () => resolve(tmpDir, 'locks'),
    getLockFile: (name: string) => resolve(tmpDir, 'locks', `${name}.lock`),
  };
});

describe('scheduler/lock', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-lock-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('acquireLock succeeds when no lock exists and writes the current pid', async () => {
    const { acquireLock } = await import('../scheduler/lock.js');
    expect(acquireLock('linkedin')).toBe(true);

    const lockFile = resolve(tmpDir, 'locks', 'linkedin.lock');
    expect(existsSync(lockFile)).toBe(true);
    expect(parseInt(readFileSync(lockFile, 'utf-8'))).toBe(process.pid);
  });

  it('acquireLock creates the locks directory if missing', async () => {
    rmSync(resolve(tmpDir, 'locks'), { recursive: true, force: true });
    expect(existsSync(resolve(tmpDir, 'locks'))).toBe(false);

    const { acquireLock } = await import('../scheduler/lock.js');
    expect(acquireLock('twitter')).toBe(true);
    expect(existsSync(resolve(tmpDir, 'locks'))).toBe(true);
  });

  it('acquireLock refuses when an alive process already holds the lock', async () => {
    mkdirSync(resolve(tmpDir, 'locks'), { recursive: true });
    // Use the current process's pid — guaranteed to be alive.
    writeFileSync(resolve(tmpDir, 'locks', 'linkedin.lock'), String(process.pid), 'utf-8');

    const { acquireLock } = await import('../scheduler/lock.js');
    expect(acquireLock('linkedin')).toBe(false);
  });

  it('acquireLock reclaims a stale lock (dead pid)', async () => {
    mkdirSync(resolve(tmpDir, 'locks'), { recursive: true });
    // PID 999999 is almost certainly not a real process.
    writeFileSync(resolve(tmpDir, 'locks', 'linkedin.lock'), '999999', 'utf-8');

    const { acquireLock } = await import('../scheduler/lock.js');
    expect(acquireLock('linkedin')).toBe(true);

    // Reclaimed: lock file should now hold our pid.
    const pid = parseInt(readFileSync(resolve(tmpDir, 'locks', 'linkedin.lock'), 'utf-8'));
    expect(pid).toBe(process.pid);
  });

  it('acquireLock reclaims a corrupt lock file', async () => {
    mkdirSync(resolve(tmpDir, 'locks'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'locks', 'twitter.lock'), 'not-a-pid', 'utf-8');

    const { acquireLock } = await import('../scheduler/lock.js');
    expect(acquireLock('twitter')).toBe(true);
  });

  it('releaseLock removes an owned lock file', async () => {
    const { acquireLock, releaseLock } = await import('../scheduler/lock.js');
    acquireLock('linkedin');
    releaseLock('linkedin');

    expect(existsSync(resolve(tmpDir, 'locks', 'linkedin.lock'))).toBe(false);
  });

  it('releaseLock on a missing lock file is a no-op (does not throw)', async () => {
    const { releaseLock } = await import('../scheduler/lock.js');
    expect(() => releaseLock('never-locked')).not.toThrow();
  });

  it('acquire → release → acquire again succeeds', async () => {
    const { acquireLock, releaseLock } = await import('../scheduler/lock.js');
    expect(acquireLock('linkedin')).toBe(true);
    releaseLock('linkedin');
    expect(acquireLock('linkedin')).toBe(true);
  });

  it('locks are scoped per agent name', async () => {
    const { acquireLock } = await import('../scheduler/lock.js');
    expect(acquireLock('linkedin')).toBe(true);
    expect(acquireLock('twitter')).toBe(true);
    // Both held simultaneously — they do not conflict.
    expect(existsSync(resolve(tmpDir, 'locks', 'linkedin.lock'))).toBe(true);
    expect(existsSync(resolve(tmpDir, 'locks', 'twitter.lock'))).toBe(true);
  });
});
