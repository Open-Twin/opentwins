import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import {
  getBrowserProfilesDir,
  getBrowserProfilesConfigPath,
} from '../util/paths.js';
import { launchChrome, stopChrome, getProfilePort, isPortInUse, getProfileDir } from './chrome.js';
import { navigateTo } from './cdp.js';
import * as log from '../util/logger.js';

// Browser profiles are now managed directly by OpenTwins.
// Chrome is launched with --remote-debugging-port and --user-data-dir.
// Chrome is managed directly via CDP - no external dependencies.

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
  browserProfile: string;
  port: number;
}

interface ProfilesConfig {
  profiles: ProfileConfig[];
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

function browserProfileName(platform: string): string {
  return `ot-${platform}`;
}

// ── Public API ───────────────────────────────────────────────

export async function setupProfile(platform: string): Promise<void> {
  const name = browserProfileName(platform);
  const loginUrl = PLATFORM_LOGIN_URLS[platform];

  console.log('');
  console.log(chalk.bold(`Setting up browser profile for ${platform}`));
  console.log(chalk.dim(`  Profile: ${name}`));
  console.log(chalk.dim(`  Data dir: ${getProfileDir(name)}`));
  console.log('');

  // Launch Chrome with this profile
  log.info(`Launching Chrome for "${name}"...`);
  const instance = await launchChrome(name);
  log.success(`Chrome running (PID ${instance.pid}, CDP port ${instance.port})`);

  // Navigate to login URL
  if (loginUrl) {
    // Wait for Chrome to initialize
    await new Promise((r) => setTimeout(r, 2000));
    log.info(`Opening ${loginUrl}`);
    try {
      await navigateTo(name, loginUrl);
    } catch {
      // If navigate fails (no tab yet), open a new tab
      const { openTab } = await import('./cdp.js');
      await openTab(name, loginUrl);
    }
    log.success(`Browser launched. Log in to your ${platform} account.`);
  } else {
    log.warn(`No login URL configured for ${platform}. Launch the browser manually.`);
  }
}

export function confirmProfile(platform: string): void {
  const name = browserProfileName(platform);
  const port = getProfilePort(name);
  const cfg = loadProfilesConfig();
  const existing = cfg.profiles.findIndex((p) => p.platform === platform);
  const entry: ProfileConfig = {
    platform,
    createdAt: new Date().toISOString(),
    browserProfile: name,
    port,
  };
  if (existing >= 0) {
    cfg.profiles[existing] = entry;
  } else {
    cfg.profiles.push(entry);
  }
  saveProfilesConfig(cfg);
  log.success(`Profile for ${platform} confirmed as configured`);
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

  const name = browserProfileName(platform);
  console.log(chalk.bold(`Re-opening browser for ${platform}`));
  console.log(chalk.dim(`  Profile: ${name}`));
  console.log('');

  try {
    await launchChrome(name);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await navigateTo(name, loginUrl);
    } catch {
      const { openTab } = await import('./cdp.js');
      await openTab(name, loginUrl);
    }
    log.success('Browser launched. Log in again, then close when done.');
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
  }
}

export interface HealthResult {
  platform: string;
  browserProfile: string;
  healthy: boolean;
  status: string;
}

export async function healthCheck(): Promise<HealthResult[]> {
  const cfg = loadProfilesConfig();
  return cfg.profiles.map((p) => {
    const name = p.browserProfile || browserProfileName(p.platform);
    const port = getProfilePort(name);
    const running = isPortInUse(port);
    return {
      platform: p.platform,
      browserProfile: name,
      healthy: running,
      status: running ? `running (port ${port})` : 'stopped',
    };
  });
}

export async function listProfiles(): Promise<ProfileConfig[]> {
  const cfg = loadProfilesConfig();
  return cfg.profiles.map((p) => ({
    ...p,
    browserProfile: p.browserProfile || browserProfileName(p.platform),
  }));
}
