import type { Request, Response } from 'express';
import { getDb } from '../../db/index.js';

export function getQualityMetrics(req: Request, res: Response): void {
  const { platform, date, days } = req.query;
  const targetDate = (date as string) || new Date().toISOString().split('T')[0];
  const numDays = parseInt((days as string) || '7');

  const db = getDb();

  if (platform) {
    // Single platform quality for a date
    const summary = db
      .prepare('SELECT * FROM today_summaries WHERE platform = ? AND date = ?')
      .get(platform, targetDate);

    // Style distribution over time
    const styleHistory = db
      .prepare(
        `SELECT date, styles, comments, disagreements, avg_words
         FROM today_summaries
         WHERE platform = ?
         AND date >= date(?, '-' || ? || ' days')
         ORDER BY date ASC`
      )
      .all(platform, targetDate, numDays);

    // Em-dash violations today
    const emDashCount = db
      .prepare(
        `SELECT COUNT(*) as count FROM activity_logs
         WHERE platform = ?
         AND date(created_at) = ?
         AND (content LIKE '%—%' OR content LIKE '%--%')`
      )
      .get(platform, targetDate) as { count: number } | undefined;

    res.json({
      today: summary || null,
      history: styleHistory,
      emDashViolations: emDashCount?.count || 0,
    });
  } else {
    // All platforms quality for a date
    const summaries = db
      .prepare('SELECT * FROM today_summaries WHERE date = ?')
      .all(targetDate);
    res.json(summaries);
  }
}

export function getDisagreementRatio(req: Request, res: Response): void {
  const { platform, days } = req.query;
  const numDays = parseInt((days as string) || '30');
  const today = new Date().toISOString().split('T')[0];

  const db = getDb();

  const data = db
    .prepare(
      `SELECT date, comments, disagreements,
              CASE WHEN comments > 0
                THEN ROUND(CAST(disagreements AS REAL) / comments * 100, 1)
                ELSE 0
              END as disagreement_pct
       FROM today_summaries
       WHERE platform = ?
       AND date >= date(?, '-' || ? || ' days')
       ORDER BY date ASC`
    )
    .all(platform || 'reddit', today, numDays);

  res.json(data);
}
