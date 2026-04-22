import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPipelineWorkspaceDir, getLogsDir } from '../util/paths.js';
import { fileLog, fileWarn, fileError } from '../util/logger.js';

// Image-core is a scaffolded HTTP server at <pipeline>/image-core that agents
// invoke to render platform images. It must run whenever opentwins is up;
// otherwise agents' render shell blocks exit non-zero and posts fall back to
// text-only. The scaffold copies server.mjs into the user workspace so we
// spawn it as a child of the main opentwins process and share the process
// group — SIGTERM to the daemon group reaches image-core too.

let child: ChildProcess | null = null;

export function isImageCoreAvailable(): boolean {
  const serverPath = resolve(getPipelineWorkspaceDir(), 'image-core', 'server.mjs');
  return existsSync(serverPath);
}

export function startImageCore(): ChildProcess | null {
  if (child) return child;

  const imageCoreDir = resolve(getPipelineWorkspaceDir(), 'image-core');
  const serverPath = resolve(imageCoreDir, 'server.mjs');
  if (!existsSync(serverPath)) {
    fileWarn('image-core', 'server.mjs not found — image-rendering shell blocks will fail at runtime', { path: serverPath });
    return null;
  }

  const logsDir = getLogsDir();
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  // openSync gives a real fd that spawn can hand to the child for stdout/stderr.
  // createWriteStream is lazy (fd=null until first write) and spawn rejects it.
  const logFd = openSync(resolve(logsDir, 'image-core.log'), 'a');

  const proc = spawn(process.execPath, [serverPath], {
    cwd: imageCoreDir,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
  });

  // The child dups the fd — we can close our copy immediately. The child holds
  // its own reference until it exits. Avoids leaking the fd in the parent.
  try { closeSync(logFd); } catch { /* best-effort */ }

  proc.on('exit', (code, signal) => {
    fileLog('image-core', 'process exited', { code, signal, pid: proc.pid });
    if (child === proc) child = null;
  });

  proc.on('error', (err) => {
    fileError('image-core', 'spawn error', { error: err.message });
  });

  child = proc;
  fileLog('image-core', 'started', { pid: proc.pid });
  return proc;
}

export async function stopImageCore(timeoutMs = 2000): Promise<void> {
  if (!child) return;
  const proc = child;
  child = null;
  try {
    proc.kill('SIGTERM');
    await new Promise<void>((res) => {
      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already gone */ }
        res();
      }, timeoutMs);
      proc.once('exit', () => { clearTimeout(timer); res(); });
    });
    fileLog('image-core', 'stopped', { pid: proc.pid });
  } catch (err) {
    fileWarn('image-core', 'stop error', { error: err instanceof Error ? err.message : String(err) });
  }
}

export function getImageCoreProcess(): ChildProcess | null {
  return child;
}
