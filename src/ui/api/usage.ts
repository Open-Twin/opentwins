import type { Request, Response } from 'express';
import { configExists, loadConfig } from '../../config/loader.js';
import { getUsageReport } from '../../util/usage-parser.js';

// GET /api/usage?days=7|14|30&platform=linkedin
// Returns a token/cost/error report aggregated from Claude session JSONLs.

export function handleUsage(req: Request, res: Response): void {
  if (!configExists()) {
    res.json({ days: [], totals: emptyTotals(), byPlatform: {}, byModel: {} });
    return;
  }

  try {
    const config = loadConfig();
    const { platform, days } = req.query;
    const numDays = Math.max(1, Math.min(90, parseInt((days as string) || '7')));

    // Compute start/end dates (inclusive)
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    const start = new Date(now);
    start.setDate(start.getDate() - (numDays - 1));
    const startDate = start.toISOString().split('T')[0];

    const platforms = platform
      ? config.platforms.filter((p) => p.platform === platform).map((p) => p.platform)
      : config.platforms.map((p) => p.platform);

    const report = getUsageReport(platforms, startDate, end);
    res.json({
      ...report,
      range: { start: startDate, end, days: numDays },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Usage report failed' });
  }
}

function emptyTotals() {
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
