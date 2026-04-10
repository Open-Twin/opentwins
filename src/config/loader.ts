import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { OpenTwinsConfigSchema, type OpenTwinsConfig } from './schema.js';
import { getConfigPath } from '../util/paths.js';

export function loadConfig(path?: string): OpenTwinsConfig {
  const configPath = path || getConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      `Config not found at ${configPath}. Run 'opentwins init' first.`
    );
  }
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  return OpenTwinsConfigSchema.parse(raw);
}

export function saveConfig(config: OpenTwinsConfig, path?: string): void {
  const configPath = path || getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  // Config contains auth tokens - restrict permissions
  try { chmodSync(configPath, 0o600); } catch {}
}

export function configExists(path?: string): boolean {
  return existsSync(path || getConfigPath());
}
