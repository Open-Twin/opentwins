import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getConfigPath: () => resolve(tmpDir, 'config.json'),
    getPlatformWorkspaceDir: (platform: string) => resolve(tmpDir, 'workspaces', `agent-${platform}`),
  };
});

vi.mock('../config/loader.js', () => ({
  configExists: () => true,
  loadConfig: () => ({
    platforms: [
      { platform: 'linkedin', enabled: true },
      { platform: 'twitter', enabled: true },
    ],
  }),
}));

describe('Quality Metrics', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-quality-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function createSummary(platform: string, data: Record<string, unknown>) {
    const dir = resolve(tmpDir, 'workspaces', `agent-${platform}`, 'memory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'today_summary.json'), JSON.stringify(data), 'utf-8');
  }

  function createMemoryLog(platform: string, date: string, content: string) {
    const dir = resolve(tmpDir, 'workspaces', `agent-${platform}`, 'memory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${date}.md`), content, 'utf-8');
  }

  it('returns today summary from JSON file', async () => {
    const today = new Date().toISOString().split('T')[0];
    createSummary('linkedin', {
      date: today,
      comments: 3,
      styles: { insight: 1, short: 2 },
      disagreements: 1,
      questions: 0,
      avg_words: 24,
      last_style: 'short',
    });

    // Import after mocks are set up
    const { getQualityMetrics } = await import('../ui/api/quality.js');

    const result = await new Promise<any>((resolve) => {
      const req = { query: { platform: 'linkedin' } } as any;
      const res = { json: (data: any) => resolve(data) } as any;
      getQualityMetrics(req, res);
    });

    expect(result.today).not.toBeNull();
    expect(result.today.comments).toBe(3);
    expect(JSON.parse(result.today.styles)).toEqual({ insight: 1, short: 2 });
  });

  it('returns null when no summary file exists', async () => {
    mkdirSync(resolve(tmpDir, 'workspaces', 'agent-twitter', 'memory'), { recursive: true });

    const { getQualityMetrics } = await import('../ui/api/quality.js');

    const result = await new Promise<any>((resolve) => {
      const req = { query: { platform: 'twitter' } } as any;
      const res = { json: (data: any) => resolve(data) } as any;
      getQualityMetrics(req, res);
    });

    expect(result.today).toBeNull();
  });

  it('counts comments from memory logs for history', async () => {
    const today = new Date().toISOString().split('T')[0];
    createMemoryLog('linkedin', today, `
## ${today} 14:00 - Comment
- User: TestUser
- Style: insight

## ${today} 15:00 - Comment
- User: AnotherUser
- Style: short

## ${today} 15:30 - Reply
- User: ReplyUser
    `);

    createSummary('linkedin', {
      date: today,
      comments: 2,
      styles: { insight: 1, short: 1 },
      disagreements: 0,
      questions: 0,
      avg_words: 20,
      last_style: 'short',
    });

    const { getQualityMetrics } = await import('../ui/api/quality.js');

    const result = await new Promise<any>((resolve) => {
      const req = { query: { platform: 'linkedin', days: '7' } } as any;
      const res = { json: (data: any) => resolve(data) } as any;
      getQualityMetrics(req, res);
    });

    expect(result.history.length).toBeGreaterThan(0);
  });

  it('returns all platform summaries when no platform specified', async () => {
    const today = new Date().toISOString().split('T')[0];
    createSummary('linkedin', { date: today, comments: 2, styles: {}, disagreements: 0, questions: 0, avg_words: 20, last_style: '' });
    createSummary('twitter', { date: today, comments: 5, styles: {}, disagreements: 1, questions: 0, avg_words: 15, last_style: '' });

    const { getQualityMetrics } = await import('../ui/api/quality.js');

    const result = await new Promise<any>((resolve) => {
      const req = { query: {} } as any;
      const res = { json: (data: any) => resolve(data) } as any;
      getQualityMetrics(req, res);
    });

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(2);
  });
});
