#!/usr/bin/env node
// image-core CLI — same core as the HTTP server, callable from shell.
//
// Commands:
//   render   --platform X --layout Y --data file.json [--out file.png] [--force]
//   preview  --platform X --layout Y [--out file.png] [--open]
//   routes
//   schemas  [layout]
//   cache-stats
//   cache-purge [--max-age-days N] [--dry-run]
//   health

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { render as coreRender, RENDER_VERSION } from './lib/render.mjs';
import { allRoutes, allPlatforms, allLayouts, versions } from './lib/routing.mjs';
import { findChrome } from './lib/chrome.mjs';
import { fontsAvailableLocally } from './templates/_shared/fonts.mjs';
import * as cache from './lib/cache.mjs';
import { ImageCoreError } from './lib/errors.mjs';
import { log } from './lib/log.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, 'templates');
const SCHEMAS_DIR = join(HERE, 'schemas');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i += 1; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const USAGE = `opentwins-image-core — CLI

Commands:
  render   --platform <p> --layout <l> --data <file.json> [--out <file>] [--force]
  preview  --platform <p> --layout <l> [--out <file>] [--open]
  routes
  schemas  [layout]
  cache-stats
  cache-purge [--max-age-days N] [--dry-run]
  health
`;

async function cmdRender(args) {
  const { platform, layout, data: dataPath, out, force } = args;
  if (!platform || !layout || !dataPath) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(resolve(String(dataPath)), 'utf8'));
  try {
    const result = await coreRender({ platform, layout, data, force: !!force });
    if (out) {
      copyFileSync(result.path, resolve(String(out)));
      result.path = resolve(String(out));
    }
    log({ op: 'cli_render', platform, layout, specHash: result.specHash, cacheHit: result.cacheHit, durationMs: result.durationMs });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    log({ op: 'cli_render_failed', platform, layout, code: err.code || 'unknown', error: String(err.message || err) });
    throw err;
  }
}

async function cmdPreview(args) {
  const { platform, layout, out, open } = args;
  if (!platform || !layout) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const routeMeta = allRoutes()[`${platform}/${layout}`];
  const tmpl = routeMeta?.template || layout;
  const previewPath = join(TEMPLATES_DIR, tmpl, 'preview.json');
  if (!existsSync(previewPath)) {
    process.stderr.write(`no preview.json at ${previewPath}\n`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(previewPath, 'utf8'));
  try {
    const result = await coreRender({ platform, layout, data, force: false });
    if (out) {
      copyFileSync(result.path, resolve(String(out)));
      result.path = resolve(String(out));
    }
    log({ op: 'cli_preview', platform, layout, specHash: result.specHash, cacheHit: result.cacheHit, durationMs: result.durationMs });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (open) {
      execFile('open', [result.path], (err) => {
        if (err) process.stderr.write(`open failed: ${err.message}\n`);
      });
    }
  } catch (err) {
    log({ op: 'cli_preview_failed', platform, layout, code: err.code || 'unknown', error: String(err.message || err) });
    throw err;
  }
}

function cmdRoutes() {
  process.stdout.write(JSON.stringify({
    routes: allRoutes(),
    byPlatform: Object.fromEntries(allPlatforms().map((p) => [p, allLayouts(p)])),
    ...versions(),
  }, null, 2) + '\n');
}

function cmdSchemas(args) {
  const layout = args._[1];
  if (layout) {
    const p = join(SCHEMAS_DIR, `${layout}.schema.json`);
    if (!existsSync(p)) {
      process.stderr.write(`no schema for layout "${layout}"\n`);
      process.exit(1);
    }
    process.stdout.write(readFileSync(p, 'utf8') + '\n');
    return;
  }
  process.stdout.write(readFileSync(join(HERE, 'routing.json'), 'utf8'));
}

function cmdCacheStats() {
  process.stdout.write(JSON.stringify(cache.stats(), null, 2) + '\n');
}

function cmdCachePurge(args) {
  const maxAgeDays = Number(args['max-age-days'] || 30);
  const dryRun = !!args['dry-run'];
  const purged = cache.purge({ maxAgeDays, dryRun });
  process.stdout.write(JSON.stringify({ purged: purged.length, entries: purged, dryRun, maxAgeDays }, null, 2) + '\n');
}

function cmdHealth() {
  const status = { ok: true, renderVersion: RENDER_VERSION };
  try { status.chromePath = findChrome(); } catch (e) { status.ok = false; status.chromeError = e.message; }
  status.fontsLocal = fontsAvailableLocally();
  status.cache = cache.stats();
  process.stdout.write(JSON.stringify(status, null, 2) + '\n');
  if (!status.ok) process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  try {
    switch (cmd) {
      case 'render':      await cmdRender(args); break;
      case 'preview':     await cmdPreview(args); break;
      case 'routes':      cmdRoutes(); break;
      case 'schemas':     cmdSchemas(args); break;
      case 'cache-stats': cmdCacheStats(); break;
      case 'cache-purge': cmdCachePurge(args); break;
      case 'health':      cmdHealth(); break;
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        process.stdout.write(USAGE);
        break;
      default:
        process.stderr.write(`unknown command: ${cmd}\n\n${USAGE}`);
        process.exit(2);
    }
  } catch (err) {
    if (err instanceof ImageCoreError) {
      process.stderr.write(JSON.stringify(err.toJSON(), null, 2) + '\n');
    } else {
      process.stderr.write(String(err.stack || err.message || err) + '\n');
    }
    process.exit(1);
  }
}

main();
