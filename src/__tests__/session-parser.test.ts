import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { extractEventsFromSession, summarizeSession } from '../util/session-parser.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-session-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSession(lines: object[]): string {
  const path = resolve(tmpDir, 'test-session.jsonl');
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf-8');
  return path;
}

describe('extractEventsFromSession', () => {
  it('extracts thinking events from assistant messages', () => {
    const path = writeSession([
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Starting heartbeat' }] },
      },
    ]);
    const events = extractEventsFromSession(path);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('thinking');
    expect(events[0].summary).toBe('Starting heartbeat');
    expect(events[0].ts).toBe('2026-04-11T10:00:00.000Z');
  });

  it('extracts tool_use events', () => {
    const path = writeSession([
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: {
          content: [{
            type: 'tool_use',
            name: 'Bash',
            input: { command: 'exec curl -s http://localhost:3847/api/browser/ot-linkedin/open', description: 'Open browser' },
          }],
        },
      },
    ]);
    const events = extractEventsFromSession(path);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('tool');
  });

  it('extracts error events', () => {
    const path = writeSession([
      {
        type: 'user',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: {
          content: [{
            type: 'tool_result',
            is_error: true,
            content: 'Connection refused',
          }],
        },
      },
    ]);
    const events = extractEventsFromSession(path);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('error');
  });

  it('does not synthesize a feed event for result type', () => {
    // result/last-prompt no longer produce a "Session complete" feed event;
    // the completed status is surfaced via summarizeSession().completed
    // instead. Tested below in the summarizeSession describe.
    const path = writeSession([
      { type: 'result', timestamp: '2026-04-11T10:05:00.000Z', result: 'Heartbeat complete' },
    ]);
    expect(extractEventsFromSession(path)).toHaveLength(0);
  });

  it('does not synthesize a feed event for last-prompt type', () => {
    const path = writeSession([
      { type: 'last-prompt', timestamp: '' },
    ]);
    expect(extractEventsFromSession(path)).toHaveLength(0);
  });

  it('returns empty array for missing file', () => {
    const events = extractEventsFromSession('/nonexistent/file.jsonl');
    expect(events).toEqual([]);
  });

  it('returns empty array for empty file', () => {
    const path = resolve(tmpDir, 'empty.jsonl');
    writeFileSync(path, '', 'utf-8');
    const events = extractEventsFromSession(path);
    expect(events).toEqual([]);
  });
});

describe('summarizeSession', () => {
  it('computes correct duration from first to last timestamped event', () => {
    const path = writeSession([
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Start' }] },
      },
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:05:00.000Z',
        message: { content: [{ type: 'text', text: 'Middle' }] },
      },
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:13:14.000Z',
        message: { content: [{ type: 'text', text: 'Near end' }] },
      },
      // Last event has no timestamp (like real sessions)
      { type: 'last-prompt', timestamp: '' },
    ]);

    const summary = summarizeSession(path, 'linkedin');
    expect(summary).not.toBeNull();
    expect(summary!.durationMs).toBe(13 * 60 * 1000 + 14 * 1000); // 13m14s
    expect(summary!.startedAt).toBe('2026-04-11T10:00:00.000Z');
    expect(summary!.endedAt).toBe('2026-04-11T10:13:14.000Z');
  });

  it('duration is NOT zero for multi-event session', () => {
    const path = writeSession([
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Start' }] },
      },
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:02:00.000Z',
        message: { content: [{ type: 'text', text: 'End' }] },
      },
    ]);
    const summary = summarizeSession(path, 'linkedin');
    expect(summary!.durationMs).toBeGreaterThan(0);
    expect(summary!.durationMs).toBe(120000); // 2 minutes
  });

  it('marks session as completed when result/last-prompt present', () => {
    const path = writeSession([
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Work' }] },
      },
      { type: 'result', timestamp: '2026-04-11T10:01:00.000Z', result: 'Done' },
    ]);
    const summary = summarizeSession(path, 'linkedin');
    expect(summary!.completed).toBe(true);
    expect(summary!.status).toBe('completed');
  });

  it('marks session as incomplete when no result/last-prompt', () => {
    const path = writeSession([
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Started but crashed' }] },
      },
    ]);
    const summary = summarizeSession(path, 'linkedin');
    expect(summary!.completed).toBe(false);
    expect(summary!.status).toBe('incomplete');
  });

  it('counts tools and errors', () => {
    const path = writeSession([
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:00.000Z',
        message: { content: [
          { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
          { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/x' } },
        ] },
      },
      {
        type: 'user',
        timestamp: '2026-04-11T10:00:01.000Z',
        message: { content: [{ type: 'tool_result', is_error: true, content: 'fail' }] },
      },
      {
        type: 'assistant',
        timestamp: '2026-04-11T10:00:02.000Z',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo ok' } }] },
      },
    ]);
    const summary = summarizeSession(path, 'linkedin');
    expect(summary!.toolCount).toBe(3);
    expect(summary!.errorCount).toBe(1);
  });

  it('returns null for empty file', () => {
    const path = resolve(tmpDir, 'empty.jsonl');
    writeFileSync(path, '', 'utf-8');
    const summary = summarizeSession(path, 'linkedin');
    expect(summary).toBeNull();
  });
});

