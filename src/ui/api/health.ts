import type { Request, Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

// ── OpenClaw gateway probe ────────────────────────────────────

interface OpenclawHealth {
  running: boolean;
  port: number;
  error?: string;
}

function getOpenclawGatewayPort(): number {
  const configPath = resolve(homedir(), '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) return 18789;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config?.gateway?.port || 18789;
  } catch {
    return 18789;
  }
}

async function checkOpenclawGateway(): Promise<OpenclawHealth> {
  const port = getOpenclawGatewayPort();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return { running: res.ok, port };
  } catch (err) {
    return {
      running: false,
      port,
      error: err instanceof Error ? err.message : 'probe failed',
    };
  }
}

// ── Claude (Anthropic) status page ────────────────────────────
// Fetched from status.claude.com (Statuspage API). Cached for 60s to avoid rate limits.

interface ClaudeStatus {
  indicator: 'none' | 'minor' | 'major' | 'critical' | 'maintenance' | 'unknown';
  description: string;
  updated_at: string;
  page_url: string;
}

let claudeStatusCache: { data: ClaudeStatus | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};

const CLAUDE_STATUS_CACHE_MS = 60_000;

async function checkClaudeStatus(): Promise<ClaudeStatus | null> {
  // Serve from cache if fresh
  if (Date.now() - claudeStatusCache.fetchedAt < CLAUDE_STATUS_CACHE_MS && claudeStatusCache.data) {
    return claudeStatusCache.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://status.claude.com/api/v2/status.json', { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      claudeStatusCache = { data: null, fetchedAt: Date.now() };
      return null;
    }

    const data = await res.json() as {
      page?: { updated_at?: string; url?: string };
      status?: { indicator?: string; description?: string };
    };

    const indicator = (data.status?.indicator || 'unknown') as ClaudeStatus['indicator'];
    const parsed: ClaudeStatus = {
      indicator,
      description: data.status?.description || 'Unknown',
      updated_at: data.page?.updated_at || '',
      page_url: data.page?.url || 'https://status.claude.com',
    };

    claudeStatusCache = { data: parsed, fetchedAt: Date.now() };
    return parsed;
  } catch {
    // Cache the failure briefly so we don't hammer the endpoint
    claudeStatusCache = { data: null, fetchedAt: Date.now() };
    return null;
  }
}

// ── GET /api/health ───────────────────────────────────────────

export async function handleHealth(_req: Request, res: Response): Promise<void> {
  const [openclaw, claude] = await Promise.all([
    checkOpenclawGateway(),
    checkClaudeStatus(),
  ]);
  res.json({ openclaw, claude });
}
