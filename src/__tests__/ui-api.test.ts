import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { VALID_CONFIG } from './fixtures/config.js';

let tmpDir: string;
let portInUseValue = false;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getConfigPath: () => resolve(tmpDir, 'config.json'),
    getWorkspacesDir: () => resolve(tmpDir, 'workspaces'),
    getPlatformWorkspaceDir: (p: string) => resolve(tmpDir, 'workspaces', `agent-${p}`),
    getPipelineWorkspaceDir: () => resolve(tmpDir, 'workspaces', 'pipeline'),
    getBrowserProfilesDir: () => resolve(tmpDir, 'browser-profiles'),
    getBrowserProfilesConfigPath: () => resolve(tmpDir, 'browser-profiles', 'profiles.json'),
    getLocksDir: () => resolve(tmpDir, 'locks'),
    getLockFile: (n: string) => resolve(tmpDir, 'locks', `${n}.lock`),
    getLastHeartbeatFile: (n: string) => resolve(tmpDir, 'locks', `${n}.last_heartbeat`),
  };
});

vi.mock('../util/claude.js', () => ({
  runClaudeAgent: vi.fn(async () => ({ output: 'ok', durationMs: 1, exitCode: 0 })),
  validateAuth: vi.fn(async () => true),
  isClaudeInstalled: vi.fn(async () => true),
}));

vi.mock('../browser/chrome.js', () => ({
  getProfilePort: () => 19200,
  isPortInUse: () => portInUseValue,
  isChromeInstalled: () => true,
  launchChrome: vi.fn(async () => ({ pid: 1, port: 19200, profileName: 'ot-linkedin' })),
  stopChrome: vi.fn(() => true),
}));

vi.mock('../scheduler/daemon.js', () => ({
  startDaemon: vi.fn(async () => 99999),
  stopDaemon: vi.fn(async () => true),
  isDaemonRunning: vi.fn(async () => false),
}));

vi.mock('../browser/cdp.js', () => ({
  openTab: vi.fn(async () => JSON.stringify({ ok: true, tabId: 'x' })),
  navigateTo: vi.fn(async () => JSON.stringify({ ok: true })),
  closeTab: vi.fn(async () => JSON.stringify({ ok: true })),
  evaluate: vi.fn(async () => JSON.stringify({ ok: true, value: 42 })),
  clickElement: vi.fn(async () => JSON.stringify({ ok: true })),
  snapshot: vi.fn(async () => JSON.stringify({ ok: true })),
  getTabInfo: vi.fn(async () => JSON.stringify([])),
}));

// Minimal Express-ish req/res helpers that capture status/body.
function mockRes() {
  const r: Record<string, unknown> & {
    statusCode: number;
    body: unknown;
    status(code: number): typeof r;
    json(data: unknown): typeof r;
    send(data: unknown): typeof r;
    sendFile(path: string): typeof r;
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
    send(data: unknown) { this.body = data; return this; },
    sendFile(_p: string) { return this; },
  };
  return r;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return { query: {}, params: {}, body: {}, ...overrides } as unknown as import('express').Request;
}

async function waitFor(condition: () => boolean, timeout = 500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('ui/api/health', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-health-'));
    portInUseValue = false;
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('reports 0 profiles when no profiles.json exists', async () => {
    const { handleHealth } = await import('../ui/api/health.js');
    const res = mockRes();
    await handleHealth(mockReq() as any, res as any);
    const body = res.body as { browser: { running: boolean; activeProfiles: number; totalProfiles: number } };
    expect(body.browser.running).toBe(false);
    expect(body.browser.activeProfiles).toBe(0);
    expect(body.browser.totalProfiles).toBe(0);
  });

  it('counts running and total profiles from profiles.json', async () => {
    const dir = resolve(tmpDir, 'browser-profiles');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'profiles.json'), JSON.stringify({
      profiles: [
        { platform: 'linkedin', browserProfile: 'ot-linkedin' },
        { platform: 'twitter', browserProfile: 'ot-twitter' },
      ],
    }), 'utf-8');
    portInUseValue = true;

    const { handleHealth } = await import('../ui/api/health.js');
    const res = mockRes();
    await handleHealth(mockReq() as any, res as any);
    const body = res.body as { browser: { running: boolean; activeProfiles: number; totalProfiles: number } };
    expect(body.browser.totalProfiles).toBe(2);
    expect(body.browser.activeProfiles).toBe(2);
    expect(body.browser.running).toBe(true);
  });

  it('surfaces a probe error on malformed profiles.json', async () => {
    const dir = resolve(tmpDir, 'browser-profiles');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'profiles.json'), '{ bad', 'utf-8');

    const { handleHealth } = await import('../ui/api/health.js');
    const res = mockRes();
    await handleHealth(mockReq() as any, res as any);
    const body = res.body as { browser: { running: boolean; error?: string } };
    expect(body.browser.running).toBe(false);
    expect(body.browser.error).toBeDefined();
  });
});

