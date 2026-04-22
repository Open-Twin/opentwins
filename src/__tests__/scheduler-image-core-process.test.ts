import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getPipelineWorkspaceDir: () => resolve(tmpDir, 'workspaces', 'pipeline'),
    getLogsDir: () => resolve(tmpDir, 'logs'),
  };
});

describe('scheduler/image-core-process', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-imgcore-'));
    vi.resetModules();
  });
  afterEach(async () => {
    const mod = await import('../scheduler/image-core-process.js');
    await mod.stopImageCore(500);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isImageCoreAvailable returns false when server.mjs is missing', async () => {
    const { isImageCoreAvailable } = await import('../scheduler/image-core-process.js');
    expect(isImageCoreAvailable()).toBe(false);
  });

  it('isImageCoreAvailable returns true when server.mjs exists', async () => {
    const imgDir = resolve(tmpDir, 'workspaces', 'pipeline', 'image-core');
    mkdirSync(imgDir, { recursive: true });
    writeFileSync(resolve(imgDir, 'server.mjs'), '// stub', 'utf-8');
    const { isImageCoreAvailable } = await import('../scheduler/image-core-process.js');
    expect(isImageCoreAvailable()).toBe(true);
  });

  it('startImageCore returns null and does not throw when server.mjs is missing', async () => {
    const { startImageCore, getImageCoreProcess } = await import('../scheduler/image-core-process.js');
    const proc = startImageCore();
    expect(proc).toBeNull();
    expect(getImageCoreProcess()).toBeNull();
  });

  it('startImageCore spawns a child and stopImageCore terminates it', async () => {
    const imgDir = resolve(tmpDir, 'workspaces', 'pipeline', 'image-core');
    mkdirSync(imgDir, { recursive: true });
    // Long-lived stub server: block on a never-resolving promise so the child
    // stays alive until we kill it. Avoids relying on Chrome/fonts/etc.
    writeFileSync(
      resolve(imgDir, 'server.mjs'),
      `await new Promise(() => {});`,
      'utf-8',
    );

    const { startImageCore, stopImageCore, getImageCoreProcess } = await import('../scheduler/image-core-process.js');
    const proc = startImageCore();
    expect(proc).not.toBeNull();
    expect(proc!.pid).toBeGreaterThan(0);
    expect(getImageCoreProcess()).toBe(proc);

    await stopImageCore(1500);
    expect(getImageCoreProcess()).toBeNull();
    // exitCode or signalCode should now be set (process is terminated)
    expect(proc!.killed || proc!.exitCode !== null || proc!.signalCode !== null).toBe(true);
  }, 10000);

  it('startImageCore is idempotent — second call returns existing child', async () => {
    const imgDir = resolve(tmpDir, 'workspaces', 'pipeline', 'image-core');
    mkdirSync(imgDir, { recursive: true });
    writeFileSync(resolve(imgDir, 'server.mjs'), `await new Promise(() => {});`, 'utf-8');

    const { startImageCore, stopImageCore } = await import('../scheduler/image-core-process.js');
    const first = startImageCore();
    const second = startImageCore();
    expect(second).toBe(first);
    await stopImageCore(1500);
  }, 10000);
});
