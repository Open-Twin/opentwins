import type { Request, Response } from 'express';
import { configExists, loadConfig } from '../../config/loader.js';
import { getUsageReport, getHourlyUsageReport } from '../../util/usage-parser.js';

// GET /api/usage?days=7|14|30&platform=linkedin
// GET /api/usage?hours=24&platform=linkedin
// Returns a token/cost/error report aggregated from Claude session JSONLs.

export function handleUsage(req: Request, res: Response): void {
  if (!configExists()) {
    res.json({ days: [], totals: emptyTotals(), byPlatform: {}, byModel: {} });
    return;
  }

  try {
    const config = loadConfig();
    const { platform, days, hours } = req.query;
    const platforms = platform
      ? config.platforms.filter((p) => p.platform === platform).map((p) => p.platform)
      : config.platforms.map((p) => p.platform);

    if (hours) {
      const numHours = Math.max(1, Math.min(168, parseInt(hours as string)));
      const end = new Date();
      const start = new Date(end.getTime() - (numHours - 1) * 3600000);
      // Align start to the top of its hour so empty-hour fill works cleanly
      start.setMinutes(0, 0, 0);
      const report = getHourlyUsageReport(platforms, start.toISOString(), end.toISOString());
      res.json({
        ...report,
        range: {
          start: start.toISOString(),
          end: end.toISOString(),
          hours: numHours,
        },
      });
      return;
    }

    const numDays = Math.max(1, Math.min(90, parseInt((days as string) || '7')));
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    const startD = new Date(now);
    startD.setDate(startD.getDate() - (numDays - 1));
    const startDate = startD.toISOString().split('T')[0];

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