describe('ui/api/setup handleSetupStatus', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-setup-'));
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('reports configured:false when no config exists', async () => {
    const { handleSetupStatus } = await import('../ui/api/setup.js');
    const res = mockRes();
    await handleSetupStatus(mockReq() as any, res as any);
    const body = res.body as { configured: boolean; prereqs: { claude: boolean; chrome: boolean } };
    expect(body.configured).toBe(false);
    expect(body.prereqs.claude).toBe(true);
    expect(body.prereqs.chrome).toBe(true);
  });

  it('reports configured:true when config.json exists', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), '{}', 'utf-8');

    const { handleSetupStatus } = await import('../ui/api/setup.js');
    const res = mockRes();
    await handleSetupStatus(mockReq() as any, res as any);
    const body = res.body as { configured: boolean };
    expect(body.configured).toBe(true);
  });
});

describe('ui/api/setup handleValidateAuth', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-setup-validate-'));
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('rejects invalid auth mode', async () => {
    const { handleValidateAuth } = await import('../ui/api/setup.js');
    const res = mockRes();
    await handleValidateAuth(mockReq({ body: { mode: 'nope' } }) as any, res as any);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/Invalid auth mode/);
  });

  it('rejects subscription mode without claude_token', async () => {
    const { handleValidateAuth } = await import('../ui/api/setup.js');
    const res = mockRes();
    await handleValidateAuth(mockReq({ body: { mode: 'subscription' } }) as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('rejects api_key mode without api_key', async () => {
    const { handleValidateAuth } = await import('../ui/api/setup.js');
    const res = mockRes();
    await handleValidateAuth(mockReq({ body: { mode: 'api_key' } }) as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('returns ok:true when validateAuth succeeds', async () => {
    const { handleValidateAuth } = await import('../ui/api/setup.js');
    const res = mockRes();
    await handleValidateAuth(mockReq({ body: { mode: 'api_key', api_key: 'sk-ant-api-x' } }) as any, res as any);
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });
});

describe('ui/api/config handleUpdateConfig', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-cfg-update-'));
    vi.resetModules();
    // Seed config.
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('400s on validation errors', async () => {
    const { handleUpdateConfig } = await import('../ui/api/config.js');
    const res = mockRes();
    // Empty pillars violates min(1).
    await handleUpdateConfig(
      mockReq({ body: { pillars: [] } }) as any,
      res as any,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/Validation failed/);
  });

  it('ignores an auth payload in the body (keeps existing auth)', async () => {
    const { handleUpdateConfig } = await import('../ui/api/config.js');
    const res = mockRes();
    await handleUpdateConfig(
      mockReq({ body: { auth: { mode: 'api_key', api_key: 'hacker' }, timezone: 'Europe/Berlin' } }) as any,
      res as any,
    );
    // Persisted config still has the original auth.
    const persisted = JSON.parse(readFileSync(resolve(tmpDir, 'config.json'), 'utf-8'));
    expect(persisted.auth.api_key).toBe(VALID_CONFIG.auth.api_key);
    expect(persisted.timezone).toBe('Europe/Berlin');
  });

  it('cleans up workspaces for removed platforms', async () => {
    // Put a stub workspace for twitter on disk.
    const twitterDir = resolve(tmpDir, 'workspaces', 'agent-twitter');
    mkdirSync(twitterDir, { recursive: true });
    writeFileSync(resolve(twitterDir, 'marker.txt'), 'hi', 'utf-8');

    const { handleUpdateConfig } = await import('../ui/api/config.js');
    const res = mockRes();

    // Post a config with twitter removed.
    const newPlatforms = VALID_CONFIG.platforms.filter((p) => p.platform !== 'twitter');
    await handleUpdateConfig(
      mockReq({ body: { platforms: newPlatforms } }) as any,
      res as any,
    );

    // twitter workspace should be gone.
    expect(existsSync(twitterDir)).toBe(false);
  });
});

describe('ui/api/usage handleUsage', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-usage-'));
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns empty report when no config exists', async () => {
    const { handleUsage } = await import('../ui/api/usage.js');
    const res = mockRes();
    handleUsage(mockReq() as any, res as any);
    await waitFor(() => !!res.body);

    const body = res.body as { days: unknown[]; totals: { sessions: number; costUsd: number } };
    expect(body.days).toEqual([]);
    expect(body.totals.sessions).toBe(0);
    expect(body.totals.costUsd).toBe(0);
  });

  it('clamps days query parameter into [1, 90]', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');

    const { handleUsage } = await import('../ui/api/usage.js');
    const res = mockRes();
    handleUsage(mockReq({ query: { days: '999' } }) as any, res as any);
    await waitFor(() => !!res.body);

    const body = res.body as { range: { days: number } };
    expect(body.range.days).toBe(90);
  });

  it('clamps negative or zero days to 1', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');

    const { handleUsage } = await import('../ui/api/usage.js');
    const res = mockRes();
    handleUsage(mockReq({ query: { days: '-5' } }) as any, res as any);
    await waitFor(() => !!res.body);

    const body = res.body as { range: { days: number } };
    expect(body.range.days).toBe(1);
  });
});

