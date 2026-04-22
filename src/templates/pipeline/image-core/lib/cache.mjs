import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(HERE, '..', 'cache');

function ensureDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

export function cachePath(specHash, ext) {
  return join(CACHE_DIR, `${specHash}.${ext}`);
}

export function has(specHash, ext) {
  return existsSync(cachePath(specHash, ext));
}

// Primary render output: {specHash}.png / .pdf
export function getOutput(specHash, format) {
  const p = cachePath(specHash, format);
  return existsSync(p) ? p : null;
}

// Intermediate HTML kept for debugging. Retained until cache cleanup.
export function writeHtml(specHash, html) {
  ensureDir();
  const p = cachePath(specHash, 'html');
  writeFileSync(p, html);
  return p;
}

export function readHtml(specHash) {
  const p = cachePath(specHash, 'html');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// Sidecar metadata: what produced this entry, when
export function writeMeta(specHash, meta) {
  ensureDir();
  writeFileSync(cachePath(specHash, 'meta.json'), JSON.stringify(meta, null, 2));
}

export function readMeta(specHash) {
  const p = cachePath(specHash, 'meta.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

// Prepare output path for Chrome to write into (doesn't create the file)
export function outputPath(specHash, format) {
  ensureDir();
  return cachePath(specHash, format);
}

// Purge entries older than maxAgeDays. Called by scripts/cleanup-cache.sh.
export function purge({ maxAgeDays = 30, dryRun = false } = {}) {
  ensureDir();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const purged = [];
  for (const name of readdirSync(CACHE_DIR)) {
    if (name.startsWith('.')) continue;
    const p = join(CACHE_DIR, name);
    const st = statSync(p);
    if (st.mtimeMs < cutoff) {
      if (!dryRun) unlinkSync(p);
      purged.push(name);
    }
  }
  return purged;
}

export function stats() {
  ensureDir();
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(CACHE_DIR)) {
    if (name.startsWith('.')) continue;
    const st = statSync(join(CACHE_DIR, name));
    files += 1;
    bytes += st.size;
  }
  return { files, bytes };
}
