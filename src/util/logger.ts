import chalk from 'chalk';
import { appendFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

// ── Console logging (unchanged) ──────────────────────────────

export function info(msg: string): void {
  console.log(chalk.blue('i'), msg);
}

export function success(msg: string): void {
  console.log(chalk.green('✓'), msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('!'), msg);
}

export function error(msg: string): void {
  console.error(chalk.red('✗'), msg);
}

export function dim(msg: string): void {
  console.log(chalk.dim(msg));
}

// ── File-based structured logging (JSONL) ────────────────────

function getLogsDir(): string {
  return resolve(homedir(), '.opentwins', 'logs');
}

function getLogFile(): string {
  const date = new Date().toISOString().split('T')[0];
  return resolve(getLogsDir(), `opentwins-${date}.log`);
}

function writeLog(level: 'info' | 'warn' | 'error', mod: string, msg: string, data?: Record<string, unknown>): void {
  try {
    const dir = getLogsDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      mod,
      msg,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    });
    appendFileSync(getLogFile(), entry + '\n', 'utf-8');
  } catch {
    // Never crash the app for logging
  }
}

export function fileLog(mod: string, msg: string, data?: Record<string, unknown>): void {
  writeLog('info', mod, msg, data);
}

export function fileWarn(mod: string, msg: string, data?: Record<string, unknown>): void {
  writeLog('warn', mod, msg, data);
}

export function fileError(mod: string, msg: string, data?: Record<string, unknown>): void {
  writeLog('error', mod, msg, data);
}

// ── Log rotation ─────────────────────────────────────────────

export function cleanOldLogs(maxDays = 14): void {
  try {
    const dir = getLogsDir();
    if (!existsSync(dir)) return;
    const cutoff = Date.now() - maxDays * 86400000;
    for (const f of readdirSync(dir)) {
      const match = f.match(/^opentwins-(\d{4}-\d{2}-\d{2})\.log$/);
      if (match && new Date(match[1]).getTime() < cutoff) {
        unlinkSync(resolve(dir, f));
      }
    }
  } catch { /* best effort */ }
}

// ── Read logs (for API endpoint) ─────────────────────────────

export interface LogEntry {
  ts: string;
  level: string;
  mod: string;
  msg: string;
  data?: Record<string, unknown>;
}

export function readLogs(options?: { date?: string; level?: string; mod?: string; limit?: number }): LogEntry[] {
  try {
    const date = options?.date || new Date().toISOString().split('T')[0];
    const file = resolve(getLogsDir(), `opentwins-${date}.log`);
    if (!existsSync(file)) return [];
    const content = readFileSync(file, 'utf-8');
    let entries = content.split('\n').filter(Boolean).map((line: string) => {
      try { return JSON.parse(line) as LogEntry; } catch { return null; }
    }).filter(Boolean) as LogEntry[];

    if (options?.level) entries = entries.filter((e) => e.level === options.level);
    if (options?.mod) entries = entries.filter((e) => e.mod === options.mod);

    entries.reverse(); // newest first
    if (options?.limit) entries = entries.slice(0, options.limit);
    return entries;
  } catch {
    return [];
  }
}