describe('ui/api/agents', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-agents-'));
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('handleListAgents returns [] when config does not exist', async () => {
    const { handleListAgents } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleListAgents(mockReq() as any, res as any);
    expect(res.body).toEqual([]);
  });

  it('handleListAgents lists entries from config', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');

    const { handleListAgents } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleListAgents(mockReq() as any, res as any);
    const body = res.body as Array<{ platform: string; enabled: boolean; auto_run: boolean }>;
    expect(body).toHaveLength(VALID_CONFIG.platforms.length);
    expect(body.map((a) => a.platform).sort()).toEqual(['linkedin', 'twitter']);
    expect(body.every((a) => typeof a.auto_run === 'boolean')).toBe(true);
  });

  it('handleGetAgent 400s on unknown platform', async () => {
    const { handleGetAgent } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleGetAgent(mockReq({ params: { platform: 'myspace' } }) as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('handleGetAgent 404s when no config exists', async () => {
    const { handleGetAgent } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleGetAgent(mockReq({ params: { platform: 'linkedin' } }) as any, res as any);
    expect(res.statusCode).toBe(404);
  });

  it('handleGetAgent returns agent state when config exists', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');

    const { handleGetAgent } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleGetAgent(mockReq({ params: { platform: 'linkedin' } }) as any, res as any);

    const body = res.body as { platform: string; state: string; enabled: boolean; auto_run: boolean };
    expect(body.platform).toBe('linkedin');
    expect(body.enabled).toBe(true);
    expect(body.auto_run).toBe(true);
    // No browser profile set yet → needs_setup
    expect(body.state).toBe('needs_setup');
  });

  it('handleUpdateLimits 404s when workspace missing', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');

    const { handleUpdateLimits } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleUpdateLimits(
      mockReq({ params: { platform: 'linkedin' }, body: { daily: { comments: { limit: 10 } } } }) as any,
      res as any,
    );
    expect(res.statusCode).toBe(404);
  });

  it('handleUpdateLimits 400s on non-object body', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');
    const workspaceDir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    mkdirSync(workspaceDir, { recursive: true });

    const { handleUpdateLimits } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleUpdateLimits(
      mockReq({ params: { platform: 'linkedin' }, body: null }) as any,
      res as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('handleUpdateLimits preserves existing current counters', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');
    const workspaceDir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(resolve(workspaceDir, 'limits.json'), JSON.stringify({
      daily: { comments: { limit: 4, current: 3 } },
    }), 'utf-8');

    const { handleUpdateLimits } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleUpdateLimits(
      mockReq({ params: { platform: 'linkedin' }, body: { daily: { comments: { limit: 10 } } } }) as any,
      res as any,
    );
    expect((res.body as { ok: boolean }).ok).toBe(true);

    const saved = JSON.parse(readFileSync(resolve(workspaceDir, 'limits.json'), 'utf-8'));
    expect(saved.daily.comments.limit).toBe(10);
    // current is preserved, not reset to 0.
    expect(saved.daily.comments.current).toBe(3);
  });

  it('handleUpdateAgent toggles auto_run and persists to config', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');
    const workspaceDir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    mkdirSync(workspaceDir, { recursive: true });

    const { handleUpdateAgent } = await import('../ui/api/agents.js');
    const res = mockRes();
    await handleUpdateAgent(
      mockReq({ params: { platform: 'linkedin' }, body: { auto_run: false } }) as any,
      res as any,
    );
    expect((res.body as { ok: boolean; auto_run: boolean }).ok).toBe(true);
    expect((res.body as { auto_run: boolean }).auto_run).toBe(false);

    const saved = JSON.parse(readFileSync(resolve(tmpDir, 'config.json'), 'utf-8'));
    expect(saved.platforms[0].auto_run).toBe(false);
  });

  it('handleUpdateAgent updates heartbeat_interval_minutes', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');
    const workspaceDir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    mkdirSync(workspaceDir, { recursive: true });

    const { handleUpdateAgent } = await import('../ui/api/agents.js');
    const res = mockRes();
    await handleUpdateAgent(
      mockReq({ params: { platform: 'linkedin' }, body: { heartbeat_interval_minutes: 30 } }) as any,
      res as any,
    );
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect((res.body as { heartbeat_interval_minutes: number }).heartbeat_interval_minutes).toBe(30);

    const saved = JSON.parse(readFileSync(resolve(tmpDir, 'config.json'), 'utf-8'));
    expect(saved.platforms[0].heartbeat_interval_minutes).toBe(30);
  });

  it('handleUpdateAgent clamps heartbeat_interval_minutes to valid range', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');
    const workspaceDir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    mkdirSync(workspaceDir, { recursive: true });

    const { handleUpdateAgent } = await import('../ui/api/agents.js');
    const res = mockRes();
    await handleUpdateAgent(
      mockReq({ params: { platform: 'linkedin' }, body: { heartbeat_interval_minutes: 5 } }) as any,
      res as any,
    );
    expect((res.body as { heartbeat_interval_minutes: number }).heartbeat_interval_minutes).toBe(15);
  });

  it('handleGetAgentFeed 400s on unknown platform', async () => {
    const { handleGetAgentFeed } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleGetAgentFeed(mockReq({ params: { platform: 'nope' } }) as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('handleGetAgentFeed returns empty events when no session file exists', async () => {
    const { handleGetAgentFeed } = await import('../ui/api/agents.js');
    const res = mockRes();
    handleGetAgentFeed(mockReq({ params: { platform: 'linkedin' } }) as any, res as any);
    expect(res.body).toEqual({ events: [], sessionFile: null });
  });
});

describe('ui/api/browser', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-ui-browser-'));
    vi.resetModules();
    portInUseValue = true; // skip auto-launch path
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('handleBrowserNavigate 400s without a url', async () => {
    const { handleBrowserNavigate } = await import('../ui/api/browser.js');
    const res = mockRes();
    await handleBrowserNavigate(
      mockReq({ params: { profile: 'ot-linkedin' }, body: {} }) as any,
      res as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('handleBrowserEvaluate 400s without an fn', async () => {
    const { handleBrowserEvaluate } = await import('../ui/api/browser.js');
    const res = mockRes();
    await handleBrowserEvaluate(
      mockReq({ params: { profile: 'ot-linkedin' }, body: {} }) as any,
      res as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('handleBrowserClick 400s without a selector', async () => {
    const { handleBrowserClick } = await import('../ui/api/browser.js');
    const res = mockRes();
    await handleBrowserClick(
      mockReq({ params: { profile: 'ot-linkedin' }, body: {} }) as any,
      res as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('handleBrowserNavigate returns JSON from cdp.navigateTo', async () => {
    const { handleBrowserNavigate } = await import('../ui/api/browser.js');
    const res = mockRes();
    await handleBrowserNavigate(
      mockReq({ params: { profile: 'ot-linkedin' }, body: { url: 'https://example.com' } }) as any,
      res as any,
    );
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it('handleBrowserTabs returns an array (not a string)', async () => {
    const { handleBrowserTabs } = await import('../ui/api/browser.js');
    const res = mockRes();
    await handleBrowserTabs(mockReq({ params: { profile: 'ot-linkedin' } }) as any, res as any);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
