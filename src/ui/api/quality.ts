import type { Request, Response } from 'express';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

function readHistorySummaries(platform: string, days: number): TodaySummary[] {
  const dir = getPlatformWorkspaceDir(platform);
  const memoryDir = resolve(dir, 'memory');
  if (!existsSync(memoryDir)) return [];

  // Read all date-named .md files and look for matching today_summary data
  // The today_summary.json only has current day, so for history we parse memory logs
  const today = new Date();
  const results: TodaySummary[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const logFile = resolve(memoryDir, `${dateStr}.md`);
    if (!existsSync(logFile)) continue;

    try {
      const content = readFileSync(logFile, 'utf-8');
      // Count comments, disagreements from memory log
      const commentMatches = content.match(/## \d{4}-\d{2}-\d{2} .* - Comment/g);
      const replyMatches = content.match(/## \d{4}-\d{2}-\d{2} .* - Reply/g);
      const comments = (commentMatches?.length || 0) + (replyMatches?.length || 0);

      // Extract style mentions
      const styles: Record<string, number> = {};
      const styleMatches = content.match(/Style: (\w+)/g);
      if (styleMatches) {
        for (const m of styleMatches) {
          const s = m.replace('Style: ', '');
          styles[s] = (styles[s] || 0) + 1;
        }
      }

      // Count disagreements
      const disagreeMatches = content.match(/Style: disagree/gi);
      const disagreements = disagreeMatches?.length || 0;

      if (comments > 0) {
        results.push({
          date: dateStr,
          comments,
          styles,
          disagreements,
          questions: 0,
          avg_words: 0,
          last_style: '',
        });
      }
    } catch { /* skip */ }
  }

  // Add today's summary if it exists and matches
  const todaySummary = readTodaySummary(platform);
  if (todaySummary && todaySummary.date === today.toISOString().split('T')[0]) {
    const existing = results.find((r) => r.date === todaySummary.date);
    if (existing) {
      // Merge - today_summary.json has more accurate data
      Object.assign(existing, todaySummary);
    } else {
      results.unshift(todaySummary);
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

export function getQualityMetrics(req: Request, res: Response): void {
  const { platform, days } = req.query;
  const numDays = parseInt((days as string) || '7');

  if (!configExists()) {
    res.json(platform ? { today: null, history: [], emDashViolations: 0 } : []);
    return;
  }

  if (platform) {
    const todaySummary = readTodaySummary(platform as string);
    const history = readHistorySummaries(platform as string, numDays);

    res.json({
      today: todaySummary ? {
        platform,
        ...todaySummary,
        styles: JSON.stringify(todaySummary.styles),
      } : null,
      history: history.map((h) => ({
        ...h,
        styles: JSON.stringify(h.styles),
      })),
      emDashViolations: 0,
    });
  } else {
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
}

export function getDisagreementRatio(req: Request, res: Response): void {
  const { platform, days } = req.query;
  const numDays = parseInt((days as string) || '30');
  const p = (platform as string) || 'linkedin';

  const history = readHistorySummaries(p, numDays);
  const data = history.map((h) => ({
    date: h.date,
    comments: h.comments,
    disagreements: h.disagreements,
    disagreement_pct: h.comments > 0 ? Math.round((h.disagreements / h.comments) * 1000) / 10 : 0,
  }));

  res.json(data);
}
