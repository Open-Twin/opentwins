import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execaCommand } from 'execa';
import chalk from 'chalk';
import {
  getBrowserProfileDir,
  getBrowserProfilesDir,
  getBrowserProfilesConfigPath,
} from '../util/paths.js';
import * as log from '../util/logger.js';

interface ProfileConfig {
  platform: string;
  port: number;
  profileDir: string;
  createdAt: string;
}

interface ProfilesConfig {
  profiles: ProfileConfig[];
  nextPort: number;
}

const BASE_PORT = 19001;

function loadProfilesConfig(): ProfilesConfig {
  const path = getBrowserProfilesConfigPath();
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'));
  }
  return { profiles: [], nextPort: BASE_PORT };
}

function saveProfilesConfig(config: ProfilesConfig): void {
  const dir = getBrowserProfilesDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(getBrowserProfilesConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function setupProfile(platform: string): Promise<void> {
  const config = loadProfilesConfig();
  const existing = config.profiles.find((p) => p.platform === platform);

  if (existing) {
    log.warn(`Profile for ${platform} already exists (port ${existing.port}). Use 'browser login' to re-login.`);
    return;
  }

  const profileDir = getBrowserProfileDir(platform);
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const port = config.nextPort;

  console.log('');
  console.log(chalk.bold(`Setting up browser profile for ${platform}`));
  console.log(chalk.dim(`  Profile: ${profileDir}`));
  console.log(chalk.dim(`  CDP port: ${port}`));
  console.log('');
  console.log('  A browser window will open. Please:');
  console.log(`  1. Log in to your ${platform} account`);
  console.log('  2. Close the browser when done');
  console.log('');

  try {
    await execaCommand(
      `open -na "Google Chrome" --args --user-data-dir="${profileDir}" --remote-debugging-port=${port}`,
      { shell: true, reject: false }
    );
  } catch {
    // Try chromium or other paths
    log.warn('Could not launch Chrome. Please open Chrome manually with:');
    log.info(`  google-chrome --user-data-dir="${profileDir}" --remote-debugging-port=${port}`);
  }

  // Save profile config
  config.profiles.push({
    platform,
    port,
    profileDir,
    createdAt: new Date().toISOString(),
  });
  config.nextPort = port + 1;
  saveProfilesConfig(config);

  log.success(`Profile for ${platform} configured (port ${port})`);
}

export async function loginProfile(platform: string): Promise<void> {
  const config = loadProfilesConfig();
  const profile = config.profiles.find((p) => p.platform === platform);

  if (!profile) {
    log.error(`No profile for ${platform}. Run: opentwins browser setup ${platform}`);
    return;
  }

  console.log(chalk.bold(`Re-opening browser for ${platform}`));
  console.log(chalk.dim(`  Port: ${profile.port}`));
  console.log('');

  try {
    await execaCommand(
      `open -na "Google Chrome" --args --user-data-dir="${profile.profileDir}" --remote-debugging-port=${profile.port}`,
      { shell: true, reject: false }
    );
  } catch {
    log.warn('Could not launch Chrome. Open manually.');
  }
}

export async function healthCheck(): Promise<
  Array<{ platform: string; port: number; healthy: boolean }>
> {
  const config = loadProfilesConfig();
  const results = [];

  for (const profile of config.profiles) {
    let healthy = false;
    try {
      const response = await fetch(`http://127.0.0.1:${profile.port}/json/version`);
      healthy = response.ok;
    } catch {
      healthy = false;
    }

    results.push({
      platform: profile.platform,
      port: profile.port,
      healthy,
    });
  }

  return results;
}

export async function listProfiles(): Promise<ProfileConfig[]> {
  return loadProfilesConfig().profiles;
}
