import type { Request, Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configExists, loadConfig } from '../../config/loader.js';
import { getPlatformWorkspaceDir } from '../../util/paths.js';

interface TodaySummary {
  date: string;
  comments: number;
  styles: Record<string, number>;
  disagreements: number;
  questions: number;
  avg_words: number;
  last_style: string;
  last_snippet?: string;
}

interface HeartbeatEntry {
  // Local-time timestamp "YYYY-MM-DDTHH:MM" (log format has no TZ)
  ts: string;
  date: string;
  hour: string; // "YYYY-MM-DDTHH"
  comments: number;
  styles: Record<string, number>;
  disagreements: number;
}

function readTodaySummary(platform: string): TodaySummary | null {
  const dir = getPlatformWorkspaceDir(platform);
  const path = resolve(dir, 'memory', 'today_summary.json');
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return {
      date: data.date || '',
      comments: data.comments || 0,
      styles: typeof data.styles === 'object' ? data.styles : {},
      disagreements: data.disagreements || 0,
      questions: data.questions || 0,
      avg_words: data.avg_words || 0,
      last_style: data.last_style || '',
      last_snippet: data.last_snippet || '',
    };
  } catch {
    return null;
  }
}

// Parse one memory log file into heartbeat entries. Each `## YYYY-MM-DD HH:MM …`
// heading starts an entry; the body up to the next heading counts comments/styles.
function parseMemoryLog(content: string): HeartbeatEntry[] {
  const sections = content.split(/\n(?=## )/).filter((s) => s.trim().startsWith('## '));
  const entries: HeartbeatEntry[] = [];
  for (const sec of sections) {
    const header = sec.split('\n', 1)[0];
    const match = header.match(/##\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
    if (!match) continue;
    const [, date, hh, mm] = match;
    const commentCount =
      (sec.match(/\bComment\s+\d+:/gi) || []).length +
      (sec.match(/\*\*Reply\s+\d+:\*\*/g) || []).length;
    const styles: Record<string, number> = {};
    for (const m of sec.match(/Style:\s*([a-z_-]+)/gi) || []) {
      const s = m.split(':')[1].trim().toLowerCase();
      styles[s] = (styles[s] || 0) + 1;
    }
    entries.push({
      ts: `${date}T${hh}:${mm}`,
      date,
      hour: `${date}T${hh}`,
      comments: commentCount,
      styles,
      disagreements: styles.disagree || 0,
    });
  }
  return entries;
}

function readMemoryEntriesForDates(platform: string, dates: string[]): HeartbeatEntry[] {
  const memoryDir = resolve(getPlatformWorkspaceDir(platform), 'memory');
  if (!existsSync(memoryDir)) return [];
  const entries: HeartbeatEntry[] = [];
  for (const date of dates) {
    const f = resolve(memoryDir, `${date}.md`);
    if (!existsSync(f)) continue;
    try {
      entries.push(...parseMemoryLog(readFileSync(f, 'utf-8')));
    } catch { /* skip */ }
  }
  return entries;
}

function bucketByDay(entries: HeartbeatEntry[], dates: string[]): TodaySummary[] {
  const byDate = new Map<string, TodaySummary>();
  for (const d of dates) {
    byDate.set(d, { date: d, comments: 0, styles: {}, disagreements: 0, questions: 0, avg_words: 0, last_style: '' });
  }
  for (const e of entries) {
    const bucket = byDate.get(e.date);
    if (!bucket) continue;
    bucket.comments += e.comments;
    bucket.disagreements += e.disagreements;
    for (const [s, n] of Object.entries(e.styles)) bucket.styles[s] = (bucket.styles[s] || 0) + n;
  }
  return dates.map((d) => byDate.get(d)!).filter((b) => b.comments > 0);
}

function bucketByHour(entries: HeartbeatEntry[], hourKeys: string[]): Array<TodaySummary & { hour: string }> {
  const byHour = new Map<string, TodaySummary & { hour: string }>();
  for (const h of hourKeys) {
    byHour.set(h, { hour: h, date: h.slice(0, 10), comments: 0, styles: {}, disagreements: 0, questions: 0, avg_words: 0, last_style: '' });
  }
  for (const e of entries) {
    const bucket = byHour.get(e.hour);
    if (!bucket) continue;
    bucket.comments += e.comments;
    bucket.disagreements += e.disagreements;
    for (const [s, n] of Object.entries(e.styles)) bucket.styles[s] = (bucket.styles[s] || 0) + n;
  }
  return hourKeys.map((h) => byHour.get(h)!);
}

function dateRangeKeys(days: number): string[] {
  const keys: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().split('T')[0]);
  }
  return keys;
}

function hourRangeKeys(hours: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000);
    const pad = (n: number) => String(n).padStart(2, '0');
    keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`);
  }
  return keys;
}

export function getQualityMetrics(req: Request, res: Response): void {
  const { platform, days, hours } = req.query;

  if (!configExists()) {
    res.json(platform ? { today: null, history: [], emDashViolations: 0 } : []);
    return;
  }

  if (platform) {
    const todaySummary = readTodaySummary(platform as string);

    if (hours) {
      const numHours = Math.max(1, Math.min(168, parseInt(hours as string)));
      const hourKeys = hourRangeKeys(numHours);
      const uniqueDates = Array.from(new Set(hourKeys.map((h) => h.slice(0, 10))));
      const entries = readMemoryEntriesForDates(platform as string, uniqueDates);
      const buckets = bucketByHour(entries, hourKeys);

      res.json({
        today: todaySummary ? {
          platform,
          ...todaySummary,
          styles: JSON.stringify(todaySummary.styles),
        } : null,
        history: buckets.map((b) => ({
          hour: b.hour,
          date: b.date,
          comments: b.comments,
          disagreements: b.disagreements,
          avg_words: b.avg_words,
          styles: JSON.stringify(b.styles),
        })),
        emDashViolations: 0,
        range: { hours: numHours },
      });
      return;
    }

    const numDays = Math.max(1, Math.min(90, parseInt((days as string) || '7')));
    const dateKeys = dateRangeKeys(numDays);
    const entries = readMemoryEntriesForDates(platform as string, dateKeys);
    const buckets = bucketByDay(entries, dateKeys);

    // Merge today_summary (more accurate) into today's bucket
    if (todaySummary && todaySummary.date) {
      const match = buckets.find((b) => b.date === todaySummary.date);
      if (match) Object.assign(match, todaySummary);
      else if (todaySummary.comments > 0) buckets.push(todaySummary);
    }
    buckets.sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      today: todaySummary ? {
        platform,
        ...todaySummary,
        styles: JSON.stringify(todaySummary.styles),
      } : null,
      history: buckets.map((b) => ({
        date: b.date,
        comments: b.comments,
        disagreements: b.disagreements,
        avg_words: b.avg_words,
        styles: JSON.stringify(b.styles),
      })),
      emDashViolations: 0,
      range: { days: numDays },
    });
    return;
  }

  const config = loadConfig();
  const summaries = config.platforms
    .filter((p) => p.enabled)
    .map((p) => {
      const summary = readTodaySummary(p.platform);
      return summary ? { platform: p.platform, ...summary, styles: JSON.stringify(summary.styles) } : null;
    })
    .filter(Boolean);
  res.json(summaries);
}

export function getDisagreementRatio(req: Request, res: Response): void {
  const { platform, days } = req.query;
  const numDays = parseInt((days as string) || '30');
  const p = (platform as string) || 'linkedin';

  const dateKeys = dateRangeKeys(numDays);
  const entries = readMemoryEntriesForDates(p, dateKeys);
  const buckets = bucketByDay(entries, dateKeys);
  const data = buckets.map((h) => ({
    date: h.date,
    comments: h.comments,
    disagreements: h.disagreements,
    disagreement_pct: h.comments > 0 ? Math.round((h.disagreements / h.comments) * 1000) / 10 : 0,
  }));

  res.json(data);
}
