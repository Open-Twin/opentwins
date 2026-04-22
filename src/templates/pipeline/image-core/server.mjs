#!/usr/bin/env node
// image-core HTTP server. Endpoints:
//
//   POST /render                     — render an image, return {path, width, height, specHash, cacheHit}
//   GET  /preview?platform=&layout=  — render with the template's preview.json, return inline PNG
//   GET  /schemas                    — list all layouts + data schemas
//   GET  /schemas/:layout            — single layout's data schema
//   GET  /routes                     — platform+layout → dimensions routing table
//   GET  /health                     — liveness + fonts + chrome check
//   GET  /debug/:hash/html           — intermediate HTML from a recent render (for iterating)
//   GET  /debug/:hash/meta           — render metadata sidecar
//   GET  /                           — endpoint index
//
// Binds to 127.0.0.1 by default — localhost only.

import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render as coreRender, RENDER_VERSION } from './lib/render.mjs';
import { allRoutes, allPlatforms, allLayouts, versions } from './lib/routing.mjs';
import { RenderQueue } from './lib/queue.mjs';
import { ImageCoreError, InvalidRouteError } from './lib/errors.mjs';
import { findChrome } from './lib/chrome.mjs';
import { fontsAvailableLocally } from './templates/_shared/fonts.mjs';
import * as cache from './lib/cache.mjs';
import { alertRenderFailure } from './lib/alert.mjs';
import { log } from './lib/log.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = join(HERE, 'schemas');
const TEMPLATES_DIR = join(HERE, 'templates');

const PORT = Number(process.env.PORT || 47293);
const HOST = process.env.HOST || '127.0.0.1';
const QUEUE_CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY || 1);
const QUEUE_MAX = Number(process.env.QUEUE_MAX_DEPTH || 10);

const queue = new RenderQueue({ concurrency: QUEUE_CONCURRENCY, maxDepth: QUEUE_MAX });

// ─── response helpers ─────────────────────────────────────────────────

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function sendError(res, err) {
  if (err instanceof ImageCoreError) {
    return sendJson(res, err.status, err.toJSON());
  }
  return sendJson(res, 500, { error: String(err.message || err), code: 'internal' });
}

