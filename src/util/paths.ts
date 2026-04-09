import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPENTWINS_HOME = resolve(homedir(), '.opentwins');

export function getOpenTwinsHome(): string {
  return process.env.OPENTWINS_HOME || OPENTWINS_HOME;
}

export function getConfigPath(): string {
  return resolve(getOpenTwinsHome(), 'config.json');
}

export function getDatabasePath(): string {
  return resolve(getOpenTwinsHome(), 'data.db');
}

export function getWorkspacesDir(): string {
  return resolve(getOpenTwinsHome(), 'workspaces');
}

export function getPlatformWorkspaceDir(platform: string): string {
  return resolve(getWorkspacesDir(), `agent-${platform}`);
}

export function getPipelineWorkspaceDir(): string {
  return resolve(getWorkspacesDir(), 'pipeline');
}

export function getBrowserProfilesDir(): string {
  return resolve(getOpenTwinsHome(), 'browser-profiles');
}

export function getBrowserProfileDir(platform: string): string {
  return resolve(getBrowserProfilesDir(), platform);
}

export function getBrowserProfilesConfigPath(): string {
  return resolve(getBrowserProfilesDir(), 'profiles.json');
}

export function getLogsDir(): string {
  return resolve(getOpenTwinsHome(), 'logs');
}

export function getLocksDir(): string {
  return resolve(getOpenTwinsHome(), 'locks');
}

export function getLockFile(agentName: string): string {
  return resolve(getLocksDir(), `${agentName}.lock`);
}

export function getPidFile(): string {
  return resolve(getOpenTwinsHome(), 'opentwins.pid');
}

export function getTemplatesDir(): string {
  // Find the package root by looking for package.json
  // Works whether running from dist/ (bundled) or src/ (dev)
  const __dirname = dirname(fileURLToPath(import.meta.url));
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, 'src', 'templates');
    if (existsSync(candidate)) return candidate;
    dir = resolve(dir, '..');
  }
  // Fallback: relative to this file in source layout
  return resolve(__dirname, '..', '..', 'src', 'templates');
}

export function getPlatformTemplateDir(platform: string): string {
  return resolve(getTemplatesDir(), 'platforms', platform);
}

export function getPipelineTemplateDir(agent: string): string {
  return resolve(getTemplatesDir(), 'pipeline', agent);
}
