import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execa, execaCommand } from 'execa';
import chalk from 'chalk';
import {
  getBrowserProfileDir,
  getBrowserProfilesDir,
  getBrowserProfilesConfigPath,
} from '../util/paths.js';
import * as log from '../util/logger.js';

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500', twitter: '#1DA1F2', linkedin: '#0A66C2', bluesky: '#0085FF',
  threads: '#000000', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF',
  ph: '#DA552F', ih: '#4F46E5',
};

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

  // Register profile with OpenClaw so `openclaw browser --browser-profile ot-{platform}` works
  const openclawProfileName = `ot-${platform}`;
  const color = PLATFORM_COLORS[platform] || '#888888';
  try {
    const result = await execa('openclaw', [
      'browser', 'create-profile',
      '--name', openclawProfileName,
      '--color', color,
    ], { reject: false, timeout: 15000 });

    if (result.exitCode === 0) {
      log.success(`OpenClaw browser profile "${openclawProfileName}" registered`);
    } else {
      const stderr = result.stderr || result.stdout || '';
      if (stderr.includes('already exists') || stderr.includes('duplicate')) {
        log.info(`OpenClaw profile "${openclawProfileName}" already exists`);
      } else {
        log.warn(`Could not register OpenClaw profile "${openclawProfileName}": ${stderr.slice(0, 200)}`);
        log.info(`  You can register it manually: openclaw browser create-profile --name ${openclawProfileName} --color "${color}"`);
      }
    }
  } catch {
    log.warn(`OpenClaw CLI not available. Register the profile manually:`);
    log.info(`  openclaw browser create-profile --name ${openclawProfileName} --color "${color}"`);
  }

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
