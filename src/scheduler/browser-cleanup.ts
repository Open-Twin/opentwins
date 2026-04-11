import { parentPort, isMainThread } from 'node:worker_threads';
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

// Run as Bree worker thread
if (!isMainThread) {
  runCleanup()
    .then((msg) => parentPort?.postMessage(msg))
    .catch((err) => parentPort?.postMessage(`browser-cleanup: ERROR - ${err.message}`));
}

const KEEP_TABS = 1;
const ZOMBIE_THRESHOLD_MINUTES = 20;

function getLogDir(): string {
  const dir = resolve(homedir(), '.opentwins', 'logs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function log(file: string, msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  appendFileSync(resolve(getLogDir(), file), `${ts} - ${msg}\n`, 'utf-8');
}

// ── Read ot-* profiles from OpenTwins config ─────────────────

interface ProfileEntry { name: string; cdpPort: number }

function getOpenTwinsProfiles(): ProfileEntry[] {
  // Read from ~/.opentwins/chrome-profiles/ports.json
  const portsPath = resolve(homedir(), '.opentwins', 'chrome-profiles', 'ports.json');
  if (!existsSync(portsPath)) return [];
  try {
    const ports = JSON.parse(readFileSync(portsPath, 'utf-8')) as Record<string, number>;
    return Object.entries(ports)
      .filter(([name]) => name.startsWith('ot-'))
      .map(([name, port]) => ({ name, cdpPort: port }))
      .filter((p) => p.cdpPort > 0);
  } catch {
    return [];
  }
}

// ── Tab cleanup ──────────────────────────────────────────────

async function cleanupTabs(profiles: ProfileEntry[]): Promise<number> {
  let totalCleaned = 0;

  for (const { name, cdpPort } of profiles) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const tabs = (await res.json()) as Array<{ type: string; id: string }>;
      const pageIds = tabs.filter((t) => t.type === 'page').map((t) => t.id);

      if (pageIds.length <= KEEP_TABS) continue;

      const toClose = pageIds.slice(KEEP_TABS);
      log('browser-tab-cleanup.log', `${name}: ${pageIds.length} tabs, closing ${toClose.length}`);

      for (const id of toClose) {
        try {
          await fetch(`http://127.0.0.1:${cdpPort}/json/close/${id}`, { signal: AbortSignal.timeout(2000) });
        } catch { /* best effort */ }
      }
      totalCleaned += toClose.length;
    } catch {
      // Chrome not running on this port - skip
    }
  }
  return totalCleaned;
}

// ── Zombie Chrome cleanup ────────────────────────────────────

function killZombieChrome(): number {
  let killed = 0;
  try {
    const ps = execSync('ps -eo etime,command', { encoding: 'utf-8', timeout: 5000 });
    // Group by ot-* profile
    const profileTimes = new Map<string, number>();

    for (const line of ps.split('\n')) {
      const match = line.match(/user-data[^\s]*(ot-[a-z]+)/);
      if (!match) continue;
      const profile = match[1];
      const elapsed = line.trim().split(/\s+/)[0];
      const minutes = parseElapsed(elapsed);
      const current = profileTimes.get(profile) || 0;
      if (minutes > current) profileTimes.set(profile, minutes);
    }

    for (const [profile, minutes] of profileTimes) {
      if (minutes >= ZOMBIE_THRESHOLD_MINUTES) {
        log('zombie-chrome-cleanup.log', `${profile}: oldest=${minutes}min (>= ${ZOMBIE_THRESHOLD_MINUTES}) - KILLING`);
        try {
          execSync(`pkill -f "user-data.*${profile}"`, { timeout: 5000 });
          killed++;
        } catch { /* pkill returns non-zero if no match */ }
      }
    }
  } catch {
    // ps failed - skip
  }
  return killed;
}

function parseElapsed(elapsed: string): number {
  if (elapsed.includes('-')) return 9999; // days
  const parts = elapsed.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1]; // HH:MM:SS
  return parts[0]; // MM:SS
}

// ── Main ─────────────────────────────────────────────────────

async function runCleanup(): Promise<string> {
  const profiles = getOpenTwinsProfiles();
  if (profiles.length === 0) return 'browser-cleanup: no ot-* profiles found';

  const tabsCleaned = await cleanupTabs(profiles);
  const zombiesKilled = killZombieChrome();

  const parts: string[] = [];
  if (tabsCleaned > 0) parts.push(`${tabsCleaned} tabs closed`);
  if (zombiesKilled > 0) parts.push(`${zombiesKilled} zombie profiles killed`);

  return parts.length > 0
    ? `browser-cleanup: ${parts.join(', ')}`
    : 'browser-cleanup: all clean';
}
