import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getPidFile } from '../util/paths.js';

// Wait for the daemon to report a ready PID file, or time out.
async function waitForPidFile(timeoutMs: number): Promise<number | null> {
  const pidFile = getPidFile();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8').trim());
        if (pid > 0) return pid;
      } catch { /* file not ready */ }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

export async function startDaemon(): Promise<number> {
  // Ensure PID file directory exists
  const pidFile = getPidFile();
  const pidDir = dirname(pidFile);
  if (!existsSync(pidDir)) mkdirSync(pidDir, { recursive: true });

  // Remove any stale PID file
  if (existsSync(pidFile)) {
    try { unlinkSync(pidFile); } catch { /* ignore */ }
  }

  // Spawn detached process. The child writes its own PID to the file so we
  // capture the actual Node PID, not the shim/shell wrapper.
  const child = spawn('opentwins', ['start'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, OPENTWINS_DAEMON: '1' },
  });

  child.unref();

  // Write the shim PID immediately as a fallback
  if (child.pid) {
    writeFileSync(pidFile, String(child.pid), 'utf-8');
  }

  // Wait briefly for the child to prove it started
  const ready = await waitForPidFile(3000);
  return ready || child.pid || 0;
}

export async function stopDaemon(): Promise<boolean> {
  const pidFile = getPidFile();
  if (!existsSync(pidFile)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim());
    if (!pid) {
      try { unlinkSync(pidFile); } catch { /* ignore */ }
      return false;
    }
    // Kill by negative PID to reach the whole process group (detached child)
    try { process.kill(-pid, 'SIGTERM'); } catch { /* fall through */ }
    try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }
    try { unlinkSync(pidFile); } catch { /* ignore */ }
    return true;
  } catch {
    try { unlinkSync(pidFile); } catch { /* ignore */ }
    return false;
  }
}

export async function isDaemonRunning(): Promise<boolean> {
  const pidFile = getPidFile();
  if (!existsSync(pidFile)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim());
    if (!pid) return false;
    process.kill(pid, 0); // signal 0 = check if alive
    return true;
  } catch {
    return false;
  }
}
