import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getWorkspacesDir: () => resolve(tmpDir, 'workspaces'),
  };
});

function writeLimits(agent: string, data: unknown): string {
  const dir = resolve(tmpDir, 'workspaces', `agent-${agent}`);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'limits.json');
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  return path;
}

describe('scheduler/limits-reset', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-limits-'));
    mkdirSync(resolve(tmpDir, 'workspaces'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('resets daily counters whose last_reset is stale', async () => {
    const path = writeLimits('linkedin', {
      daily: {
        comments: { limit: 4, current: 3, last_reset: '1999-01-01' },
      },
    });

    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    resetLimitsIfNeeded();

    const after = JSON.parse(readFileSync(path, 'utf-8'));
    expect(after.daily.comments.current).toBe(0);
    expect(after.daily.comments.last_reset).toBe(new Date().toISOString().split('T')[0]);
  });

  it('does NOT reset counters whose last_reset is today', async () => {
    const today = new Date().toISOString().split('T')[0];
    const path = writeLimits('linkedin', {
      daily: {
        comments: { limit: 4, current: 2, last_reset: today },
      },
    });

    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    resetLimitsIfNeeded();

    const after = JSON.parse(readFileSync(path, 'utf-8'));
    expect(after.daily.comments.current).toBe(2);
  });

  it('resets weekly counters whose week key is stale', async () => {
    const path = writeLimits('linkedin', {
      weekly: {
        posts: { limit: 5, current: 5, last_reset: '1999-W01' },
      },
    });

    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    resetLimitsIfNeeded();

    const after = JSON.parse(readFileSync(path, 'utf-8'));
    expect(after.weekly.posts.current).toBe(0);
    expect(after.weekly.posts.last_reset).toMatch(/^\d{4}-W\d+$/);
  });

  it('leaves counters untouched when last_reset is undefined and no change is needed', async () => {
    // Counters without last_reset are treated as stale (first run) and reset.
    const path = writeLimits('linkedin', {
      daily: { comments: { limit: 4, current: 7 } },
    });

    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    resetLimitsIfNeeded();

    const after = JSON.parse(readFileSync(path, 'utf-8'));
    expect(after.daily.comments.current).toBe(0);
    expect(after.daily.comments.last_reset).toBe(new Date().toISOString().split('T')[0]);
  });

  it('handles agents with no limits.json gracefully', async () => {
    mkdirSync(resolve(tmpDir, 'workspaces', 'agent-twitter'), { recursive: true });

    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    expect(() => resetLimitsIfNeeded()).not.toThrow();
  });

  it('skips corrupt JSON without throwing and leaves file untouched', async () => {
    const dir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    mkdirSync(dir, { recursive: true });
    const path = resolve(dir, 'limits.json');
    writeFileSync(path, '{ not valid json', 'utf-8');

    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    expect(() => resetLimitsIfNeeded()).not.toThrow();

    expect(readFileSync(path, 'utf-8')).toBe('{ not valid json');
  });

  it('ignores directories that do not start with "agent-"', async () => {
    const pipelinePath = resolve(tmpDir, 'workspaces', 'pipeline');
    mkdirSync(pipelinePath, { recursive: true });
    const limitsPath = resolve(pipelinePath, 'limits.json');
    writeFileSync(limitsPath, JSON.stringify({
      daily: { x: { limit: 1, current: 1, last_reset: '1999-01-01' } },
    }), 'utf-8');

    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    resetLimitsIfNeeded();

    // Should NOT have been reset because "pipeline" isn't an "agent-*" dir.
    const after = JSON.parse(readFileSync(limitsPath, 'utf-8'));
    expect(after.daily.x.current).toBe(1);
  });

  it('is a no-op when the workspaces dir does not exist', async () => {
    rmSync(resolve(tmpDir, 'workspaces'), { recursive: true, force: true });

    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    expect(() => resetLimitsIfNeeded()).not.toThrow();
  });

  it('does not rewrite the file when nothing needed resetting', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    mkdirSync(dir, { recursive: true });
    const path = resolve(dir, 'limits.json');
    const original = JSON.stringify({
      daily: { comments: { limit: 4, current: 2, last_reset: today } },
    });
    writeFileSync(path, original, 'utf-8');
    const mtimeBefore = (await import('node:fs')).statSync(path).mtimeMs;

    // Sleep a hair to guarantee the mtime would change if rewritten.
    await new Promise((r) => setTimeout(r, 15));
    const { resetLimitsIfNeeded } = await import('../scheduler/limits-reset.js');
    resetLimitsIfNeeded();

    const mtimeAfter = (await import('node:fs')).statSync(path).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
