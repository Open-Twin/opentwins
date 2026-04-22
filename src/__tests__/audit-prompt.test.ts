import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getPlatformWorkspaceDir: (p: string) => resolve(tmpDir, 'workspaces', `agent-${p}`),
    getPipelineWorkspaceDir: () => resolve(tmpDir, 'workspaces', 'pipeline'),
  };
});

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('audit/audit-prompt', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-audit-'));
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  describe('gatherAuditInputs', () => {
    it('returns fallback values when workspace is empty', async () => {
      const { gatherAuditInputs } = await import('../audit/audit-prompt.js');
      const inputs = gatherAuditInputs('linkedin');
      expect(inputs.today).toBe(todayIso());
      expect(inputs.memoryToday).toBe('');
      expect(inputs.soul).toBe('');
      expect(inputs.insights).toBe('');
      expect(inputs.limits).toBe('{}');
      expect(inputs.schedule).toBe('{}');
      expect(inputs.contentReady).toBe('(no content-ready directory for today)');
      expect(inputs.contentBrief).toContain('(no content brief for today)');
    });

    it('reads workspace files when present', async () => {
      const today = todayIso();
      const ws = resolve(tmpDir, 'workspaces', 'agent-linkedin');
      mkdirSync(resolve(ws, 'memory'), { recursive: true });
      writeFileSync(resolve(ws, 'memory', `${today}.md`), '## 10:00 - Comment\n- Style: insight', 'utf-8');
      writeFileSync(resolve(ws, 'SOUL.md'), '# Voice: professional', 'utf-8');
      writeFileSync(resolve(ws, 'INSIGHTS.md'), 'What works: numbers', 'utf-8');
      writeFileSync(resolve(ws, 'limits.json'), JSON.stringify({ daily: { comments: { limit: 3, current: 1 } } }), 'utf-8');
      writeFileSync(resolve(ws, 'schedule.json'), JSON.stringify({ tasks: [] }), 'utf-8');

      const { gatherAuditInputs } = await import('../audit/audit-prompt.js');
      const inputs = gatherAuditInputs('linkedin');
      expect(inputs.memoryToday).toContain('Style: insight');
      expect(inputs.soul).toContain('professional');
      expect(inputs.insights).toContain('numbers');
      expect(JSON.parse(inputs.limits)).toEqual({ daily: { comments: { limit: 3, current: 1 } } });
      expect(JSON.parse(inputs.schedule)).toEqual({ tasks: [] });
    });

    it('collects content-ready files matching the platform', async () => {
      const today = todayIso();
      const readyDir = resolve(tmpDir, 'workspaces', 'pipeline', 'content-ready', today);
      mkdirSync(readyDir, { recursive: true });
      writeFileSync(resolve(readyDir, 'linkedin-post.md'), '# LinkedIn post body', 'utf-8');
      writeFileSync(resolve(readyDir, 'linkedin-carousel.md'), 'carousel body', 'utf-8');
      writeFileSync(resolve(readyDir, 'twitter-thread.md'), 'twitter body — should NOT appear', 'utf-8');

      const { gatherAuditInputs } = await import('../audit/audit-prompt.js');
      const inputs = gatherAuditInputs('linkedin');
      expect(inputs.contentReady).toContain('--- linkedin-post.md ---');
      expect(inputs.contentReady).toContain('LinkedIn post body');
      expect(inputs.contentReady).toContain('--- linkedin-carousel.md ---');
      expect(inputs.contentReady).not.toContain('twitter body');
    });

    it('reads the content brief for today', async () => {
      const today = todayIso();
      const briefsDir = resolve(tmpDir, 'workspaces', 'pipeline', 'content-briefs');
      mkdirSync(briefsDir, { recursive: true });
      writeFileSync(resolve(briefsDir, `${today}.md`), '## Today\n- theme: AI', 'utf-8');

      const { gatherAuditInputs } = await import('../audit/audit-prompt.js');
      const inputs = gatherAuditInputs('linkedin');
      expect(inputs.contentBrief).toContain('theme: AI');
    });
  });

  describe('buildAuditPrompt', () => {
    it('includes the platform name, date, rubric, and all inlined input sections', async () => {
      const { buildAuditPrompt } = await import('../audit/audit-prompt.js');
      const prompt = buildAuditPrompt('bluesky', {
        today: '2026-04-20',
        memoryToday: 'MEMORY_MARKER',
        soul: 'SOUL_MARKER',
        insights: 'INSIGHTS_MARKER',
        limits: '{"x":1}',
        schedule: '{"y":2}',
        contentReady: 'CONTENT_READY_MARKER',
        contentBrief: 'BRIEF_MARKER',
      });
      expect(prompt).toContain('# Audit Agent: bluesky');
      expect(prompt).toContain('Date: 2026-04-20');
      expect(prompt).toContain('### Dimension 1: Mechanical rule compliance');
      expect(prompt).toContain('### Dimension 7: Execution completeness');
      expect(prompt).toContain('7 × 10 = 70 total');
      expect(prompt).not.toContain('Engagement outcomes');
      expect(prompt).not.toContain('Style distribution');
      expect(prompt).toContain('MEMORY_MARKER');
      expect(prompt).toContain('SOUL_MARKER');
      expect(prompt).toContain('INSIGHTS_MARKER');
      expect(prompt).toContain('{"x":1}');
      expect(prompt).toContain('{"y":2}');
      expect(prompt).toContain('CONTENT_READY_MARKER');
      expect(prompt).toContain('BRIEF_MARKER');
    });

    it('emits empty-activity fallback instruction for empty memory', async () => {
      const { buildAuditPrompt } = await import('../audit/audit-prompt.js');
      const prompt = buildAuditPrompt('linkedin', {
        today: '2026-04-20', memoryToday: '', soul: '', insights: '',
        limits: '{}', schedule: '{}', contentReady: '', contentBrief: '',
      });
      expect(prompt).toContain('Agent has no activity today.');
    });
  });
});
