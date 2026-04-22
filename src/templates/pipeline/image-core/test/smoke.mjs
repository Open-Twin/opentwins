#!/usr/bin/env node
// End-to-end smoke test. Does NOT start the server itself — expects the
// server to already be running at $HOST:$PORT. In dev:
//   node server.mjs &
//   node test/smoke.mjs
//
// Verifies structural correctness + some visual sanity (PNG dimensions from
// IHDR, PDF page count from /Type /Page).

import { existsSync, statSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RenderQueue } from '../lib/queue.mjs';
import { QueueFullError } from '../lib/errors.mjs';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 47293);
const BASE = `http://${HOST}:${PORT}`;

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let passed = 0;
let failed = 0;
const fails = [];

async function check(name, fn) {
  try {
    await fn();
    process.stdout.write(`  ✓ ${name}\n`);
    passed += 1;
  } catch (e) {
    process.stdout.write(`  ✗ ${name} — ${e.message}\n`);
    failed += 1;
    fails.push({ name, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

async function getBinary(path) {
  const res = await fetch(`${BASE}${path}`);
  const contentType = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, contentType, bytes: buf.length, buf };
}

// PNG signature is 8 bytes; IHDR chunk starts at byte 8 (4-byte length,
// 4-byte type "IHDR", then 4-byte width, 4-byte height). So width starts
// at offset 16.
function readPngDims(buf) {
  assert(buf.length >= 24, 'too small to be a PNG');
  assert(buf.slice(0, 8).toString('binary') === '\x89PNG\r\n\x1a\n', 'not a PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// Count /Type /Page occurrences (not /Pages, which is the page tree root).
function countPdfPages(buf) {
  const str = buf.toString('latin1');
  const matches = str.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

async function main() {
  process.stdout.write(`\nimage-core smoke test → ${BASE}\n\n`);

  await check('GET /health → 200 with chrome resolved', async () => {
    const { status, body } = await getJson('/health');
    assert(status === 200, `status ${status}`);
    assert(body.chromePath, 'no chromePath');
    assert(body.ok === true, 'ok is false');
  });

  await check('GET /routes → contains expected combos', async () => {
    const { status, body } = await getJson('/routes');
    assert(status === 200, `status ${status}`);
    for (const key of ['linkedin/stack', 'linkedin/carousel', 'substack/note', 'twitter/matrix', 'bluesky/venn']) {
      assert(body.routes[key], `no ${key}`);
    }
  });

  await check('GET /schemas → includes all 5 layouts', async () => {
    const { status, body } = await getJson('/schemas');
    assert(status === 200, `status ${status}`);
    for (const k of ['stack', 'matrix', 'venn', 'note', 'carousel']) {
      assert(body.schemas[k], `missing schema for ${k}`);
    }
  });

  await check('GET /schemas/stack → resolves to single schema', async () => {
    const { status, body } = await getJson('/schemas/stack');
    assert(status === 200, `status ${status}`);
    assert(body.title?.includes('Stack'), 'schema title missing');
  });

  await check('POST /render invalid route → 400 invalid_route', async () => {
    const { status, body } = await postJson('/render', { platform: 'fake', layout: 'none', data: {} });
    assert(status === 400, `status ${status}`);
    assert(body.code === 'invalid_route', `code ${body.code}`);
  });

  await check('POST /render invalid data → 422 invalid_data (schema + template)', async () => {
    const { status, body } = await postJson('/render', { platform: 'linkedin', layout: 'stack', data: {} });
    assert(status === 422, `status ${status}`);
    assert(body.code === 'invalid_data', `code ${body.code}`);
    assert(Array.isArray(body.detail?.errors) && body.detail.errors.length > 0, 'no errors');
  });

  await check('POST /render rejects schema-invalid items count', async () => {
    const { status, body } = await postJson('/render', {
      platform: 'linkedin',
      layout: 'stack',
      data: { title: 't', subtitle: 's', items: [{ title: 'a', body: 'b' }] }, // only 1 item — min 3
    });
    assert(status === 422, `status ${status}`);
    assert(body.detail.errors.some((e) => /items/i.test(e)), `no items error: ${JSON.stringify(body.detail.errors)}`);
  });

  const stackData = JSON.parse(readFileSync(join(ROOT, 'templates/stack/preview.json'), 'utf8'));

  let firstHash;
  await check('POST /render linkedin/stack → 200 png 2400×2400', async () => {
    const { status, body } = await postJson('/render', { platform: 'linkedin', layout: 'stack', data: stackData, force: true });
    assert(status === 200, `status ${status}`);
    assert(body.format === 'png', `format ${body.format}`);
    assert(body.width === 1200 && body.height === 1200, 'dims mismatch');
    assert(existsSync(body.path), `file not found ${body.path}`);
    assert(statSync(body.path).size > 10_000, `too small: ${statSync(body.path).size} bytes`);
    // Verify actual rendered pixels — device-scale-factor=2, so 2400×2400.
    const dims = readPngDims(readFileSync(body.path));
    assert(dims.width === 2400 && dims.height === 2400, `actual PNG dims ${dims.width}×${dims.height}`);
    firstHash = body.specHash;
  });

  await check('POST /render same spec → 200 cacheHit: true', async () => {
    const { status, body } = await postJson('/render', { platform: 'linkedin', layout: 'stack', data: stackData });
    assert(status === 200, `status ${status}`);
    assert(body.cacheHit === true, 'should be cache hit');
    assert(body.specHash === firstHash, 'specHash drifted between identical renders');
  });

  await check('GET /debug/:hash/meta → matches recent render', async () => {
    const { status, body } = await getJson(`/debug/${firstHash}/meta`);
    assert(status === 200, `status ${status}`);
    assert(body.platform === 'linkedin' && body.layout === 'stack', 'meta mismatch');
  });

  await check('GET /debug/:hash/html → intermediate HTML retained', async () => {
    const res = await fetch(`${BASE}/debug/${firstHash}/html`);
    assert(res.status === 200, `status ${res.status}`);
    assert((res.headers.get('content-type') || '').includes('text/html'), 'not text/html');
    const html = await res.text();
    assert(html.includes('<!DOCTYPE html>'), 'no doctype');
    // Content-based check: preview.json's title must appear in the HTML.
    const escapedTitle = stackData.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    assert(html.includes(escapedTitle), 'preview title not present in rendered HTML');
  });

  await check('GET /preview substack/note → 2160×2160 PNG', async () => {
    const { status, contentType, bytes, buf } = await getBinary('/preview?platform=substack&layout=note');
    assert(status === 200, `status ${status}`);
    assert(contentType.includes('image/png'), `content-type ${contentType}`);
    assert(bytes > 10_000, `too small (${bytes} bytes)`);
    const dims = readPngDims(buf);
    assert(dims.width === 2160 && dims.height === 2160, `dims ${dims.width}×${dims.height}`);
  });

  await check('GET /preview twitter/matrix → 2400×2400 PNG', async () => {
    const { status, buf } = await getBinary('/preview?platform=twitter&layout=matrix');
    assert(status === 200, `status ${status}`);
    const dims = readPngDims(buf);
    assert(dims.width === 2400 && dims.height === 2400, `dims ${dims.width}×${dims.height}`);
  });

  await check('GET /preview bluesky/venn → 2400×2400 PNG', async () => {
    const { status, buf } = await getBinary('/preview?platform=bluesky&layout=venn');
    assert(status === 200, `status ${status}`);
    const dims = readPngDims(buf);
    assert(dims.width === 2400 && dims.height === 2400, `dims ${dims.width}×${dims.height}`);
  });

  await check('GET /preview linkedin/carousel → 10-page PDF', async () => {
    const { status, contentType, bytes, buf } = await getBinary('/preview?platform=linkedin&layout=carousel');
    assert(status === 200, `status ${status}`);
    assert(contentType.includes('application/pdf'), `content-type ${contentType}`);
    assert(bytes > 50_000, `too small (${bytes} bytes)`);
    const pages = countPdfPages(buf);
    assert(pages === 10, `expected 10 pages, got ${pages}`);
  });

  await check('Carousel rendered HTML escapes plain fields (e.g. card.feature "< 30s")', async () => {
    // Preview fixture includes "p95 TTFA < 30s" in pattern.card_right.feature.
    // Verify the rendered intermediate HTML has it escaped, not raw.
    const { body: route } = await getJson('/routes');
    const carouselHash = await (async () => {
      const { body: r } = await postJson('/render', {
        platform: 'linkedin', layout: 'carousel',
        data: JSON.parse(readFileSync(join(ROOT, 'templates/carousel/preview.json'), 'utf8')),
      });
      return r.specHash;
    })();
    const res = await fetch(`${BASE}/debug/${carouselHash}/html`);
    const html = await res.text();
    assert(html.includes('&lt; 30s'), 'carousel HTML missed escaping — contains raw "< 30s"');
    // Negative: make sure HTML-contract fields stay raw
    assert(html.includes('<b>spec</b>') || html.includes('<b>The PM Spec</b>')
        || /<b>[^<]*<\/b>/.test(html), 'hook support_html should keep <b> raw');
  });

  await check('Schema validator rejects unknown icon on carousel field', async () => {
    const data = JSON.parse(readFileSync(join(ROOT, 'templates/carousel/preview.json'), 'utf8'));
    data.fields[0].icon = 'bogus_icon_name';
    const { status, body } = await postJson('/render', { platform: 'linkedin', layout: 'carousel', data });
    assert(status === 422, `status ${status}`);
    assert(body.detail.errors.some((e) => /icon/i.test(e)), `no icon error: ${JSON.stringify(body.detail.errors)}`);
  });

  // Queue saturation is tested directly against the RenderQueue class, not
  // through HTTP. With fonts local, renders are fast enough that HTTP-level
  // timing was flaky — enough requests would drain before the burst landed.
  // Direct test is deterministic: use long-running decoy tasks.
  await check('RenderQueue enforces maxDepth (direct unit test)', async () => {
    const q = new RenderQueue({ concurrency: 1, maxDepth: 3 });
    const slow = () => new Promise((resolve) => setTimeout(() => resolve('ok'), 50));
    const results = await Promise.allSettled([
      q.enqueue(slow), q.enqueue(slow), q.enqueue(slow),
      q.enqueue(slow), q.enqueue(slow),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert(fulfilled.length === 3, `expected 3 fulfilled, got ${fulfilled.length}`);
    assert(rejected.length === 2, `expected 2 rejected, got ${rejected.length}`);
    for (const r of rejected) {
      assert(r.reason instanceof QueueFullError, `wrong error type: ${r.reason?.constructor?.name}`);
      assert(r.reason.status === 429, `wrong status: ${r.reason.status}`);
    }
  });

  await check('RenderQueue drains after tasks complete', async () => {
    const q = new RenderQueue({ concurrency: 2, maxDepth: 2 });
    const fast = () => Promise.resolve('ok');
    await Promise.all([q.enqueue(fast), q.enqueue(fast)]);
    // Now empty; we should be able to enqueue again without hitting 429.
    const res = await q.enqueue(fast);
    assert(res === 'ok', `unexpected result ${res}`);
    assert(q.stats().pending === 0 && q.stats().running === 0, `stats non-empty: ${JSON.stringify(q.stats())}`);
  });

  process.stdout.write(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.stdout.write('\nfailures:\n');
    for (const f of fails) process.stdout.write(`  ${f.name}: ${f.error}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
