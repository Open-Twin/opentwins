import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileLog, fileError } from '../util/logger.js';

// ── Chrome executable detection ──────────────────────────────

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${homedir()}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
  ],
};

export function isChromeInstalled(): boolean {
  try {
    findChrome();
    return true;
  } catch {
    return false;
  }
}

export function findChrome(): string {
  const candidates = CHROME_PATHS[platform()] || [];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Try PATH
  try {
    const result = execSync(platform() === 'win32' ? 'where chrome' : 'which google-chrome || which chromium', {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim().split('\n')[0];
    if (result && existsSync(result)) return result;
  } catch { /* not found */ }
  throw new Error('Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH env var.');
}

// ── Profile & data directories ───────────────────────────────

export function getProfilesBaseDir(): string {
  return resolve(homedir(), '.opentwins', 'chrome-profiles');
}

export function getProfileDir(profileName: string): string {
  return resolve(getProfilesBaseDir(), profileName);
}

// ── Chrome launcher ──────────────────────────────────────────

export interface ChromeInstance {
  pid: number;
  port: number;
  profileName: string;
}

function getPortForProfile(profileName: string): number {
  // Deterministic port from profile name - hash to range 19200-19999
  let hash = 0;
  for (let i = 0; i < profileName.length; i++) {
    hash = ((hash << 5) - hash + profileName.charCodeAt(i)) | 0;
  }
  return 19200 + (Math.abs(hash) % 800);
}

export function getProfilePort(profileName: string): number {
  // Check if there's a saved port, otherwise use deterministic one
  const configPath = resolve(getProfilesBaseDir(), 'ports.json');
  if (existsSync(configPath)) {
    try {
      const ports = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (ports[profileName]) return ports[profileName];
    } catch { /* fall through */ }
  }
  return getPortForProfile(profileName);
}

function saveProfilePort(profileName: string, port: number): void {
  const dir = getProfilesBaseDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const configPath = resolve(dir, 'ports.json');
  let ports: Record<string, number> = {};
  if (existsSync(configPath)) {
    try { ports = JSON.parse(readFileSync(configPath, 'utf-8')); } catch { /* fresh */ }
  }
  ports[profileName] = port;
  writeFileSync(configPath, JSON.stringify(ports, null, 2) + '\n', 'utf-8');
}

export function isPortInUse(port: number): boolean {
  try {
    execSync(`lsof -i :${port} -sTCP:LISTEN`, { encoding: 'utf-8', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function launchChrome(profileName: string): Promise<ChromeInstance> {
  const chromePath = process.env.CHROME_PATH || findChrome();
  const userDataDir = getProfileDir(profileName);
  const port = getProfilePort(profileName);

  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true });
  }

  // Check if already running on this port
  if (isPortInUse(port)) {
    // Find the PID
    try {
      const lsof = execSync(`lsof -i :${port} -sTCP:LISTEN -t`, { encoding: 'utf-8', timeout: 3000 }).trim();
      const pid = parseInt(lsof.split('\n')[0]);
      if (pid) {
        fileLog('chrome', 'Chrome already running', { profile: profileName, port, pid });
        return { pid, port, profileName };
      }
    } catch { /* fall through */ }
  }

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
  ];

  const child = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();

  saveProfilePort(profileName, port);

  // Wait for CDP to be ready
  const ready = await waitForCdp(port, 15000);
  if (!ready) {
    fileError('chrome', 'Chrome failed to start', { profile: profileName, port });
    throw new Error(`Chrome did not start on port ${port} within 15s`);
  }

  fileLog('chrome', 'Chrome launched', { profile: profileName, port, pid: child.pid });
  return { pid: child.pid!, port, profileName };
}

export function stopChrome(profileName: string): boolean {
  const port = getProfilePort(profileName);
  try {
    const lsof = execSync(`lsof -i :${port} -sTCP:LISTEN -t`, { encoding: 'utf-8', timeout: 3000 }).trim();
    for (const line of lsof.split('\n')) {
      const pid = parseInt(line);
      if (pid && pid !== process.pid) {
        process.kill(pid, 'SIGTERM');
      }
    }
    fileLog('chrome', 'Chrome stopped', { profile: profileName, port });
    return true;
  } catch {
    return false;
  }
}

async function waitForCdp(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
