#!/usr/bin/env node
// render-note-image.mjs — Substack Note image renderer.
//
// Takes a structured spec.json (produced by the Content Writer) and
// produces a 1080×1080 PNG via system Chrome headless. Template + CSS
// are baked in here so the visual language is locked; the Content
// Writer only emits DATA, never HTML or CSS.
//
// Visual language mirrors render-carousel.mjs (dark gradient, brand
// blue #0A66C2 accent, system sans + SF Mono footer).
//
// Usage:
//   node render-note-image.mjs <spec.json> <output.png>
// Exits 0 on success, 2 on validation/render IO errors.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { exit } from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , specPath, outPath] = process.argv;
if (!specPath || !outPath) {
  console.error('Usage: node render-note-image.mjs <spec.json> <output.png>');
  exit(2);
}

let spec;
try {
  spec = JSON.parse(readFileSync(specPath, 'utf8'));
} catch (e) {
  console.error(`Failed to read/parse ${specPath}: ${e.message}`);
  exit(2);
}

// ─── validate ──────────────────────────────────────────────────────────
if (!spec.headline || typeof spec.headline !== 'string') {
  console.error('spec.headline is required (string, 10–25 words)');
  exit(2);
}
const wordCount = spec.headline.trim().split(/\s+/).length;
if (wordCount < 5 || wordCount > 30) {
  console.error(`spec.headline has ${wordCount} words; must be 5–30 (target 10–25)`);
  exit(2);
}
const accent = spec.accent && typeof spec.accent === 'string' ? spec.accent.trim() : '';
const subline = spec.subline && typeof spec.subline === 'string' ? spec.subline.trim() : '';

// ─── headline with optional accent highlight ───────────────────────────
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

let headlineHtml = escapeHtml(spec.headline);
if (accent) {
  // Replace first occurrence of accent (case-insensitive) with span
  const re = new RegExp(escapeHtml(accent).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (re.test(headlineHtml)) {
    headlineHtml = headlineHtml.replace(re, (m) => `<span class="accent">${m}</span>`);
  } else {
    console.error(`Warning: spec.accent "${accent}" not found in headline; rendering without highlight`);
  }
}

// ─── HTML template (locked — mirrors render-carousel.mjs brand) ────────
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
html, body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; }
body {
  width: 1080px; height: 1080px;
  background: radial-gradient(circle at 25% 25%, #1e4a82 0%, #0A1A2B 70%);
  color: white;
  padding: 110px 100px;
  display: flex; flex-direction: column; justify-content: center;
  overflow: hidden;
}
h1 {
  font-size: 104px;
  font-weight: 800;
  line-height: 1.03;
  letter-spacing: -3px;
  color: white;
  max-width: 900px;
}
h1 .accent { color: #7cb5ff; }
.subline {
  margin-top: 44px;
  font-size: 30px;
  line-height: 1.45;
  color: rgba(255,255,255,0.78);
  font-weight: 500;
  max-width: 840px;
}
</style>
</head>
<body>
<h1>${headlineHtml}</h1>
${subline ? `<div class="subline">${escapeHtml(subline)}</div>` : ''}
</body>
</html>
`;

// ─── render to PNG via Chrome headless ─────────────────────────────────
const ts = Date.now();
const htmlPath = join(tmpdir(), `opentwins-note-html-${ts}.html`);
try {
  writeFileSync(htmlPath, html);
} catch (e) {
  console.error(`Failed to write intermediate HTML: ${e.message}`);
  exit(2);
}

// Try common Chrome locations
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chrome = CHROME_PATHS.find(existsSync);
if (!chrome) {
  console.error(`Chrome not found in: ${CHROME_PATHS.join(', ')}`);
  try { unlinkSync(htmlPath); } catch {}
  exit(2);
}

try {
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--default-background-color=00000000',
    `--screenshot=${outPath}`,
    '--window-size=1080,1080',
    `file://${htmlPath}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
  console.error(`Chrome render failed: ${e.message}`);
  try { unlinkSync(htmlPath); } catch {}
  exit(2);
}

try { unlinkSync(htmlPath); } catch {}

if (!existsSync(outPath)) {
  console.error(`Render completed but ${outPath} not found`);
  exit(2);
}

console.log(`Rendered ${outPath}`);
