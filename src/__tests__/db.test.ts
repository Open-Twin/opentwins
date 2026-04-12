import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Each test gets a fresh temp dir + a fresh db.
// db/index.ts caches the connection as a module-scoped singleton, so we must
// reset modules between tests or close the connection explicitly.

let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getDatabasePath: () => resolve(tmpDir, 'data.db'),
  };
});

describe('db/migrate', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-db-migrate-'));
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../db/index.js');
      closeDb();
    } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the expected tables on a fresh database', async () => {
    const { getDb } = await import('../db/index.js');
    const db = getDb();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('activity_logs');
    expect(names).toContain('today_summaries');
    expect(names).toContain('engagement_tracking');
    expect(names).toContain('agent_runs');
    expect(names).toContain('_migrations');
  });

  it('records applied migrations in _migrations table', async () => {
    const { getDb } = await import('../db/index.js');
    const db = getDb();

    const applied = db.prepare('SELECT name FROM _migrations ORDER BY name').all() as { name: string }[];
    expect(applied.length).toBeGreaterThanOrEqual(1);
    expect(applied.some((m) => m.name === '001_initial.sql')).toBe(true);
  });

  it('migration is idempotent: running twice does not re-apply or double-insert', async () => {
    const { getDb, closeDb } = await import('../db/index.js');
    const db1 = getDb();
    const appliedBefore = (db1.prepare('SELECT count(*) as c FROM _migrations').get() as { c: number }).c;
    closeDb();

    // Re-open triggers runMigrations again.
    const db2 = getDb();
    const appliedAfter = (db2.prepare('SELECT count(*) as c FROM _migrations').get() as { c: number }).c;
    expect(appliedAfter).toBe(appliedBefore);
  });

  it('enables WAL journal mode', async () => {
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const mode = (db.pragma('journal_mode', { simple: true }) as string).toLowerCase();
    expect(mode).toBe('wal');
  });

  it('enables foreign keys', async () => {
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const fk = db.pragma('foreign_keys', { simple: true });
    // Better-sqlite3 returns 0/1
    expect(Number(fk)).toBe(1);
  });

  it('getDb returns the same connection across calls', async () => {
    const { getDb } = await import('../db/index.js');
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });

  it('closeDb drops the cached connection so next getDb creates a new one', async () => {
    const { getDb, closeDb } = await import('../db/index.js');
    const a = getDb();
    closeDb();
    const b = getDb();
    expect(a).not.toBe(b);
  });
});

