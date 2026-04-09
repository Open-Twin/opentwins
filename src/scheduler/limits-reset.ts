import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getWorkspacesDir } from '../util/paths.js';

interface LimitsFile {
  daily?: Record<string, { limit: number; current: number; last_reset?: string }>;
  weekly?: Record<string, { limit: number; current: number; last_reset?: string }>;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function weekKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const week = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
  return `${now.getFullYear()}-W${week}`;
}

export function resetLimitsIfNeeded(): void {
  const workspacesDir = getWorkspacesDir();
  if (!existsSync(workspacesDir)) return;

  const dirs = readdirSync(workspacesDir).filter((d) => d.startsWith('agent-'));

  for (const dir of dirs) {
    const limitsPath = resolve(workspacesDir, dir, 'limits.json');
    if (!existsSync(limitsPath)) continue;

    try {
      const raw = readFileSync(limitsPath, 'utf-8');
      const limits: LimitsFile = JSON.parse(raw);
      let changed = false;
      const todayStr = today();
      const weekStr = weekKey();

      // Reset daily counters
      if (limits.daily) {
        for (const [key, val] of Object.entries(limits.daily)) {
          if (val.last_reset !== todayStr) {
            val.current = 0;
            val.last_reset = todayStr;
            changed = true;
          }
        }
      }

      // Reset weekly counters
      if (limits.weekly) {
        for (const [key, val] of Object.entries(limits.weekly)) {
          if (val.last_reset !== weekStr) {
            val.current = 0;
            val.last_reset = weekStr;
            changed = true;
          }
        }
      }

      if (changed) {
        writeFileSync(limitsPath, JSON.stringify(limits, null, 2) + '\n', 'utf-8');
      }
    } catch {
      // Skip corrupt files
    }
  }
}
