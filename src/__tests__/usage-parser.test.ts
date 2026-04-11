import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getModelFamily,
  getModelPrice,
  computeCost,
  extractUsageFromSession,
  getUsageReport,
} from '../util/usage-parser.js';

describe('usage-parser pricing helpers', () => {
  it('getModelFamily detects sonnet/opus/haiku by substring', () => {
    expect(getModelFamily('claude-sonnet-4-6')).toBe('sonnet');
    expect(getModelFamily('claude-opus-4-6')).toBe('opus');
    expect(getModelFamily('claude-haiku-4-5')).toBe('haiku');
  });

  it('getModelFamily returns "unknown" for empty or unfamiliar ids', () => {
    expect(getModelFamily(undefined)).toBe('unknown');
    expect(getModelFamily('')).toBe('unknown');
    expect(getModelFamily('gpt-4')).toBe('unknown');
  });

  it('getModelPrice returns sonnet-equivalent rates for unknown models', () => {
    const unknown = getModelPrice('gpt-4');
    const sonnet = getModelPrice('sonnet');
    expect(unknown).toEqual(sonnet);
  });

  it('computeCost applies per-million-token rates', () => {
    // sonnet: input 3 / output 15 / cacheWrite 3.75 / cacheRead 0.30 per 1M.
    // 1M input + 1M output + 1M cacheWrite + 1M cacheRead = $3 + $15 + $3.75 + $0.30 = $22.05
    const cost = computeCost(1_000_000, 1_000_000, 1_000_000, 1_000_000, 'sonnet');
    expect(cost).toBeCloseTo(22.05, 2);
  });

  it('computeCost is zero for zero tokens', () => {
    expect(computeCost(0, 0, 0, 0, 'sonnet')).toBe(0);
  });

  it('computeCost scales linearly with tokens', () => {
    const a = computeCost(100_000, 0, 0, 0, 'sonnet');
    const b = computeCost(200_000, 0, 0, 0, 'sonnet');
    expect(b).toBeCloseTo(a * 2, 10);
  });
});

describe('usage-parser extractUsageFromSession', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-usage-parse-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function writeSession(name: string, lines: unknown[]): string {
    const path = resolve(tmpDir, name);
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf-8');
    return path;
  }

  it('returns null when file does not exist', () => {
    expect(extractUsageFromSession('/nope/session.jsonl', 'linkedin')).toBeNull();
  });

  it('returns null when the session has no assistant turns', () => {
    const path = writeSession('empty.jsonl', [
      { type: 'user', timestamp: '2026-04-11T10:00:00.000Z', message: { content: [] } },
    ]);
    expect(extractUsageFromSession(path, 'linkedin')).toBeNull();
  });

  it('sums tokens across assistant turns and computes cost', () => {
    const path = writeSession('two-turns.jsonl', [
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 },
        },
      },
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:01:00.000Z',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 200, output_tokens: 75 },
        },
      },
    ]);
    const usage = extractUsageFromSession(path, 'linkedin')!;
    expect(usage).not.toBeNull();
    expect(usage.turns).toBe(2);
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(125);
    expect(usage.cacheCreateTokens).toBe(10);
    expect(usage.cacheReadTokens).toBe(5);
    expect(usage.totalTokens).toBe(440);
    expect(usage.modelFamily).toBe('sonnet');
    expect(usage.costUsd).toBeGreaterThan(0);
    expect(usage.startedAt).toBe('2026-04-11T10:00:00.000Z');
    expect(usage.endedAt).toBe('2026-04-11T10:01:00.000Z');
  });

  it('counts tool_result errors from user messages', () => {
    const path = writeSession('errors.jsonl', [
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1, output_tokens: 1 } },
      },
      {
        type: 'user',
        timestamp: '2026-04-11T10:00:01.000Z',
        message: {
          content: [
            { type: 'tool_result', is_error: true },
            { type: 'tool_result', is_error: false },
            { type: 'tool_result', is_error: true },
          ],
        },
      },
    ]);
    const usage = extractUsageFromSession(path, 'linkedin')!;
    expect(usage.errorCount).toBe(2);
  });

  it('skips lines that are not valid JSON', () => {
    const path = resolve(tmpDir, 'mixed.jsonl');
    const good = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-04-11T10:00:00.000Z',
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 10, output_tokens: 5 } },
    });
    writeFileSync(path, `${good}\nnot json\n${good}\n`, 'utf-8');

    const usage = extractUsageFromSession(path, 'linkedin')!;
    expect(usage.turns).toBe(2);
    expect(usage.inputTokens).toBe(20);
  });

  it('defaults to "unknown" cost rates when model is missing', () => {
    const path = writeSession('nomodel.jsonl', [
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: { usage: { input_tokens: 1_000_000, output_tokens: 0 } },
      },
    ]);
    const usage = extractUsageFromSession(path, 'linkedin')!;
    // Unknown defaults to sonnet pricing: $3 per 1M input tokens.
    expect(usage.costUsd).toBeCloseTo(3, 2);
    expect(usage.modelFamily).toBe('unknown');
  });
});

describe('usage-parser getUsageReport', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-usage-report-'));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns empty report when platform has no session files', () => {
    // Unknown platform → no session files → empty report, no throw.
    const report = getUsageReport(['nobody'], '2026-04-01', '2026-04-30');
    expect(report.days).toEqual([]);
    expect(report.totals.sessions).toBe(0);
    expect(report.totals.costUsd).toBe(0);
    expect(report.byPlatform).toEqual({});
    expect(report.byModel).toEqual({});
  });
});
