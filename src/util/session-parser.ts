import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { getPlatformWorkspaceDir } from './paths.js';

// ── Types ─────────────────────────────────────────────────────

export interface FeedEvent {
  ts: string;
  kind: 'thinking' | 'tool' | 'result' | 'error' | 'done';
  summary: string;
  detail?: string;
}

export interface SessionSummary {
  sessionId: string;           // filename without .jsonl
  sessionFile: string;
  platform: string;
  startedAt: string;           // ISO timestamp of first event
  endedAt: string;             // ISO timestamp of last event
  durationMs: number;
  eventCount: number;
  toolCount: number;
  errorCount: number;
  completed: boolean;          // saw a `result` entry
  status: 'running' | 'completed' | 'incomplete';
  events: FeedEvent[];
}

// ── Path helpers ──────────────────────────────────────────────

export function getClaudeProjectDir(platform: string): string {
  const workspaceDir = getPlatformWorkspaceDir(platform);
  const encoded = workspaceDir.replace(/[/.]/g, '-');
  return resolve(homedir(), '.claude', 'projects', encoded);
}

export function listSessionFiles(platform: string): string[] {
  const dir = getClaudeProjectDir(platform);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ name: f, mtime: statSync(resolve(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime) // newest first
      .map((f) => resolve(dir, f.name));
  } catch {
    return [];
  }
}

export function findLatestSessionFile(platform: string): string | null {
  const files = listSessionFiles(platform);
  return files.length > 0 ? files[0] : null;
}

// ── Tool summarization ────────────────────────────────────────

function summarizeToolCall(name: string, input: Record<string, unknown>): { summary: string; detail?: string } {
  switch (name) {
    case 'Bash': {
      const cmd = String(input.command || '');
      const desc = input.description ? String(input.description) : '';
      if (cmd.includes('opentwins browser')) {
        if (cmd.includes(' open ')) return { summary: `🌐 Opening browser page`, detail: cmd.match(/open\s+"([^"]+)"/)?.[1] };
        if (cmd.includes(' navigate ')) return { summary: `🧭 Navigating`, detail: cmd.match(/navigate\s+"([^"]+)"/)?.[1] };
        if (cmd.includes(' evaluate ')) return { summary: `⚡ ${desc || 'Evaluating page JS'}`, detail: cmd.slice(0, 400) };
        if (cmd.includes(' snapshot')) return { summary: `📸 Page snapshot`, detail: desc };
        if (cmd.includes(' click')) return { summary: `🖱️ Clicking element`, detail: desc };
        if (cmd.includes(' type')) return { summary: `⌨️ Typing`, detail: desc };
        if (cmd.includes(' close')) return { summary: `❌ Closing tab`, detail: desc };
        return { summary: `🦞 Browser: ${desc || cmd.slice(0, 80)}` };
      }
      return { summary: `💻 ${desc || 'Bash'}`, detail: cmd.slice(0, 400) };
    }
    case 'Read':
      return { summary: `📖 Read ${basename(String(input.file_path || ''))}` };
    case 'Write':
      return { summary: `✏️ Write ${basename(String(input.file_path || ''))}` };
    case 'Edit':
      return { summary: `✂️ Edit ${basename(String(input.file_path || ''))}` };
    case 'Glob':
      return { summary: `🔎 Search files: ${String(input.pattern || '')}` };
    case 'Grep':
      return { summary: `🔍 Grep: ${String(input.pattern || '')}` };
    case 'TodoWrite':
      return { summary: `📋 Updated task list` };
    default:
      return { summary: `🔧 ${name}`, detail: JSON.stringify(input).slice(0, 200) };
  }
}

// ── Session parsing ───────────────────────────────────────────

