import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { getPidFile } from '../util/paths.js';

export async function startDaemon(): Promise<number> {
  const child = spawn('opentwins', ['start'], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  const pid = child.pid!;
  writeFileSync(getPidFile(), String(pid), 'utf-8');

  return pid;
}

export async function stopDaemon(): Promise<boolean> {
  const pidFile = getPidFile();
  if (!existsSync(pidFile)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim());
    process.kill(pid, 'SIGTERM');
    try { unlinkSync(pidFile); } catch {}
    return true;
  } catch {
    try { unlinkSync(pidFile); } catch {}
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
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
