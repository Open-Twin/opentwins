import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { execa } from 'execa';
import chalk from 'chalk';
import {
  getBrowserProfilesDir,
  getBrowserProfilesConfigPath,
} from '../util/paths.js';
import * as log from '../util/logger.js';

// All browser profiles are managed by OpenClaw. OpenTwins keeps a small tracking file
// at ~/.opentwins/browser-profiles/profiles.json so `hasBrowserProfile()` (used by the
// Agents state machine) can check quickly without shelling out to OpenClaw.

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500', twitter: '#1DA1F2', linkedin: '#0A66C2', bluesky: '#0085FF',
  threads: '#000000', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF',
  ph: '#DA552F', ih: '#4F46E5',
};

const PLATFORM_LOGIN_URLS: Record<string, string> = {
  linkedin: 'https://www.linkedin.com/login',
  twitter:  'https://x.com/login',
  reddit:   'https://www.reddit.com/login',
  bluesky:  'https://bsky.app/',
  threads:  'https://www.threads.net/login',
  medium:   'https://medium.com/m/signin',
  substack: 'https://substack.com/sign-in',
  devto:    'https://dev.to/enter',
  ph:       'https://www.producthunt.com/?login=true',
  ih:       'https://www.indiehackers.com/login',
};

export interface ProfileConfig {
  platform: string;
  createdAt: string;
  openclawProfile: string;
  // Legacy fields (ignored, kept for backward compat with existing profiles.json)
  port?: number;
  profileDir?: string;
}

interface ProfilesConfig {
  profiles: ProfileConfig[];
  nextPort?: number; // legacy
}

function loadProfilesConfig(): ProfilesConfig {
  const path = getBrowserProfilesConfigPath();
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return { profiles: [] };
    }
  }
  return { profiles: [] };
}

