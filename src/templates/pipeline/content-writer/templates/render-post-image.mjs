#!/usr/bin/env node
// render-post-image.mjs — LinkedIn single-post image renderer.
//
// Routes by spec.type to one of three hand-drawn notebook layouts:
//   matrix — 2×2 axes grid (Execution/Judgment × Human/Agent)
//   venn   — two overlapping ellipses with left/right bullets + center insight
//   stack  — numbered vertical stack of framework fields with arrows
//
// Usage:
//   node render-post-image.mjs <spec.json> <output.png>
// Exits 0 on success, 2 on validation / render IO errors.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { exit } from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , specPath, outPath] = process.argv;
if (!specPath || !outPath) {
  console.error('Usage: node render-post-image.mjs <spec.json> <output.png>');
  exit(2);
}

let spec;
try {
  spec = JSON.parse(readFileSync(specPath, 'utf8'));
} catch (e) {
  console.error(`Failed to read/parse ${specPath}: ${e.message}`);
  exit(2);
}

const TYPES = ['matrix', 'venn', 'stack'];
if (!TYPES.includes(spec.type)) {
  console.error(`spec.type must be one of: ${TYPES.join(', ')}`);
  exit(2);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// Allow plain newlines in some fields (labels, doodles) — convert to <br/>.
const multiline = (s) => escapeHtml(s).replace(/\n/g, '<br/>');

// ─── shared chrome: fonts, paper background, page frame ───────────────
const SHARED_HEAD = `
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&family=Caveat:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: 1200px 1200px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 1200px; }
  body {
    background: #faf7f0;
    background-image:
      radial-gradient(circle at 30% 20%, rgba(0,0,0,0.02) 0%, transparent 50%),
      radial-gradient(circle at 70% 80%, rgba(90,70,30,0.03) 0%, transparent 50%);
    font-family: 'Kalam', cursive;
    color: #2c3e50;
    position: relative;
    overflow: hidden;
  }
  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
      to bottom, transparent 0, transparent 39px, rgba(80,60,30,0.04) 40px
    );
    pointer-events: none;
  }
  .page { padding: 70px 80px 50px; height: 100%; position: relative; }
  .title {
    font-family: 'Caveat', cursive; font-weight: 700;
    font-size: 72px; line-height: 1.0;
    transform: rotate(-0.5deg); margin-bottom: 10px;
  }
  .subtitle {
    font-family: 'Kalam', cursive; font-weight: 400;
    font-size: 26px; color: #5c6b7a;
    transform: rotate(0.3deg); margin-bottom: 36px; max-width: 900px;
  }
  .doodle {
    position: absolute; font-family: 'Caveat', cursive;
    color: #5c6b7a; font-size: 24px; line-height: 1.2;
  }
</style>
`;

// ─── layout: matrix (2×2) ──────────────────────────────────────────────
function renderMatrix(s) {
  if (!Array.isArray(s.cells) || s.cells.length !== 4) {
    console.error('matrix: spec.cells must be 4 entries');
    exit(2);
  }
  if (!s.axes || !Array.isArray(s.axes.x) || s.axes.x.length !== 2
      || !Array.isArray(s.axes.y) || s.axes.y.length !== 2) {
    console.error('matrix: spec.axes.x and spec.axes.y must each be 2-item arrays');
    exit(2);
  }
  const VALID_TONES = ['good', 'bad', 'neutral'];
  const cells = s.cells.map((c, i) => {
    const tone = VALID_TONES.includes(c.tone) ? c.tone : 'neutral';
    return `
      <div class="cell ${tone} q${i + 1}">
        <div class="cell-label">${escapeHtml(c.label)}</div>
        <div class="cell-body">${escapeHtml(c.body)}</div>
      </div>`;
  }).join('');

  return `
<style>
  .matrix-wrap { position: relative; padding-left: 90px; padding-top: 52px; height: 780px; }
  .xaxis {
    position: absolute; top: 0; left: 90px; right: 0;
    display: grid; grid-template-columns: 1fr 1fr;
    font-weight: 700; font-size: 28px; color: #2c3e50;
    text-align: center; padding-bottom: 10px;
  }
  .xaxis > div:nth-child(1) { transform: rotate(-0.3deg); }
  .xaxis > div:nth-child(2) { transform: rotate(0.4deg); }
  .yaxis {
    position: absolute; left: 4px; top: 52px; bottom: 0; width: 66px;
    display: grid; grid-template-rows: 1fr 1fr;
  }
  .yaxis > div {
    display: flex; align-items: center; justify-content: center;
    writing-mode: vertical-rl; transform: rotate(180deg);
    font-weight: 700; font-size: 28px; color: #2c3e50; letter-spacing: 2px;
  }
  .grid {
    display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
    gap: 20px; height: 100%;
  }
  .cell {
    border: 3px solid #2c3e50; padding: 24px 28px;
    display: flex; flex-direction: column;
    background: rgba(255, 253, 246, 0.6);
  }
  .cell.q1 { transform: rotate(-0.3deg); border-radius: 4px 7px 3px 5px; }
  .cell.q2 { transform: rotate(0.4deg); border-radius: 6px 4px 7px 3px; }
  .cell.q3 { transform: rotate(0.3deg); border-radius: 3px 5px 4px 7px; }
  .cell.q4 { transform: rotate(-0.4deg); border-radius: 7px 3px 5px 4px; }
  .cell-label {
    font-family: 'Caveat', cursive; font-weight: 700;
    font-size: 46px; margin-bottom: 6px; line-height: 1.0;
  }
  .cell.good .cell-label { color: #0a66c2; }
  .cell.bad .cell-label { color: #b44; }
  .cell.neutral .cell-label { color: #7a5a30; }
  .cell-body {
    font-family: 'Kalam', cursive; font-weight: 400;
    font-size: 22px; line-height: 1.35; color: #2c3e50;
  }
  .doodle { right: 40px; bottom: 20px; transform: rotate(-4deg); text-align: right; }
</style>
<div class="page">
  <div class="title">${escapeHtml(s.title)}</div>
  <div class="subtitle">${escapeHtml(s.subtitle)}</div>
  <div class="matrix-wrap">
    <div class="xaxis"><div>${escapeHtml(s.axes.x[0])}</div><div>${escapeHtml(s.axes.x[1])}</div></div>
    <div class="yaxis"><div>${escapeHtml(s.axes.y[0])}</div><div>${escapeHtml(s.axes.y[1])}</div></div>
    <div class="grid">${cells}</div>
  </div>
  ${s.doodle ? `<div class="doodle">${multiline(s.doodle)}</div>` : ''}
</div>`;
}

// ─── layout: venn ──────────────────────────────────────────────────────
function renderVenn(s) {
  for (const side of ['left', 'right']) {
    if (!s[side] || !s[side].label || !Array.isArray(s[side].bullets)) {
      console.error(`venn: spec.${side}.label and spec.${side}.bullets required`);
      exit(2);
    }
  }
  if (!s.center || !s.overlap_label) {
    console.error('venn: spec.center and spec.overlap_label required');
    exit(2);
  }
  const leftBullets = s.left.bullets.map(escapeHtml).join('<br/>');
  const rightBullets = s.right.bullets.map(escapeHtml).join('<br/>');

  return `
<style>
  .venn-wrap { position: relative; height: 820px; width: 100%; }
  .venn-svg { position: absolute; top: 30px; left: 50%; transform: translateX(-50%) rotate(-0.4deg); }
  .label-left {
    position: absolute; top: 28px; left: 30px;
    font-family: 'Caveat', cursive; font-weight: 700; font-size: 40px;
    color: #7a5a30; transform: rotate(-2deg); max-width: 240px;
  }
  .label-right {
    position: absolute; top: 28px; right: 30px;
    font-family: 'Caveat', cursive; font-weight: 700; font-size: 40px;
    color: #0a66c2; transform: rotate(2deg); text-align: right; max-width: 240px;
  }
  .label-overlap {
    position: absolute; bottom: 40px; left: 50%;
    transform: translateX(-50%) rotate(-0.6deg);
    font-family: 'Caveat', cursive; font-weight: 700; font-size: 56px;
    color: #2c3e50; text-align: center; letter-spacing: -0.5px;
  }
  .bullets-left {
    position: absolute; top: 240px; left: 150px;
    font-family: 'Kalam', cursive; font-size: 24px; line-height: 1.6;
    color: #2c3e50; max-width: 260px; transform: rotate(-1deg);
  }
  .bullets-right {
    position: absolute; top: 240px; right: 150px;
    font-family: 'Kalam', cursive; font-size: 24px; line-height: 1.6;
    color: #2c3e50; max-width: 260px; text-align: right; transform: rotate(1.2deg);
  }
  .center-insight {
    position: absolute; top: 410px; left: 50%;
    transform: translateX(-50%) rotate(0.3deg);
    font-family: 'Kalam', cursive; font-weight: 700; font-size: 28px;
    line-height: 1.35; color: #2c3e50; text-align: center; max-width: 300px;
  }
  .doodle { left: 80px; bottom: 10px; transform: rotate(-3deg); font-size: 26px; }
  .arrow-inline { display: inline-block; transform: rotate(-20deg); font-size: 32px; }
</style>
<div class="page">
  <div class="title" style="transform: rotate(-0.5deg);">${escapeHtml(s.title)}</div>
  <div class="subtitle" style="margin-bottom: 20px;">${escapeHtml(s.subtitle)}</div>
  <div class="venn-wrap">
    <svg class="venn-svg" width="1000" height="640" viewBox="0 0 1000 640" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="380" cy="320" rx="310" ry="280"
        fill="rgba(200,160,100,0.08)" stroke="#2c3e50" stroke-width="3"
        transform="rotate(-1 380 320)" />
      <ellipse cx="620" cy="320" rx="310" ry="280"
        fill="rgba(10,102,194,0.08)" stroke="#2c3e50" stroke-width="3"
        transform="rotate(0.8 620 320)" />
    </svg>
    <div class="label-left">${multiline(s.left.label)}</div>
    <div class="label-right">${multiline(s.right.label)}</div>
    <div class="bullets-left">${leftBullets}</div>
    <div class="bullets-right">${rightBullets}</div>
    <div class="center-insight">${multiline(s.center)}</div>
    <div class="label-overlap">${escapeHtml(s.overlap_label)}</div>
  </div>
  ${s.doodle ? `<div class="doodle">${multiline(s.doodle)}</div>` : ''}
</div>`;
}

// ─── layout: stack ─────────────────────────────────────────────────────
function renderStack(s) {
  if (!Array.isArray(s.items) || s.items.length < 3 || s.items.length > 5) {
    console.error('stack: spec.items must be 3-5 entries');
    exit(2);
  }
  const items = s.items.map((it, i) => {
    if (!it.title || !it.body) {
      console.error(`stack: items[${i}].title and .body required`);
      exit(2);
    }
    const arrow = i < s.items.length - 1 ? '<div class="arrow-down">↓</div>' : '';
    return `
      <div class="item">
        <div class="num">${i + 1}</div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(it.title)}</div>
          <div class="item-desc">${escapeHtml(it.body)}</div>
        </div>
      </div>${arrow}`;
  }).join('');

  return `
<style>
  .stack { position: relative; }
  .item {
    display: grid; grid-template-columns: 110px 1fr; gap: 22px;
    align-items: start; padding: 18px 28px;
    border: 3px solid #2c3e50; background: rgba(255, 253, 246, 0.55);
    margin-bottom: 16px; border-radius: 4px 7px 3px 5px; min-height: 144px;
  }
  .item:nth-child(1) { transform: rotate(-0.4deg); }
  .item:nth-child(3) { transform: rotate(0.3deg); }
  .item:nth-child(5) { transform: rotate(0.5deg); }
  .item:nth-child(7) { transform: rotate(-0.3deg); }
  .num {
    font-family: 'Caveat', cursive; font-weight: 700;
    font-size: 86px; line-height: 1; color: #0a66c2; text-align: center;
  }
  .item-body { padding-top: 10px; }
  .item-title {
    font-family: 'Caveat', cursive; font-weight: 700;
    font-size: 44px; line-height: 1; margin-bottom: 6px; color: #2c3e50;
  }
  .item-desc {
    font-family: 'Kalam', cursive; font-weight: 400;
    font-size: 24px; line-height: 1.35; color: #2c3e50; max-width: 820px;
  }
  .arrow-down {
    text-align: center; font-family: 'Caveat', cursive;
    font-size: 50px; line-height: 0.4; color: #7a5a30;
    margin: -8px 0; transform: rotate(-1deg) translateX(-370px);
  }
  .doodle { left: 80px; bottom: 10px; transform: rotate(-3deg); }
</style>
<div class="page">
  <div class="title" style="transform: rotate(-0.4deg); margin-bottom: 10px;">${escapeHtml(s.title)}</div>
  <div class="subtitle" style="margin-bottom: 40px;">${escapeHtml(s.subtitle)}</div>
  <div class="stack">${items}</div>
  ${s.doodle ? `<div class="doodle">${multiline(s.doodle)}</div>` : ''}
</div>`;
}

// ─── common validate ──────────────────────────────────────────────────
for (const k of ['title', 'subtitle']) {
  if (!spec[k] || typeof spec[k] !== 'string') {
    console.error(`spec.${k} is required (string)`);
    exit(2);
  }
}

let body;
if (spec.type === 'matrix') body = renderMatrix(spec);
else if (spec.type === 'venn') body = renderVenn(spec);
else body = renderStack(spec);

const html = `<!DOCTYPE html><html><head>${SHARED_HEAD}</head><body>${body}</body></html>`;

// ─── render to PNG via Chrome headless ─────────────────────────────────
const ts = Date.now();
const htmlPath = join(tmpdir(), `opentwins-post-image-${ts}.html`);
try {
  writeFileSync(htmlPath, html);
} catch (e) {
  console.error(`Failed to write intermediate HTML: ${e.message}`);
  exit(2);
}

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
    '--window-size=1200,1200',
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