export function extractEventsFromSession(sessionFile: string): FeedEvent[] {
  let content: string;
  try { content = readFileSync(sessionFile, 'utf-8'); } catch { return []; }

  const lines = content.split('\n').filter(Boolean);
  const events: FeedEvent[] = [];
  let lastDone: FeedEvent | null = null;

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try { entry = JSON.parse(line); } catch { continue; }

    const ts = String(entry.timestamp || '');
    const typ = String(entry.type || '');

    if (typ === 'assistant') {
      const msg = entry.message as { content?: unknown[] } | undefined;
      const items = Array.isArray(msg?.content) ? msg!.content : [];
      for (const c of items) {
        if (!c || typeof c !== 'object') continue;
        const item = c as Record<string, unknown>;
        if (item.type === 'text') {
          const text = String(item.text || '').trim();
          if (text) {
            events.push({
              ts,
              kind: 'thinking',
              summary: text.length > 200 ? text.slice(0, 200) + '…' : text,
              detail: text.length > 200 ? text : undefined,
            });
          }
        } else if (item.type === 'tool_use') {
          const { summary, detail } = summarizeToolCall(
            String(item.name || ''),
            (item.input || {}) as Record<string, unknown>
          );
          events.push({ ts, kind: 'tool', summary, detail });
        }
      }
    } else if (typ === 'user') {
      const msg = entry.message as { content?: unknown[] } | undefined;
      const items = Array.isArray(msg?.content) ? msg!.content : [];
      for (const c of items) {
        if (!c || typeof c !== 'object') continue;
        const item = c as Record<string, unknown>;
        if (item.type === 'tool_result' && item.is_error) {
          let text = '';
          const tcontent = item.content;
          if (typeof tcontent === 'string') text = tcontent;
          else if (Array.isArray(tcontent)) {
            for (const tc of tcontent) {
              if (tc && typeof tc === 'object' && (tc as Record<string, unknown>).type === 'text') {
                text += String((tc as Record<string, unknown>).text || '');
              }
            }
          }
          if (text) {
            events.push({
              ts,
              kind: 'error',
              summary: `⚠️ Tool error`,
              detail: text.slice(0, 500),
            });
          }
        }
      }
    } else if (typ === 'result' || typ === 'last-prompt') {
      // Track the latest done marker but don't push yet — see the dedupe
      // pass after the loop. `last-prompt` fires at every prompt boundary
      // in a multi-turn session, so emitting per-event would produce N
      // "Session complete" entries per run.
      lastDone = {
        ts,
        kind: 'done',
        summary: `✅ Session complete`,
        detail: typ === 'result' ? String(entry.result || '').slice(0, 500) : undefined,
      };
    }
  }

  if (lastDone) events.push(lastDone);
  return events;
}

export function summarizeSession(sessionFile: string, platform: string): SessionSummary | null {
  const events = extractEventsFromSession(sessionFile);
  if (events.length === 0) return null;

  const startedAt = events[0].ts || '';
  const endedAt = events.findLast((e) => e.ts)?.ts || startedAt;
  const durationMs = startedAt && endedAt
    ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
    : 0;
  const completed = events.some((e) => e.kind === 'done');

  return {
    sessionId: basename(sessionFile, '.jsonl'),
    sessionFile,
    platform,
    startedAt,
    endedAt,
    durationMs,
    eventCount: events.length,
    toolCount: events.filter((e) => e.kind === 'tool').length,
    errorCount: events.filter((e) => e.kind === 'error').length,
    completed,
    status: completed ? 'completed' : 'incomplete',
    events,
  };
}

// Get all sessions for a list of platforms, optionally filtered by date (YYYY-MM-DD)
// runningPlatforms: platforms whose latest session should be marked as 'running'
export function getSessions(
  platforms: string[],
  date?: string,
  runningPlatforms?: Set<string>
): SessionSummary[] {
  const all: SessionSummary[] = [];
  for (const p of platforms) {
    for (const file of listSessionFiles(p)) {
      const summary = summarizeSession(file, p);
      if (!summary) continue;
      if (date && !summary.startedAt.startsWith(date)) continue;
      all.push(summary);
    }
  }
  // Newest first
  all.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));

  // Mark the most recent session per running platform
  if (runningPlatforms && runningPlatforms.size > 0) {
    const marked = new Set<string>();
    for (const s of all) {
      if (runningPlatforms.has(s.platform) && !marked.has(s.platform)) {
        s.status = 'running';
        marked.add(s.platform);
      }
    }
  }

  return all;
}
