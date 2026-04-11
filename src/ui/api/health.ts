import type { Request, Response } from 'express';
import { getProfilePort, isPortInUse } from '../../browser/chrome.js';
import { getBrowserProfilesConfigPath } from '../../util/paths.js';
import { existsSync, readFileSync } from 'node:fs';

// ── Browser health probe ─────────────────────────────────────

interface BrowserHealth {
  running: boolean;
  activeProfiles: number;
  totalProfiles: number;
  error?: string;
}

function checkBrowserHealth(): BrowserHealth {
  const configPath = getBrowserProfilesConfigPath();
  if (!existsSync(configPath)) {
    return { running: false, activeProfiles: 0, totalProfiles: 0 };
  }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const profiles = config.profiles || [];
    let active = 0;
    for (const p of profiles) {
      const name = p.browserProfile || `ot-${p.platform}`;
      const port = getProfilePort(name);
      if (isPortInUse(port)) active++;
    }
    return { running: active > 0, activeProfiles: active, totalProfiles: profiles.length };
  } catch (err) {
    return {
      running: false,
      activeProfiles: 0,
      totalProfiles: 0,
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
    claudeStatusCache = { data: null, fetchedAt: Date.now() };
    return null;
  }
}

// ── GET /api/health ───────────────────────────────────────────

export async function handleHealth(_req: Request, res: Response): Promise<void> {
  const [browser, claude] = await Promise.all([
    Promise.resolve(checkBrowserHealth()),
    checkClaudeStatus(),
  ]);
  res.json({ browser, claude });
}