function sendFile(res, path, contentType) {
  try {
    const buf = readFileSync(path);
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': buf.length,
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch (e) {
    sendError(res, e);
  }
}

async function readJsonBody(req, { maxBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(Object.assign(new Error(`invalid JSON body: ${e.message}`), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// ─── route handlers ──────────────────────────────────────────────────

async function handleRender(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return sendJson(res, e.status || 400, { error: e.message, code: 'bad_request' }); }

  const { platform, layout, data, force } = body;
  try {
    const result = await queue.enqueue(() => coreRender({ platform, layout, data, force: !!force }));
    log({ op: 'render', platform, layout, specHash: result.specHash, cacheHit: result.cacheHit, durationMs: result.durationMs });
    sendJson(res, 200, result);
  } catch (err) {
    log({ op: 'render_failed', platform, layout, code: err.code, error: String(err.message || err) });
    if (err instanceof ImageCoreError && err.status >= 500) {
      alertRenderFailure({ platform, layout, specHash: null, error: err }).catch(() => {});
    }
    sendError(res, err);
  }
}

async function handlePreview(req, res, url) {
  const platform = url.searchParams.get('platform');
  const layout = url.searchParams.get('layout');
  if (!platform || !layout) {
    return sendJson(res, 400, { error: 'platform and layout query params required', code: 'bad_request' });
  }

  let data;
  const dataParam = url.searchParams.get('data');
  if (dataParam) {
    try {
      const decoded = Buffer.from(dataParam, 'base64').toString('utf8');
      data = JSON.parse(decoded);
    } catch (e) {
      return sendJson(res, 400, { error: `invalid base64 JSON in data: ${e.message}`, code: 'bad_request' });
    }
  } else {
    const previewPath = join(TEMPLATES_DIR, allRoutes()[`${platform}/${layout}`]?.template || layout, 'preview.json');
    try {
      data = JSON.parse(readFileSync(previewPath, 'utf8'));
    } catch (e) {
      return sendJson(res, 404, { error: `no preview.json at ${previewPath}`, code: 'no_preview' });
    }
  }

  try {
    const result = await queue.enqueue(() => coreRender({ platform, layout, data, force: false }));
    log({ op: 'preview', platform, layout, specHash: result.specHash, cacheHit: result.cacheHit });
    const contentType = result.format === 'pdf' ? 'application/pdf' : 'image/png';
    sendFile(res, result.path, contentType);
  } catch (err) {
    log({ op: 'preview_failed', platform, layout, code: err.code, error: String(err.message || err) });
    sendError(res, err);
  }
}

function handleSchemas(res, layoutParam) {
  try {
    if (layoutParam) {
      const p = join(SCHEMAS_DIR, `${layoutParam}.schema.json`);
      if (!existsSync(p)) {
        return sendJson(res, 404, { error: `no schema for layout "${layoutParam}"`, code: 'unknown_layout' });
      }
      return sendJson(res, 200, JSON.parse(readFileSync(p, 'utf8')));
    }
    const out = {};
    for (const name of readdirSync(SCHEMAS_DIR)) {
      if (!name.endsWith('.schema.json')) continue;
      const key = name.replace(/\.schema\.json$/, '');
      out[key] = JSON.parse(readFileSync(join(SCHEMAS_DIR, name), 'utf8'));
    }
    sendJson(res, 200, { schemas: out });
  } catch (err) {
    sendError(res, err);
  }
}

function handleRoutes(res) {
  try {
    const routes = allRoutes();
    const platforms = allPlatforms();
    const byPlatform = {};
    for (const p of platforms) byPlatform[p] = allLayouts(p);
    sendJson(res, 200, { routes, byPlatform, ...versions() });
  } catch (err) {
    sendError(res, err);
  }
}

function handleHealth(res) {
  const status = { ok: true, port: PORT, host: HOST, renderVersion: RENDER_VERSION, queue: queue.stats(), cache: cache.stats() };
  try { status.chromePath = findChrome(); }
  catch (e) { status.ok = false; status.chromePath = null; status.chromeError = e.message; }
  status.fontsLocal = fontsAvailableLocally();
  if (!status.fontsLocal) status.fontsWarning = 'self-hosted fonts missing — run `npm run download-fonts`. Falling back to Google Fonts CDN.';
  sendJson(res, status.ok ? 200 : 503, status);
}

function handleDebugHtml(res, hash) {
  const html = cache.readHtml(hash);
  if (html === null) return sendJson(res, 404, { error: `no html for ${hash}`, code: 'not_found' });
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
}

function handleDebugMeta(res, hash) {
  const meta = cache.readMeta(hash);
  if (!meta) return sendJson(res, 404, { error: `no meta for ${hash}`, code: 'not_found' });
  sendJson(res, 200, meta);
}

function handleIndex(res) {
  sendJson(res, 200, {
    service: 'opentwins-image-core',
    version: RENDER_VERSION,
    endpoints: {
      'POST /render': 'body: {platform, layout, data, force?}',
      'GET /preview': 'query: platform, layout, data? (base64 JSON)',
      'GET /schemas': 'all layout data schemas',
      'GET /schemas/:layout': 'single layout schema',
      'GET /routes': 'platform+layout → dimensions table',
      'GET /health': 'liveness, chrome, fonts, queue, cache',
      'GET /debug/:hash/html': 'intermediate HTML for recent render',
      'GET /debug/:hash/meta': 'render metadata sidecar',
    },
  });
}

// ─── dispatcher ──────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method?.toUpperCase();
  const path = url.pathname;

  try {
    if (method === 'GET' && path === '/') return handleIndex(res);
    if (method === 'GET' && path === '/health') return handleHealth(res);
    if (method === 'GET' && path === '/routes') return handleRoutes(res);
    if (method === 'GET' && path === '/schemas') return handleSchemas(res);

    const schemaMatch = path.match(/^\/schemas\/([a-z]+)$/);
    if (method === 'GET' && schemaMatch) return handleSchemas(res, schemaMatch[1]);

    if (method === 'GET' && path === '/preview') return handlePreview(req, res, url);
    if (method === 'POST' && path === '/render') return handleRender(req, res);

    const htmlMatch = path.match(/^\/debug\/([a-f0-9]{8,64})\/html$/);
    if (method === 'GET' && htmlMatch) return handleDebugHtml(res, htmlMatch[1]);

    const metaMatch = path.match(/^\/debug\/([a-f0-9]{8,64})\/meta$/);
    if (method === 'GET' && metaMatch) return handleDebugMeta(res, metaMatch[1]);

    sendJson(res, 404, { error: `no route for ${method} ${path}`, code: 'not_found' });
  } catch (err) {
    sendError(res, err);
  }
});

// Graceful shutdown — don't kill in-flight renders.
function shutdown(signal) {
  log({ op: 'shutdown', signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  const warnings = [];
  try { findChrome(); } catch (e) { warnings.push(`chrome: ${e.message}`); }
  if (!fontsAvailableLocally()) warnings.push('fonts: self-hosted fonts missing; run `npm run download-fonts`');
  log({ op: 'listen', host: HOST, port: PORT, renderVersion: RENDER_VERSION, warnings });
  process.stderr.write(`image-core listening on http://${HOST}:${PORT}\n`);
  for (const w of warnings) process.stderr.write(`  ⚠ ${w}\n`);
});
