#!/usr/bin/env node
// render-carousel.mjs — LinkedIn document carousel renderer.
//
// Takes a structured spec.json (produced by the Content Writer) and
// produces a fully laid-out HTML file that Chrome headless can rasterize
// to a 10-page PDF (1080×1080 per page). Template + CSS are baked in
// here so the carousel visual language is locked; the Content Writer
// only emits DATA, never HTML or CSS.
//
// Usage:
//   node render-carousel.mjs <spec.json> <output.html>
// Exits 0 on success, 2 on validation / IO errors.

import { readFileSync, writeFileSync } from 'node:fs';
import { exit } from 'node:process';

const [, , specPath, outPath] = process.argv;
if (!specPath || !outPath) {
  console.error('Usage: node render-carousel.mjs <spec.json> <output.html>');
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
const required = ['cover', 'hook', 'code', 'fields', 'pattern', 'cta', 'bonus'];
for (const k of required) {
  if (!spec[k]) { console.error(`spec.${k} is required`); exit(2); }
}
if (!Array.isArray(spec.fields) || spec.fields.length !== 4) {
  console.error('spec.fields must be an array of exactly 4 field slides');
  exit(2);
}
const VALID_ICONS = ['target', 'lock', 'notebook', 'alarm', 'lightning', 'shield', 'spark', 'map'];
for (const [i, f] of spec.fields.entries()) {
  for (const k of ['name', 'icon', 'definition', 'eng', 'pm', 'takeaway_html', 'swipe']) {
    if (f[k] === undefined) { console.error(`spec.fields[${i}].${k} is required`); exit(2); }
  }
  if (!VALID_ICONS.includes(f.icon)) {
    console.error(`spec.fields[${i}].icon="${f.icon}" — must be one of: ${VALID_ICONS.join(', ')}`);
    exit(2);
  }
}

// ─── icon library (simple stroked SVGs) ────────────────────────────────
const ICONS = {
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11 V8 a4 4 0 0 1 8 0 V11"/>',
  notebook: '<rect x="5" y="4" width="14" height="16" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="13" y2="15"/>',
  alarm: '<path d="M12 3 C8 3 6 6 6 10 V14 L4 17 H20 L18 14 V10 C18 6 16 3 12 3 Z"/><path d="M10 20 a2 2 0 0 0 4 0"/>',
  lightning: '<path d="M13 2 L4 14 H11 L10 22 L20 10 H13 Z"/>',
  shield: '<path d="M12 2 L4 6 V12 C4 17 8 21 12 22 C16 21 20 17 20 12 V6 Z"/>',
  spark: '<path d="M12 3 V7 M12 17 V21 M3 12 H7 M17 12 H21 M5 5 L8 8 M16 16 L19 19 M19 5 L16 8 M8 16 L5 19"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
};

// ─── CSS (locked — do not edit without visual review) ──────────────────
const CSS = `
@page { size: 1080px 1080px; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
html, body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #1a1f2e; }
body { background: white; }
section {
  width: 1080px; height: 1080px;
  padding: 80px;
  position: relative;
  background: white;
  display: flex; flex-direction: column;
  overflow: hidden;
}
section + section { page-break-before: always; }
.stretch { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.top { padding-top: 30px; }
.foot { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; font-size: 19px; color: #6b7684; padding-top: 32px; border-top: 1px solid #e5e7eb; }
.foot .swipe { justify-self: center; color: #0A66C2; font-weight: 700; font-size: 20px; letter-spacing: 0.3px; }
.foot .pg { justify-self: end; font-weight: 700; font-size: 18px; color: #6b7684; }
.eyebrow { display: inline-block; padding: 8px 18px; border-radius: 8px; background: #e8f1fa; color: #0A66C2; font-size: 18px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 28px; }
h2 { font-size: 66px; font-weight: 800; line-height: 1.06; letter-spacing: -1.8px; color: #0a1a2b; }
.cover { background: radial-gradient(circle at 25% 25%, #1e4a82 0%, #0A1A2B 70%); color: white; padding: 90px; }
.cover-grid { display: grid; grid-template-columns: 320px 1fr; gap: 56px; align-items: center; flex: 1; }
.file-icon { width: 300px; height: 360px; background: white; border-radius: 14px; position: relative; box-shadow: 0 40px 100px rgba(10,102,194,0.35); transform: rotate(-4deg); }
.file-icon::before { content: ""; position: absolute; top: 0; right: 0; width: 82px; height: 82px; background: #e5e7eb; border-top-right-radius: 14px; clip-path: polygon(0 0, 100% 100%, 100% 0); }
.file-icon::after { content: ""; position: absolute; top: 0; right: 0; width: 82px; height: 82px; background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.04) 50%); border-top-right-radius: 14px; }
.fi-label { position: absolute; top: 130px; left: 0; right: 0; text-align: center; font-family: "SF Mono", Consolas, monospace; font-size: 40px; font-weight: 800; color: #0A66C2; }
.fi-sub { position: absolute; top: 186px; left: 0; right: 0; text-align: center; font-family: "SF Mono", Consolas, monospace; font-size: 17px; color: #6b7684; letter-spacing: 0.3px; }
.fi-dots { position: absolute; top: 230px; left: 30px; right: 30px; display: flex; flex-direction: column; gap: 12px; }
.fi-dots span { height: 6px; background: #e5e7eb; border-radius: 3px; display: block; }
.fi-dots span:nth-child(1) { width: 68%; } .fi-dots span:nth-child(2) { width: 84%; }
.fi-dots span:nth-child(3) { width: 48%; } .fi-dots span:nth-child(4) { width: 72%; }
.cover h1 { font-size: 86px; font-weight: 800; line-height: 1.02; letter-spacing: -3px; margin-bottom: 26px; color: white; }
.cover .subline { font-size: 26px; opacity: 0.85; font-weight: 500; line-height: 1.45; }
.cover-foot { display: flex; justify-content: flex-start; align-items: center; padding-top: 40px; }
.cover-foot .pill { display: inline-block; background: rgba(255,255,255,0.14); padding: 12px 24px; border-radius: 999px; font-size: 19px; font-weight: 600; color: white; letter-spacing: 0.3px; }
.hook h2 { font-size: 96px; line-height: 1.0; letter-spacing: -3px; margin-top: 12px; }
.hook h2 .accent { color: #0A66C2; }
.hook .support { margin-top: 46px; font-size: 26px; line-height: 1.45; color: #4a5568; max-width: 820px; }
.hook .support b { color: #0A66C2; font-weight: 700; }
.code-slide { background: #0a1a2b; color: white; }
.code-slide .eyebrow { background: rgba(10,102,194,0.22); color: #7cb5ff; }
.code-slide h2 { color: white; font-size: 48px; margin-bottom: 34px; letter-spacing: -1px; }
.code-slide .foot { border-top: 1px solid rgba(255,255,255,0.12); }
.code-slide .foot .pg { color: rgba(255,255,255,0.6); }
.code-slide .foot .swipe { color: #7cb5ff; }
.code-window { background: #0d2440; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.09); box-shadow: 0 30px 80px rgba(0,0,0,0.5); }
.code-header { background: #15304f; padding: 14px 20px; display: flex; align-items: center; gap: 10px; }
.code-header .dot { width: 13px; height: 13px; border-radius: 50%; }
.code-header .d1 { background: #ff5f57; } .code-header .d2 { background: #febc2e; } .code-header .d3 { background: #28c840; }
.code-header .filename { margin-left: 14px; color: #8da3c1; font-family: "SF Mono", Consolas, monospace; font-size: 17px; font-weight: 600; }
.code-body { padding: 34px 40px; font-family: "SF Mono", Consolas, monospace; font-size: 20px; line-height: 1.75; color: #d1dfee; }
.c1 { color: #7cb5ff; font-weight: 700; }
.c2 { color: #8aa7c4; }
.c3 { color: #6bcb77; }
.c4 { color: #ffb86c; }
.c5 { color: #ff79c6; }
.field .icon-wrap { width: 92px; height: 92px; border-radius: 20px; background: #e8f1fa; display: flex; align-items: center; justify-content: center; margin-bottom: 28px; }
.field .icon-wrap svg { width: 50px; height: 50px; stroke: #0A66C2; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.field h2 { font-size: 64px; margin-bottom: 18px; }
.field .def { font-size: 30px; color: #4a5568; line-height: 1.35; max-width: 820px; margin-bottom: 40px; font-weight: 500; }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 36px; }
.compare .box { padding: 28px 30px; border-radius: 14px; background: #f6f8fa; border-left: 5px solid #9aa5b1; }
.compare .box.pm { background: #eaf3fb; border-left-color: #0A66C2; }
.compare .label { font-size: 13px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; color: #6b7684; margin-bottom: 10px; }
.compare .pm .label { color: #0A66C2; }
.compare .q { font-size: 22px; line-height: 1.4; color: #1a1f2e; font-weight: 500; }
.takeaway { font-size: 23px; color: #4a5568; line-height: 1.45; max-width: 880px; }
.takeaway b { color: #0A66C2; font-weight: 700; }
.pattern .grid { display: grid; grid-template-columns: 1fr 80px 1fr; gap: 24px; align-items: stretch; margin: 28px 0 40px; }
.pattern .card { padding: 34px 32px; border-radius: 16px; background: #f6f8fa; border-top: 6px solid #0A66C2; display: flex; flex-direction: column; }
.pattern .date { font-family: "SF Mono", Consolas, monospace; font-size: 17px; color: #0A66C2; font-weight: 700; letter-spacing: 1px; margin-bottom: 14px; }
.pattern .lab { font-size: 26px; font-weight: 800; color: #0a1a2b; margin-bottom: 4px; }
.pattern .feat { font-size: 24px; color: #1a1f2e; margin-bottom: 14px; font-weight: 700; }
.pattern .desc { font-size: 18px; color: #4a5568; line-height: 1.45; margin-top: auto; }
.pattern .eq { display: flex; align-items: center; justify-content: center; font-size: 52px; color: #0A66C2; font-weight: 800; }
.pattern .closer { font-size: 28px; line-height: 1.35; color: #1a1f2e; font-weight: 600; max-width: 900px; margin-top: 12px; }
.pattern .closer b { color: #0A66C2; }
.cta { background: linear-gradient(135deg, #0A66C2 0%, #003d82 100%); color: white; }
.cta .stretch { align-items: flex-start; justify-content: center; text-align: left; }
.cta .eyebrow { background: rgba(255,255,255,0.16); color: white; }
.cta h2 { color: white; font-size: 72px; line-height: 1.08; max-width: 900px; letter-spacing: -2px; }
.cta .options { font-size: 28px; opacity: 0.88; line-height: 1.5; margin-top: 36px; font-weight: 500; }
.cta .closer { font-size: 24px; opacity: 0.75; font-style: italic; margin-top: 24px; }
.cta .foot { border-top: 1px solid rgba(255,255,255,0.18); }
.cta .foot .pg { color: rgba(255,255,255,0.7); }
.bonus { background: #f6f8fa; }
.bonus .eyebrow { background: #0A66C2; color: white; }
.bonus h2 { font-size: 50px; margin-bottom: 10px; letter-spacing: -1.5px; }
.bonus .intro { font-size: 22px; color: #4a5568; margin-bottom: 22px; max-width: 820px; line-height: 1.4; font-weight: 500; }
.template { background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px 34px; font-family: "SF Mono", Consolas, monospace; font-size: 19px; line-height: 1.55; color: #0a1a2b; box-shadow: 0 8px 24px rgba(0,0,0,0.04); margin-bottom: 22px; }
.template .c1 { color: #0A66C2; font-weight: 700; }
.template .c2 { color: #8aa7c4; }
.template .blank { display: inline-block; border-bottom: 2px solid #9aa5b1; width: 320px; height: 4px; vertical-align: middle; margin-left: 4px; }
.bonus .outro { font-size: 21px; color: #1a1f2e; font-weight: 500; line-height: 1.45; }
.bonus .outro b { color: #0A66C2; font-weight: 700; }
`;

// ─── per-slide renderers ───────────────────────────────────────────────
const linesToHtml = (arr) => arr.map(l => l === '' ? '<br>' : `${l}<br>`).join('');

const renderCover = (s) => `<section class="cover">
  <div class="cover-grid">
    <div class="file-icon">
      <div class="fi-label">${s.cover.file_label}</div>
      <div class="fi-sub">${s.cover.file_sub}</div>
      <div class="fi-dots"><span></span><span></span><span></span><span></span></div>
    </div>
    <div>
      <h1>${s.cover.headline.join('<br>')}</h1>
      <div class="subline">${s.cover.subline.join('<br>')}</div>
    </div>
  </div>
  <div class="cover-foot">
    <span class="pill">${s.cover.read_promise}</span>
  </div>
</section>`;

const renderHook = (s) => {
  const h = s.hook.headline_lines.map(l =>
    l.accent ? `<span class="accent">${l.text}</span>` : l.text
  ).join('<br>');
  return `<section class="hook">
  <div class="top"><div class="eyebrow">${s.hook.eyebrow}</div></div>
  <div class="stretch">
    <h2>${h}</h2>
    <div class="support">${s.hook.support_html}</div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${s.hook.swipe}</span>
    <span class="pg">2 / 10</span>
  </div>
</section>`;
};

const renderCode = (s) => `<section class="code-slide">
  <div class="top"><div class="eyebrow">${s.code.eyebrow}</div></div>
  <div class="stretch">
    <h2>${s.code.title}</h2>
    <div class="code-window">
      <div class="code-header">
        <span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
        <span class="filename">${s.code.filename}</span>
      </div>
      <div class="code-body">${linesToHtml(s.code.body_lines)}</div>
    </div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${s.code.swipe}</span>
    <span class="pg">3 / 10</span>
  </div>
</section>`;

const renderField = (f, idx) => `<section class="field">
  <div class="top"><div class="eyebrow">Field ${idx + 1} · ${f.name}</div></div>
  <div class="stretch">
    <div class="icon-wrap"><svg viewBox="0 0 24 24">${ICONS[f.icon]}</svg></div>
    <h2>${f.name}</h2>
    <div class="def">${f.definition}</div>
    <div class="compare">
      <div class="box"><div class="label">Engineering writes</div><div class="q">${f.eng}</div></div>
      <div class="box pm"><div class="label">PM writes</div><div class="q">${f.pm}</div></div>
    </div>
    <div class="takeaway">${f.takeaway_html}</div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${f.swipe}</span>
    <span class="pg">${idx + 4} / 10</span>
  </div>
</section>`;

const renderPattern = (s) => `<section class="pattern">
  <div class="top"><div class="eyebrow">${s.pattern.eyebrow}</div></div>
  <div class="stretch">
    <h2>${s.pattern.title}</h2>
    <div class="grid">
      <div class="card">
        <div class="date">${s.pattern.card_left.date}</div>
        <div class="lab">${s.pattern.card_left.lab}</div>
        <div class="feat">${s.pattern.card_left.feature}</div>
        <div class="desc">${s.pattern.card_left.desc}</div>
      </div>
      <div class="eq">${s.pattern.connector}</div>
      <div class="card">
        <div class="date">${s.pattern.card_right.date}</div>
        <div class="lab">${s.pattern.card_right.lab}</div>
        <div class="feat">${s.pattern.card_right.feature}</div>
        <div class="desc">${s.pattern.card_right.desc}</div>
      </div>
    </div>
    <div class="closer">${s.pattern.closer_html}</div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${s.pattern.swipe}</span>
    <span class="pg">8 / 10</span>
  </div>
</section>`;

const renderCTA = (s) => `<section class="cta">
  <div class="top"><div class="eyebrow">${s.cta.eyebrow}</div></div>
  <div class="stretch">
    <h2>${s.cta.question}</h2>
    <div class="options">${s.cta.options.join('<br>')}</div>
    <div class="closer">${s.cta.closer}</div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${s.cta.swipe}</span>
    <span class="pg">9 / 10</span>
  </div>
</section>`;

const renderBonus = (s) => `<section class="bonus">
  <div class="top"><div class="eyebrow">${s.bonus.eyebrow}</div></div>
  <div class="stretch">
    <h2>${s.bonus.title}</h2>
    <div class="intro">${s.bonus.intro}</div>
    <div class="template">${linesToHtml(s.bonus.template_lines)}</div>
    <div class="outro">${s.bonus.outro_html}</div>
  </div>
  <div class="foot">
    <span></span>
    <span></span>
    <span class="pg">10 / 10</span>
  </div>
</section>`;

// ─── assemble ──────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${CSS}</style>
</head>
<body>
${renderCover(spec)}
${renderHook(spec)}
${renderCode(spec)}
${spec.fields.map((f, i) => renderField(f, i)).join('\n')}
${renderPattern(spec)}
${renderCTA(spec)}
${renderBonus(spec)}
</body>
</html>
`;

try {
  writeFileSync(outPath, html);
  console.log(`Rendered ${outPath} (${html.length} bytes)`);
} catch (e) {
  console.error(`Failed to write ${outPath}: ${e.message}`);
  exit(2);
}
