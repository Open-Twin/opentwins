import type { Request, Response } from 'express';
import { launchChrome, stopChrome, isPortInUse, getProfilePort } from '../../browser/chrome.js';
import { openTab, navigateTo, closeTab, evaluate, clickElement, snapshot, getTabInfo } from '../../browser/cdp.js';
import { fileLog, fileError } from '../../util/logger.js';

// ── Browser control API ──────────────────────────────────────
// Used by agent templates via curl to control Chrome.
// Each handler wraps a cdp.ts/chrome.ts function.

// Auto-start Chrome if not running and clean stale tabs.
async function ensureChrome(profile: string): Promise<void> {
  const port = getProfilePort(profile);
  if (!isPortInUse(port)) {
    fileLog('browser', 'Auto-starting Chrome', { profile, port });
    await launchChrome(profile);
  }
  // Close stale tabs from previous sessions, keep only 1
  try {
    const tabs = JSON.parse(await getTabInfo(profile)) as Array<{ id: string }>;
    if (tabs.length > 1) {
      for (const tab of tabs.slice(1)) {
        await closeTab(profile, tab.id).catch(() => {});
      }
    }
  } catch { /* best effort */ }
}

export async function handleBrowserStart(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  try {
    await ensureChrome(profile);
    fileLog('browser', 'start', { profile });
    res.json({ ok: true, profile });
  } catch (err) {
    fileError('browser', 'start failed', { profile, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start Chrome' });
  }
}

export async function handleBrowserStop(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  try {
    const stopped = stopChrome(profile);
    fileLog('browser', 'stop', { profile, stopped });
    res.json({ ok: stopped, profile });
  } catch (err) {
    fileError('browser', 'stop failed', { profile, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to stop Chrome' });
  }
}

export async function handleBrowserOpen(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  const url = req.body?.url || 'about:blank';
  try {
    await ensureChrome(profile);
    const result = JSON.parse(await openTab(profile, url));
    fileLog('browser', 'open', { profile, url: url.slice(0, 120) });
    res.json(result);
  } catch (err) {
    fileError('browser', 'open failed', { profile, url: url.slice(0, 120), error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to open tab' });
  }
}

export async function handleBrowserNavigate(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  const url = req.body?.url;
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }
  try {
    await ensureChrome(profile);
    const result = JSON.parse(await navigateTo(profile, url));
    fileLog('browser', 'navigate', { profile, url: url.slice(0, 120) });
    res.json(result);
  } catch (err) {
    fileError('browser', 'navigate failed', { profile, url: url.slice(0, 120), error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to navigate' });
  }
}

export async function handleBrowserClose(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  const tabId = req.body?.tabId;
  try {
    const result = JSON.parse(await closeTab(profile, tabId));
    fileLog('browser', 'close', { profile });
    res.json(result);
  } catch (err) {
    fileError('browser', 'close failed', { profile, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to close tab' });
  }
}

export async function handleBrowserEvaluate(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  const fn = req.body?.fn;
  if (!fn) { res.status(400).json({ error: 'fn is required' }); return; }
  try {
    await ensureChrome(profile);
    const data = req.body?.data;
    const result = JSON.parse(await evaluate(profile, fn, data));
    fileLog('browser', 'evaluate', { profile, fnLen: fn.length, hasData: !!data, ok: !result.error });
    res.json(result);
  } catch (err) {
    fileError('browser', 'evaluate failed', { profile, fnLen: fn.length, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to evaluate' });
  }
}

export async function handleBrowserClick(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  const selector = req.body?.selector;
  if (!selector) { res.status(400).json({ error: 'selector is required' }); return; }
  try {
    await ensureChrome(profile);
    const result = JSON.parse(await clickElement(profile, selector));
    fileLog('browser', 'click', { profile, selector });
    res.json(result);
  } catch (err) {
    fileError('browser', 'click failed', { profile, selector, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to click' });
  }
}

export async function handleBrowserSnapshot(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  const { selector, compact, interactive, depth } = req.body || {};
  try {
    await ensureChrome(profile);
    const result = JSON.parse(await snapshot(profile, selector, {
      compact: !!compact,
      interactive: !!interactive,
      depth: parseInt(depth) || 6,
    }));
    fileLog('browser', 'snapshot', { profile, selector });
    res.json(result);
  } catch (err) {
    fileError('browser', 'snapshot failed', { profile, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to snapshot' });
  }
}

export async function handleBrowserTabs(req: Request, res: Response): Promise<void> {
  const profile = req.params.profile as string;
  try {
    const result = JSON.parse(await getTabInfo(profile));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list tabs' });
  }
}
