import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { listSessionFiles } from './session-parser.js';

// ── Pricing (USD per 1M tokens) ───────────────────────────────
// Sourced from https://docs.anthropic.com/en/docs/about-claude/pricing
// These are published API rates. Users on Claude Code subscription pay a flat fee,
// so the "cost" shown for them is the equivalent pay-per-use rate.

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;  // 5-minute cache creation
  cacheRead: number;   // cache hit
}

const PRICING: Record<'sonnet' | 'opus' | 'haiku' | 'unknown', ModelPrice> = {
  sonnet:  { input: 3,  output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  opus:    { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  haiku:   { input: 1,  output: 5,  cacheWrite: 1.25, cacheRead: 0.10 },
  unknown: { input: 3,  output: 15, cacheWrite: 3.75, cacheRead: 0.30 }, // default to sonnet
};

export type ModelFamily = keyof typeof PRICING;

export function getModelFamily(modelId: string | undefined): ModelFamily {
  if (!modelId) return 'unknown';
  const id = modelId.toLowerCase();
  if (id.includes('sonnet')) return 'sonnet';
  if (id.includes('opus')) return 'opus';
  if (id.includes('haiku')) return 'haiku';
  return 'unknown';
}

export function getModelPrice(modelId: string | undefined): ModelPrice {
  return PRICING[getModelFamily(modelId)];
}

// ── Types ─────────────────────────────────────────────────────

export interface SessionUsage {
  sessionId: string;
  platform: string;
  model: string;
  modelFamily: ModelFamily;
  startedAt: string;
  endedAt: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  errorCount: number;
}

export interface DailyUsage {
  date: string;
  platform: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  errors: number;
}

export interface HourlyUsage {
  // ISO-hour key — "YYYY-MM-DDTHH" (UTC)
  hour: string;
  platform: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  errors: number;
}

export interface UsageTotals {
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  errors: number;
}

// ── Helpers ───────────────────────────────────────────────────

function emptyTotals(): UsageTotals {
  return {
    sessions: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    errors: 0,
  };
}

function addUsage(target: UsageTotals, src: SessionUsage | DailyUsage): void {
  target.sessions += 'sessions' in src ? src.sessions : 1;
  target.inputTokens += src.inputTokens;
  target.outputTokens += src.outputTokens;
  target.cacheCreateTokens += src.cacheCreateTokens;
  target.cacheReadTokens += src.cacheReadTokens;
  target.totalTokens += src.totalTokens;
  target.costUsd += src.costUsd;
  target.errors += 'errors' in src ? src.errors : (src as SessionUsage).errorCount;
}

export function computeCost(
  input: number,
  output: number,
  cacheCreate: number,
  cacheRead: number,
  model: string,
): number {
  const p = getModelPrice(model);
  return (
    (input * p.input +
     output * p.output +
     cacheCreate * p.cacheWrite +
     cacheRead * p.cacheRead) / 1_000_000
  );
}

// ── Per-session extractor ─────────────────────────────────────

export function extractUsageFromSession(sessionFile: string, platform: string): SessionUsage | null {
  let content: string;
  try { content = readFileSync(sessionFile, 'utf-8'); } catch { return null; }

  const lines = content.split('\n').filter(Boolean);
  let input = 0, output = 0, cacheCreate = 0, cacheRead = 0;
  let turns = 0;
  let model = '';
  let firstTs = '';
  let lastTs = '';
  let errorCount = 0;

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try { entry = JSON.parse(line); } catch { continue; }

    const ts = String(entry.timestamp || '');
    if (ts && !firstTs) firstTs = ts;
    if (ts) lastTs = ts;

    if (entry.type === 'assistant') {
      const msg = entry.message as { model?: string; usage?: Record<string, unknown> } | undefined;
      if (!msg) continue;
      if (msg.model && !model) model = msg.model;
      const u = msg.usage || {};
      input       += Number(u.input_tokens || 0);
      output      += Number(u.output_tokens || 0);
      cacheCreate += Number(u.cache_creation_input_tokens || 0);
      cacheRead   += Number(u.cache_read_input_tokens || 0);
      turns += 1;
    } else if (entry.type === 'user') {
      const msg = entry.message as { content?: Array<{ type?: string; is_error?: boolean }> } | undefined;
      for (const item of msg?.content || []) {
        if (item && item.type === 'tool_result' && item.is_error) errorCount += 1;
      }
    }
  }

  if (turns === 0) return null;

  const costUsd = computeCost(input, output, cacheCreate, cacheRead, model);

  return {
    sessionId: basename(sessionFile, '.jsonl'),
    platform,
    model,
    modelFamily: getModelFamily(model),
    startedAt: firstTs,
    endedAt: lastTs,
    turns,
    inputTokens: input,
    outputTokens: output,
    cacheCreateTokens: cacheCreate,
    cacheReadTokens: cacheRead,
    totalTokens: input + output + cacheCreate + cacheRead,
    costUsd,
    errorCount,
  };
}

// ── Aggregators ───────────────────────────────────────────────

export interface UsageReport {
  // Per-day rollup across all platforms
  days: DailyUsage[];
  // Total across the entire timeframe
  totals: UsageTotals;
  // Per-platform totals for the timeframe
  byPlatform: Record<string, UsageTotals>;
  // Per-model totals for the timeframe (for the "where is budget going" breakdown)
  byModel: Record<string, UsageTotals>;
}

export interface HourlyUsageReport {
  hours: HourlyUsage[];
  totals: UsageTotals;
  byPlatform: Record<string, UsageTotals>;
  byModel: Record<string, UsageTotals>;
}

function dateKey(iso: string): string {
  return (iso || '').slice(0, 10);
}

function hourKey(iso: string): string {
  // "2026-04-14T06:12:34.000Z" → "2026-04-14T06"
  return (iso || '').slice(0, 13);
}

export function getUsageReport(platforms: string[], startDate: string, endDate: string): UsageReport {
  const report: UsageReport = {
    days: [],
    totals: emptyTotals(),
    byPlatform: {},
    byModel: {},
  };

  // date -> platform -> DailyUsage
  const dayMap = new Map<string, Map<string, DailyUsage>>();

  for (const platform of platforms) {
    for (const file of listSessionFiles(platform)) {
      const usage = extractUsageFromSession(file, platform);
      if (!usage) continue;

      const day = dateKey(usage.startedAt);
      if (!day) continue;
      if (day < startDate || day > endDate) continue;

      // Aggregate per day/platform
      if (!dayMap.has(day)) dayMap.set(day, new Map());
      const dayPlatforms = dayMap.get(day)!;
      const existing = dayPlatforms.get(platform) || {
        date: day,
        platform,
        sessions: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        errors: 0,
      };
      existing.sessions += 1;
      existing.inputTokens += usage.inputTokens;
      existing.outputTokens += usage.outputTokens;
      existing.cacheCreateTokens += usage.cacheCreateTokens;
      existing.cacheReadTokens += usage.cacheReadTokens;
      existing.totalTokens += usage.totalTokens;
      existing.costUsd += usage.costUsd;
      existing.errors += usage.errorCount;
      dayPlatforms.set(platform, existing);

      // Aggregate into totals
      addUsage(report.totals, usage);

      // Aggregate into byPlatform
      if (!report.byPlatform[platform]) report.byPlatform[platform] = emptyTotals();
      addUsage(report.byPlatform[platform], usage);

      // Aggregate into byModel (family bucket)
      const modelKey = usage.modelFamily;
      if (!report.byModel[modelKey]) report.byModel[modelKey] = emptyTotals();
      addUsage(report.byModel[modelKey], usage);
    }
  }

  // Flatten day map
  for (const [, platformMap] of dayMap) {
    for (const [, daily] of platformMap) {
      report.days.push(daily);
    }
  }
  report.days.sort((a, b) => a.date.localeCompare(b.date));

  return report;
}

export function getHourlyUsageReport(
  platforms: string[],
  startIso: string,
  endIso: string,
): HourlyUsageReport {
  const report: HourlyUsageReport = {
    hours: [],
    totals: emptyTotals(),
    byPlatform: {},
    byModel: {},
  };

  // hour -> platform -> HourlyUsage
  const hourMap = new Map<string, Map<string, HourlyUsage>>();

  for (const platform of platforms) {
    for (const file of listSessionFiles(platform)) {
      const usage = extractUsageFromSession(file, platform);
      if (!usage) continue;

      if (!usage.startedAt) continue;
      if (usage.startedAt < startIso || usage.startedAt > endIso) continue;

      const hr = hourKey(usage.startedAt);
      if (!hr) continue;

      if (!hourMap.has(hr)) hourMap.set(hr, new Map());
      const hourPlatforms = hourMap.get(hr)!;
      const existing = hourPlatforms.get(platform) || {
        hour: hr,
        platform,
        sessions: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        errors: 0,
      };
      existing.sessions += 1;
      existing.inputTokens += usage.inputTokens;
      existing.outputTokens += usage.outputTokens;
      existing.cacheCreateTokens += usage.cacheCreateTokens;
      existing.cacheReadTokens += usage.cacheReadTokens;
      existing.totalTokens += usage.totalTokens;
      existing.costUsd += usage.costUsd;
      existing.errors += usage.errorCount;
      hourPlatforms.set(platform, existing);

      addUsage(report.totals, usage);

      if (!report.byPlatform[platform]) report.byPlatform[platform] = emptyTotals();
      addUsage(report.byPlatform[platform], usage);

      const modelKey = usage.modelFamily;
      if (!report.byModel[modelKey]) report.byModel[modelKey] = emptyTotals();
      addUsage(report.byModel[modelKey], usage);
    }
  }

  for (const [, platformMap] of hourMap) {
    for (const [, hourly] of platformMap) {
      report.hours.push(hourly);
    }
  }
  report.hours.sort((a, b) => a.hour.localeCompare(b.hour));

  return report;
}