function saveProfilesConfig(config: ProfilesConfig): void {
  const dir = getBrowserProfilesDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getBrowserProfilesConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function openclawProfileName(platform: string): string {
  return `ot-${platform}`;
}

// ── OpenClaw helpers ──────────────────────────────────────────

async function listOpenclawProfiles(): Promise<Array<{ name: string; status: string }>> {
  try {
    const result = await execa('openclaw', ['browser', 'profiles'], { reject: false, timeout: 10000 });
    if (result.exitCode !== 0) return [];

    // Output format is:
    //   profile-name: status
    //     port: 18801, color: #E4405F
    // We only want the top-level lines that match a profile name pattern.
    // Profile names are lowercase alphanumeric with hyphens per OpenClaw rules.
    const entries: Array<{ name: string; status: string }> = [];
    for (const rawLine of result.stdout.split('\n')) {
      // Strip ANSI escape codes
      const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '');
      // Must start at column 0 and look like "name: status"
      const match = line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/);
      if (match) {
        entries.push({ name: match[1], status: match[2].trim() });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

// The `openclaw browser create-profile` CLI command fails with
// "cannot mutate persistent browser profiles" because the gateway blocks profile mutations.
// Workaround: write directly to ~/.openclaw/openclaw.json and restart the gateway.

function getOpenclawConfigPath(): string {
  return resolve(homedir(), '.openclaw', 'openclaw.json');
}

interface OpenclawConfig {
  browser?: {
    profiles?: Record<string, { cdpPort?: number; color?: string }>;
  };
  gateway?: { port?: number };
  [k: string]: unknown;
}

function readOpenclawConfig(): OpenclawConfig {
  const path = getOpenclawConfigPath();
  if (!existsSync(path)) {
    throw new Error(`OpenClaw config not found at ${path}. Is OpenClaw installed and initialized?`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${err instanceof Error ? err.message : err}`);
  }
}

function writeOpenclawConfig(config: OpenclawConfig): void {
  writeFileSync(getOpenclawConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

async function createOpenclawProfile(platform: string): Promise<void> {
  const name = openclawProfileName(platform);
  const color = PLATFORM_COLORS[platform] || '#888888';

  const config = readOpenclawConfig();
  if (!config.browser) config.browser = {};
  if (!config.browser.profiles) config.browser.profiles = {};

  if (config.browser.profiles[name]) {
    // Already registered in config, just ensure gateway sees it
    return;
  }

  // Pick next available cdpPort. Start at 18900 to avoid overlap with common defaults.
  const existingPorts = Object.values(config.browser.profiles)
    .map((p) => p?.cdpPort || 0)
    .filter((n) => n > 0);
  const maxPort = existingPorts.length > 0 ? Math.max(...existingPorts) : 18899;
  const nextPort = Math.max(maxPort + 1, 18900);

  config.browser.profiles[name] = { cdpPort: nextPort, color };

  writeOpenclawConfig(config);
  log.info(`Wrote profile "${name}" to ~/.openclaw/openclaw.json (cdpPort: ${nextPort})`);

  // Restart the gateway so it picks up the new profile
  log.info('Restarting OpenClaw gateway...');
  await execa('openclaw', ['gateway', 'restart'], { reject: false, timeout: 20000 });

  // Wait for gateway to come back healthy
  const gatewayPort = config.gateway?.port || 18789;
  const healthy = await waitForGatewayHealthy(gatewayPort, 15000);
  if (!healthy) {
    throw new Error(
      `OpenClaw gateway did not come back after restart. Check: openclaw gateway status`
    );
  }
  log.success('OpenClaw gateway restarted');
}

async function waitForGatewayHealthy(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function launchBrowserAtUrl(platform: string, url: string): Promise<void> {
  const name = openclawProfileName(platform);
  const result = await execa('openclaw', [
    'browser', '--browser-profile', name,
    'open', url,
  ], { reject: false, timeout: 30000 });

  if (result.exitCode !== 0) {
    const err = (result.stderr || result.stdout || '').slice(0, 400);
    throw new Error(
      `openclaw browser open failed: ${err}\n` +
      `Make sure the OpenClaw gateway is running: openclaw gateway status`
    );
  }
}

// ── Public API ────────────────────────────────────────────────

export async function setupProfile(platform: string): Promise<void> {
  const name = openclawProfileName(platform);
  const loginUrl = PLATFORM_LOGIN_URLS[platform];

  console.log('');
  console.log(chalk.bold(`Setting up browser profile for ${platform}`));
  console.log(chalk.dim(`  OpenClaw profile: ${name}`));
  console.log('');

  // 1. Ensure OpenClaw has this profile
  const existing = await listOpenclawProfiles();
  const alreadyExists = existing.some((p) => p.name === name);

  if (!alreadyExists) {
    log.info(`Creating OpenClaw profile "${name}"...`);
    await createOpenclawProfile(platform);
    log.success(`Created OpenClaw profile "${name}"`);
  } else {
    log.info(`OpenClaw profile "${name}" already exists`);
  }

  // 2. Launch Chrome at the platform's login URL
  if (loginUrl) {
    log.info(`Opening browser at ${loginUrl}`);
    await launchBrowserAtUrl(platform, loginUrl);
    log.success(`Browser launched. Log in to your ${platform} account.`);
  } else {
    log.warn(`No login URL configured for ${platform}. Launch the browser manually.`);
  }

  // 3. Track it in OpenTwins so `hasBrowserProfile()` returns true
  const cfg = loadProfilesConfig();
  if (!cfg.profiles.some((p) => p.platform === platform)) {
    cfg.profiles.push({
      platform,
      createdAt: new Date().toISOString(),
      openclawProfile: name,
    });
    saveProfilesConfig(cfg);
  }
}

export async function loginProfile(platform: string): Promise<void> {
  const cfg = loadProfilesConfig();
  const profile = cfg.profiles.find((p) => p.platform === platform);
  if (!profile) {
    log.error(`No profile for ${platform}. Run: opentwins browser setup ${platform}`);
    return;
  }

  const loginUrl = PLATFORM_LOGIN_URLS[platform];
  if (!loginUrl) {
    log.error(`No login URL configured for ${platform}`);
    return;
  }

  console.log(chalk.bold(`Re-opening browser for ${platform}`));
  console.log(chalk.dim(`  Profile: ${openclawProfileName(platform)}`));
  console.log('');

  try {
    await launchBrowserAtUrl(platform, loginUrl);
    log.success('Browser launched. Log in again, then close when done.');
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
  }
}

export interface HealthResult {
  platform: string;
  openclawProfile: string;
  healthy: boolean;
  status: string;
}

export async function healthCheck(): Promise<HealthResult[]> {
  const cfg = loadProfilesConfig();
  const openclawList = await listOpenclawProfiles();
  return cfg.profiles.map((p) => {
    const name = p.openclawProfile || openclawProfileName(p.platform);
    const entry = openclawList.find((x) => x.name === name);
    return {
      platform: p.platform,
      openclawProfile: name,
      healthy: !!entry,
      status: entry?.status || 'missing',
    };
  });
}

export async function listProfiles(): Promise<ProfileConfig[]> {
  const cfg = loadProfilesConfig();
  // Normalize: ensure openclawProfile is set on every entry
  return cfg.profiles.map((p) => ({
    ...p,
    openclawProfile: p.openclawProfile || openclawProfileName(p.platform),
  }));
}
