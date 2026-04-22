// Shared structured logger. One JSON line per event, appended to
// logs/YYYY-MM-DD.log (UTC). Used by server.mjs (one line per HTTP
// request) and cli.mjs (one line per render invocation) so both
// surfaces leave a single auditable trail.

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(HERE, '..', 'logs');

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function logFilePath() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return join(LOGS_DIR, `${yyyy}-${mm}-${dd}.log`);
}

export function log(entry) {
  ensureLogsDir();
  const line = JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n';
  try { appendFileSync(logFilePath(), line); } catch {}
  if (process.env.NODE_ENV === 'development') process.stderr.write(line);
}