describe('session-parser edge cases', () => {
  it('skips malformed JSONL lines and keeps parsing', () => {
    const path = resolve(tmpDir, 'mixed.jsonl');
    const goodLine = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-04-11T10:00:00.000Z',
      message: { content: [{ type: 'text', text: 'real event' }] },
    });
    writeFileSync(path, `${goodLine}\n{ this is not valid json\n${goodLine}\n`, 'utf-8');

    const events = extractEventsFromSession(path);
    // Both good lines should be parsed; the broken line is silently skipped.
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('thinking');
  });

  it('ignores blank lines in the JSONL file', () => {
    const path = resolve(tmpDir, 'blanks.jsonl');
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-04-11T10:00:00.000Z',
      message: { content: [{ type: 'text', text: 'x' }] },
    });
    writeFileSync(path, `\n\n${line}\n\n\n`, 'utf-8');
    expect(extractEventsFromSession(path)).toHaveLength(1);
  });

  it('truncates thinking text longer than 200 chars and stores the full text in detail', () => {
    const longText = 'x'.repeat(500);
    const path = resolve(tmpDir, 'long.jsonl');
    writeFileSync(path, JSON.stringify({
      type: 'assistant',
      timestamp: '2026-04-11T10:00:00.000Z',
      message: { content: [{ type: 'text', text: longText }] },
    }), 'utf-8');

    const [event] = extractEventsFromSession(path);
    expect(event.summary.length).toBeLessThanOrEqual(201); // includes ellipsis
    expect(event.summary.endsWith('…')).toBe(true);
    expect(event.detail).toBe(longText);
  });

  it('handles entries with missing timestamp field gracefully', () => {
    const path = resolve(tmpDir, 'no-ts.jsonl');
    writeFileSync(path, JSON.stringify({
      type: 'assistant',
      // timestamp intentionally missing
      message: { content: [{ type: 'text', text: 'no ts' }] },
    }), 'utf-8');

    const events = extractEventsFromSession(path);
    expect(events).toHaveLength(1);
    expect(events[0].ts).toBe('');
  });

  it('summarizeSession returns durationMs=0 when only one timestamped event exists', () => {
    const path = resolve(tmpDir, 'single.jsonl');
    writeFileSync(path, JSON.stringify({
      type: 'assistant',
      timestamp: '2026-04-11T10:00:00.000Z',
      message: { content: [{ type: 'text', text: 'just one' }] },
    }), 'utf-8');

    const summary = summarizeSession(path, 'linkedin');
    expect(summary!.durationMs).toBe(0);
    expect(summary!.startedAt).toBe('2026-04-11T10:00:00.000Z');
    expect(summary!.endedAt).toBe('2026-04-11T10:00:00.000Z');
  });

  it('handles a tool_result with array content and a text entry', () => {
    const path = resolve(tmpDir, 'array-err.jsonl');
    writeFileSync(path, JSON.stringify({
      type: 'user',
      timestamp: '2026-04-11T10:00:00.000Z',
      message: {
        content: [{
          type: 'tool_result',
          is_error: true,
          content: [{ type: 'text', text: 'Structured error' }],
        }],
      },
    }), 'utf-8');

    const [event] = extractEventsFromSession(path);
    expect(event.kind).toBe('error');
    expect(event.detail).toContain('Structured error');
  });

  it('parses a 1000-line session without crashing (perf sanity)', () => {
    const path = resolve(tmpDir, 'big.jsonl');
    const lines: string[] = [];
    for (let i = 0; i < 1000; i++) {
      lines.push(JSON.stringify({
        type: 'assistant',
        timestamp: `2026-04-11T10:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
        message: { content: [{ type: 'text', text: `turn ${i}` }] },
      }));
    }
    writeFileSync(path, lines.join('\n'), 'utf-8');

    const summary = summarizeSession(path, 'linkedin');
    expect(summary!.eventCount).toBe(1000);
    expect(summary!.durationMs).toBeGreaterThan(0);
  });
});
