import { getDb } from './index.js';

export function logActivity(
  platform: string,
  actionType: string,
  targetUrl: string | null,
  targetAuthor: string | null,
  style: string | null,
  content: string | null,
  wordCount: number | null
): void {
  getDb()
    .prepare(
      `INSERT INTO activity_logs (platform, action_type, target_url, target_author, style, content, word_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(platform, actionType, targetUrl, targetAuthor, style, content, wordCount);
}

export function upsertTodaySummary(
  platform: string,
  date: string,
  data: {
    comments?: number;
    styles?: Record<string, number>;
    disagreements?: number;
    questions?: number;
    avg_words?: number;
    last_style?: string;
    last_snippet?: string;
  }
): void {
  getDb()
    .prepare(
      `INSERT INTO today_summaries (platform, date, comments, styles, disagreements, questions, avg_words, last_style, last_snippet)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(platform, date) DO UPDATE SET
         comments = excluded.comments,
         styles = excluded.styles,
         disagreements = excluded.disagreements,
         questions = excluded.questions,
         avg_words = excluded.avg_words,
         last_style = excluded.last_style,
         last_snippet = excluded.last_snippet`
    )
    .run(
      platform,
      date,
      data.comments ?? 0,
      JSON.stringify(data.styles ?? {}),
      data.disagreements ?? 0,
      data.questions ?? 0,
      data.avg_words ?? 0,
      data.last_style ?? 'none',
      data.last_snippet ?? ''
    );
}

export function trackEngagement(
  platform: string,
  trackingType: string,
  targetId: string
): boolean {
  try {
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO engagement_tracking (platform, tracking_type, target_id) VALUES (?, ?, ?)'
      )
      .run(platform, trackingType, targetId);
    return true;
  } catch {
    return false;
  }
}

export function isTracked(
  platform: string,
  trackingType: string,
  targetId: string
): boolean {
  const row = getDb()
    .prepare(
      'SELECT 1 FROM engagement_tracking WHERE platform = ? AND tracking_type = ? AND target_id = ?'
    )
    .get(platform, trackingType, targetId);
  return !!row;
}

export function logAgentRun(
  agentName: string,
  status: 'running' | 'completed' | 'failed',
  startedAt?: string,
  completedAt?: string,
  durationMs?: number,
  actionsSummary?: string,
  error?: string
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO agent_runs (agent_name, status, started_at, completed_at, duration_ms, actions_summary, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(agentName, status, startedAt, completedAt, durationMs, actionsSummary, error);
  return Number(result.lastInsertRowid);
}

export function getActivityForDate(date: string, platform?: string): unknown[] {
  if (platform) {
    return getDb()
      .prepare(
        "SELECT * FROM activity_logs WHERE platform = ? AND date(created_at) = ? ORDER BY created_at DESC"
      )
      .all(platform, date);
  }
  return getDb()
    .prepare("SELECT * FROM activity_logs WHERE date(created_at) = ? ORDER BY created_at DESC")
    .all(date);
}

export function getAgentRuns(date: string): unknown[] {
  return getDb()
    .prepare("SELECT * FROM agent_runs WHERE date(started_at) = ? ORDER BY started_at DESC")
    .all(date);
}

export function getQualityMetrics(platform: string, date: string): unknown {
  return getDb()
    .prepare("SELECT * FROM today_summaries WHERE platform = ? AND date = ?")
    .get(platform, date);
}
