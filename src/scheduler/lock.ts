import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getLockFile, getLocksDir } from '../util/paths.js';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(agentName: string): boolean {
  const lockFile = getLockFile(agentName);

  // Ensure locks directory exists
  const locksDir = getLocksDir();
  if (!existsSync(locksDir)) {
    mkdirSync(locksDir, { recursive: true });
  }

  // Check existing lock
  if (existsSync(lockFile)) {
    try {
      const pid = parseInt(readFileSync(lockFile, 'utf-8').trim());
      if (isProcessAlive(pid)) {
        return false; // Previous run still active
      }
    } catch {
      // Corrupt lock file - remove it
    }
    unlinkSync(lockFile);
  }

  // Write our PID
  writeFileSync(lockFile, String(process.pid), 'utf-8');
  return true;
}

export function releaseLock(agentName: string): void {
  const lockFile = getLockFile(agentName);
  try {
    if (existsSync(lockFile)) {
      unlinkSync(lockFile);
    }
  } catch {
    // Ignore cleanup errors
  }
}