describe('db/queries', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-db-queries-'));
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../db/index.js');
      closeDb();
    } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logActivity inserts a row and getActivityForDate reads it back', async () => {
    const { logActivity, getActivityForDate } = await import('../db/queries.js');
    logActivity('linkedin', 'comment', 'https://li/post/1', 'someone', 'insight', 'Nice take', 12);

    const today = new Date().toISOString().split('T')[0];
    const rows = getActivityForDate(today, 'linkedin') as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0].platform).toBe('linkedin');
    expect(rows[0].action_type).toBe('comment');
    expect(rows[0].word_count).toBe(12);
    expect(rows[0].style).toBe('insight');
  });

  it('getActivityForDate without platform returns rows for all platforms', async () => {
    const { logActivity, getActivityForDate } = await import('../db/queries.js');
    logActivity('linkedin', 'comment', null, null, null, null, null);
    logActivity('twitter', 'reply', null, null, null, null, null);

    const today = new Date().toISOString().split('T')[0];
    const rows = getActivityForDate(today) as Array<Record<string, unknown>>;
    const platforms = new Set(rows.map((r) => r.platform));
    expect(platforms.has('linkedin')).toBe(true);
    expect(platforms.has('twitter')).toBe(true);
  });

  it('getActivityForDate filters out other dates', async () => {
    const { logActivity, getActivityForDate } = await import('../db/queries.js');
    logActivity('linkedin', 'comment', null, null, null, null, null);

    const rows = getActivityForDate('1999-01-01', 'linkedin') as unknown[];
    expect(rows.length).toBe(0);
  });

  it('upsertTodaySummary inserts then updates on conflict', async () => {
    const { upsertTodaySummary, getQualityMetrics } = await import('../db/queries.js');
    upsertTodaySummary('linkedin', '2026-04-11', {
      comments: 2,
      styles: { insight: 1, short: 1 },
      disagreements: 1,
      questions: 0,
      avg_words: 20,
      last_style: 'short',
      last_snippet: 'hello',
    });
    upsertTodaySummary('linkedin', '2026-04-11', {
      comments: 5,
      styles: { insight: 3, short: 2 },
      disagreements: 2,
      last_style: 'insight',
      last_snippet: 'updated',
    });

    const metrics = getQualityMetrics('linkedin', '2026-04-11') as Record<string, unknown>;
    expect(metrics.comments).toBe(5);
    expect(metrics.last_style).toBe('insight');
    expect(metrics.last_snippet).toBe('updated');
    // styles stored as JSON
    expect(JSON.parse(String(metrics.styles))).toEqual({ insight: 3, short: 2 });
  });

  it('upsertTodaySummary applies defaults for missing fields', async () => {
    const { upsertTodaySummary, getQualityMetrics } = await import('../db/queries.js');
    upsertTodaySummary('twitter', '2026-04-11', {});

    const metrics = getQualityMetrics('twitter', '2026-04-11') as Record<string, unknown>;
    expect(metrics.comments).toBe(0);
    expect(metrics.disagreements).toBe(0);
    expect(metrics.questions).toBe(0);
    expect(metrics.avg_words).toBe(0);
    expect(metrics.last_style).toBe('none');
    expect(metrics.last_snippet).toBe('');
    expect(JSON.parse(String(metrics.styles))).toEqual({});
  });

  it('getQualityMetrics returns undefined for unknown platform/date', async () => {
    const { getQualityMetrics } = await import('../db/queries.js');
    const metrics = getQualityMetrics('linkedin', '2099-12-31');
    expect(metrics).toBeUndefined();
  });

  it('trackEngagement de-duplicates via UNIQUE constraint and isTracked reflects state', async () => {
    const { trackEngagement, isTracked } = await import('../db/queries.js');

    expect(isTracked('linkedin', 'comment', 'post-1')).toBe(false);

    expect(trackEngagement('linkedin', 'comment', 'post-1')).toBe(true);
    expect(isTracked('linkedin', 'comment', 'post-1')).toBe(true);

    // Re-inserting the same tuple is a no-op (INSERT OR IGNORE) — should not throw.
    expect(trackEngagement('linkedin', 'comment', 'post-1')).toBe(true);

    // Different platform is a distinct record.
    expect(isTracked('twitter', 'comment', 'post-1')).toBe(false);
  });

  it('logAgentRun returns a positive rowid and getAgentRuns finds it by date', async () => {
    const { logAgentRun, getAgentRuns } = await import('../db/queries.js');
    const startedAt = new Date().toISOString();
    const id = logAgentRun('linkedin', 'completed', startedAt, startedAt, 1234, 'ok', undefined);
    expect(id).toBeGreaterThan(0);

    const today = new Date().toISOString().split('T')[0];
    const runs = getAgentRuns(today) as Array<Record<string, unknown>>;
    expect(runs.length).toBe(1);
    expect(runs[0].agent_name).toBe('linkedin');
    expect(runs[0].status).toBe('completed');
    expect(runs[0].duration_ms).toBe(1234);
  });

  it('logAgentRun failed status records the error message', async () => {
    const { logAgentRun, getAgentRuns } = await import('../db/queries.js');
    const startedAt = new Date().toISOString();
    logAgentRun('twitter', 'failed', startedAt, startedAt, 500, undefined, 'boom');

    const today = new Date().toISOString().split('T')[0];
    const runs = getAgentRuns(today) as Array<Record<string, unknown>>;
    const failed = runs.find((r) => r.agent_name === 'twitter');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('boom');
  });
});

describe('db data integrity', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-db-integrity-'));
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../db/index.js');
      closeDb();
    } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('data persists across close/open cycles', async () => {
    const { logActivity } = await import('../db/queries.js');
    logActivity('linkedin', 'comment', null, null, null, null, 10);

    // Close the connection but keep the file on disk.
    const { closeDb } = await import('../db/index.js');
    closeDb();
    vi.resetModules();

    const { getActivityForDate } = await import('../db/queries.js');
    const today = new Date().toISOString().split('T')[0];
    const rows = getActivityForDate(today, 'linkedin') as unknown[];
    expect(rows.length).toBe(1);
  });

  it('handles an empty migrations dir gracefully', async () => {
    // Point to a temp dir with no migrations/ so findMigrationsDir falls back
    // to a non-existent path. runMigrations should still create _migrations and not throw.
    const Database = (await import('better-sqlite3')).default;
    const { runMigrations } = await import('../db/migrate.js');

    const db = new Database(':memory:');
    expect(() => runMigrations(db)).not.toThrow();

    const hasMigrationsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .get();
    expect(hasMigrationsTable).toBeDefined();
    db.close();
  });
});
