// Carousel layout — LinkedIn document post (10 pages, 1080×1080 per page).
// Ported from workspace/content-writer/templates/render-carousel.mjs. Unlike
// the legacy script which emits HTML for a downstream PDF step, image-core's
// Chrome invocation goes straight to PDF via --print-to-pdf.

import { escapeHtml } from '../../lib/escape.mjs';
import { corporateHead } from '../_shared/corporate.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-c';

// HTML-contract fields. These accept inline HTML (<b>, <span class="c1">,
// etc.) per Content Writer convention. Everything else is treated as plain
// text and escaped. Keep this list explicit so accidentally forgetting to
// escape a new field breaks loudly in review.
const HTML_FIELD_CONTRACT = {
  hook: { raw: ['support_html'] },
  code: { rawArrays: ['body_lines'] },
  fields: { raw: ['takeaway_html'] },
  pattern: { raw: ['closer_html'] },
  bonus: { raw: ['outro_html'], rawArrays: ['template_lines'] },
};

// Escape an array of plain strings, return HTML joined by <br>.
const joinEscaped = (arr, sep = '<br>') => arr.map((x) => escapeHtml(x)).join(sep);
// Raw-HTML arrays (body_lines, template_lines) — each line already HTML.
const joinRaw = (arr, sep = '<br>') =>
  arr.map((l) => (l === '' ? '<br>' : `${l}${sep}`)).join('');

const REQUIRED_TOP = ['cover', 'hook', 'code', 'fields', 'pattern', 'cta', 'bonus'];
const VALID_ICONS = ['target', 'lock', 'notebook', 'alarm', 'lightning', 'shield', 'spark', 'map'];
const REQUIRED_FIELD_KEYS = ['name', 'icon', 'definition', 'eng', 'pm', 'takeaway_html', 'swipe'];

export function validate(data) {
  const errors = [];
  for (const k of REQUIRED_TOP) {
    if (data[k] === undefined || data[k] === null) errors.push(`${k}: required`);
  }
  if (Array.isArray(data.fields)) {
    if (data.fields.length !== 4) errors.push('fields: must have exactly 4 entries');
    data.fields.forEach((f, i) => {
      if (!f || typeof f !== 'object') {
        errors.push(`fields[${i}]: object required`);
        return;
      }
      for (const k of REQUIRED_FIELD_KEYS) {
        if (f[k] === undefined) errors.push(`fields[${i}].${k}: required`);
      }
      if (f.icon !== undefined && !VALID_ICONS.includes(f.icon)) {
        errors.push(`fields[${i}].icon: must be one of ${VALID_ICONS.join(', ')} (got ${f.icon})`);
      }
    });
  } else if (data.fields !== undefined) {
    errors.push('fields: must be an array of 4 entries');
  }
  return { ok: errors.length === 0, errors };
}

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

function css() {
  return `
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
html, body { font-family: ${T.fonts.sansSystem}; color: ${T.corporate.text}; }
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
.foot { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; font-size: 21px; color: ${T.corporate.textDim}; padding-top: 32px; border-top: 1.5px solid ${T.corporate.border}; }
.foot .swipe { justify-self: center; color: ${T.brand.blue}; font-weight: 700; font-size: 22px; letter-spacing: 0.3px; }
.foot .pg { justify-self: end; font-weight: 700; font-size: 20px; color: ${T.corporate.textDim}; }
.eyebrow { display: inline-block; padding: 9px 20px; border-radius: 8px; background: ${T.corporate.surfaceTint}; color: ${T.brand.blue}; font-size: 20px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 28px; }
h2 { font-size: 66px; font-weight: 800; line-height: 1.06; letter-spacing: -1.8px; color: ${T.brand.navy}; }
.cover { background: radial-gradient(circle at 25% 25%, ${T.brand.navyMid} 0%, ${T.brand.navy} 70%); color: white; padding: 90px; }
.cover-grid { display: grid; grid-template-columns: 320px 1fr; gap: 56px; align-items: center; flex: 1; }
.file-icon { width: 300px; height: 360px; background: white; border-radius: 14px; position: relative; box-shadow: 0 40px 100px rgba(10,102,194,0.35); transform: rotate(-4deg); }
.file-icon::before { content: ""; position: absolute; top: 0; right: 0; width: 82px; height: 82px; background: ${T.corporate.border}; border-top-right-radius: 14px; clip-path: polygon(0 0, 100% 100%, 100% 0); }
.file-icon::after { content: ""; position: absolute; top: 0; right: 0; width: 82px; height: 82px; background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.04) 50%); border-top-right-radius: 14px; }
.fi-label { position: absolute; top: 128px; left: 0; right: 0; text-align: center; font-family: ${T.fonts.monoSystem}; font-size: 42px; font-weight: 800; color: ${T.brand.blue}; }
.fi-sub { position: absolute; top: 188px; left: 0; right: 0; text-align: center; font-family: ${T.fonts.monoSystem}; font-size: 19px; color: ${T.corporate.textDim}; letter-spacing: 0.3px; }
.fi-dots { position: absolute; top: 230px; left: 30px; right: 30px; display: flex; flex-direction: column; gap: 12px; }
.fi-dots span { height: 6px; background: ${T.corporate.border}; border-radius: 3px; display: block; }
.fi-dots span:nth-child(1) { width: 68%; } .fi-dots span:nth-child(2) { width: 84%; }
.fi-dots span:nth-child(3) { width: 48%; } .fi-dots span:nth-child(4) { width: 72%; }
.cover h1 { font-size: 86px; font-weight: 800; line-height: 1.02; letter-spacing: -3px; margin-bottom: 26px; color: white; }
.cover .subline { font-size: 30px; opacity: 0.88; font-weight: 500; line-height: 1.4; }
.cover-foot { display: flex; justify-content: flex-start; align-items: center; padding-top: 40px; }
.cover-foot .pill { display: inline-block; background: rgba(255,255,255,0.14); padding: 13px 26px; border-radius: 999px; font-size: 22px; font-weight: 600; color: white; letter-spacing: 0.3px; }
.hook h2 { font-size: 96px; line-height: 1.0; letter-spacing: -3px; margin-top: 12px; }
.hook h2 .accent { color: ${T.brand.blue}; }
.hook .support { margin-top: 46px; font-size: 30px; line-height: 1.4; color: ${T.corporate.textMuted}; max-width: 840px; }
.hook .support b { color: ${T.brand.blue}; font-weight: 700; }
.code-slide { background: ${T.brand.navy}; color: white; }
.code-slide .eyebrow { background: rgba(10,102,194,0.22); color: ${T.brand.blueLight}; }
.code-slide h2 { color: white; font-size: 48px; margin-bottom: 34px; letter-spacing: -1px; }
.code-slide .foot { border-top: 1px solid rgba(255,255,255,0.12); }
.code-slide .foot .pg { color: rgba(255,255,255,0.6); }
.code-slide .foot .swipe { color: ${T.brand.blueLight}; }
.code-window { background: ${T.code.bg}; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.09); box-shadow: 0 30px 80px rgba(0,0,0,0.5); }
.code-header { background: ${T.code.bgHeader}; padding: 14px 20px; display: flex; align-items: center; gap: 10px; }
.code-header .dot { width: 13px; height: 13px; border-radius: 50%; }
.code-header .d1 { background: ${T.code.dotRed}; } .code-header .d2 { background: ${T.code.dotYellow}; } .code-header .d3 { background: ${T.code.dotGreen}; }
.code-header .filename { margin-left: 14px; color: ${T.code.c2}; font-family: ${T.fonts.monoSystem}; font-size: 19px; font-weight: 600; }
.code-body { padding: 34px 40px; font-family: ${T.fonts.monoSystem}; font-size: 24px; line-height: 1.7; color: ${T.code.text}; }
.c1 { color: ${T.code.c1}; font-weight: 700; }
.c2 { color: ${T.code.c2}; }
.c3 { color: ${T.code.c3}; }
.c4 { color: ${T.code.c4}; }
.c5 { color: ${T.code.c5}; }
.field .icon-wrap { width: 92px; height: 92px; border-radius: 20px; background: ${T.corporate.surfaceTint}; display: flex; align-items: center; justify-content: center; margin-bottom: 28px; }
.field .icon-wrap svg { width: 50px; height: 50px; stroke: ${T.brand.blue}; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.field h2 { font-size: 64px; margin-bottom: 18px; }
.field .def { font-size: 32px; color: ${T.corporate.textMuted}; line-height: 1.35; max-width: 840px; margin-bottom: 38px; font-weight: 500; }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 34px; }
.compare .box { padding: 30px 32px; border-radius: 14px; background: ${T.corporate.surface}; border-left: 6px solid #9aa5b1; }
.compare .box.pm { background: ${T.corporate.surfaceTint}; border-left-color: ${T.brand.blue}; }
.compare .label { font-size: 17px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; color: ${T.corporate.textDim}; margin-bottom: 12px; }
.compare .pm .label { color: ${T.brand.blue}; }
.compare .q { font-size: 26px; line-height: 1.4; color: ${T.corporate.text}; font-weight: 500; }
.takeaway { font-size: 27px; color: ${T.corporate.textMuted}; line-height: 1.4; max-width: 900px; }
.takeaway b { color: ${T.brand.blue}; font-weight: 700; }
.pattern .grid { display: grid; grid-template-columns: 1fr 80px 1fr; gap: 24px; align-items: stretch; margin: 28px 0 40px; }
.pattern .card { padding: 34px 32px; border-radius: 16px; background: ${T.corporate.surface}; border-top: 6px solid ${T.brand.blue}; display: flex; flex-direction: column; }
.pattern .date { font-family: ${T.fonts.monoSystem}; font-size: 20px; color: ${T.brand.blue}; font-weight: 700; letter-spacing: 1px; margin-bottom: 14px; }
.pattern .lab { font-size: 28px; font-weight: 800; color: ${T.brand.navy}; margin-bottom: 4px; }
.pattern .feat { font-size: 26px; color: ${T.corporate.text}; margin-bottom: 14px; font-weight: 700; }
.pattern .desc { font-size: 22px; color: ${T.corporate.textMuted}; line-height: 1.45; margin-top: auto; }
.pattern .eq { display: flex; align-items: center; justify-content: center; font-size: 52px; color: ${T.brand.blue}; font-weight: 800; }
.pattern .closer { font-size: 28px; line-height: 1.35; color: ${T.corporate.text}; font-weight: 600; max-width: 900px; margin-top: 12px; }
.pattern .closer b { color: ${T.brand.blue}; }
.cta { background: linear-gradient(135deg, ${T.brand.blue} 0%, ${T.brand.blueDark} 100%); color: white; }
.cta .stretch { align-items: flex-start; justify-content: center; text-align: left; }
.cta .eyebrow { background: rgba(255,255,255,0.16); color: white; }
.cta h2 { color: white; font-size: 72px; line-height: 1.08; max-width: 900px; letter-spacing: -2px; }
.cta .options { font-size: 28px; opacity: 0.88; line-height: 1.5; margin-top: 36px; font-weight: 500; }
.cta .closer { font-size: 26px; opacity: 0.8; font-style: italic; margin-top: 22px; }
.cta .foot { border-top: 1px solid rgba(255,255,255,0.18); }
.cta .foot .pg { color: rgba(255,255,255,0.7); }
.bonus { background: ${T.corporate.surface}; }
.bonus .eyebrow { background: ${T.brand.blue}; color: white; }
.bonus h2 { font-size: 54px; margin-bottom: 12px; letter-spacing: -1.5px; }
.bonus .intro { font-size: 26px; color: ${T.corporate.textMuted}; margin-bottom: 22px; max-width: 840px; line-height: 1.4; font-weight: 500; }
.template { background: white; border: 2px solid ${T.corporate.border}; border-radius: 12px; padding: 26px 36px; font-family: ${T.fonts.monoSystem}; font-size: 23px; line-height: 1.6; color: ${T.brand.navy}; box-shadow: 0 8px 24px rgba(0,0,0,0.04); margin-bottom: 22px; }
.template .c1 { color: ${T.brand.blue}; font-weight: 700; }
.template .c2 { color: ${T.code.c2}; }
.template .blank { display: inline-block; border-bottom: 2px solid #9aa5b1; width: 340px; height: 4px; vertical-align: middle; margin-left: 6px; }
.bonus .outro { font-size: 24px; color: ${T.corporate.text}; font-weight: 500; line-height: 1.4; }
.bonus .outro b { color: ${T.brand.blue}; font-weight: 700; }
`;
}

const renderCover = (s) => `<section class="cover">
  <div class="cover-grid">
    <div class="file-icon">
      <div class="fi-label">${escapeHtml(s.cover.file_label)}</div>
      <div class="fi-sub">${escapeHtml(s.cover.file_sub)}</div>
      <div class="fi-dots"><span></span><span></span><span></span><span></span></div>
    </div>
    <div>
      <h1>${joinEscaped(s.cover.headline)}</h1>
      <div class="subline">${joinEscaped(s.cover.subline)}</div>
    </div>
  </div>
  <div class="cover-foot">
    <span class="pill">${escapeHtml(s.cover.read_promise)}</span>
  </div>
</section>`;

const renderHook = (s) => {
  const h = s.hook.headline_lines.map((l) => {
    const safeText = escapeHtml(l.text);
    return l.accent ? `<span class="accent">${safeText}</span>` : safeText;
  }).join('<br>');
  return `<section class="hook">
  <div class="top"><div class="eyebrow">${escapeHtml(s.hook.eyebrow)}</div></div>
  <div class="stretch">
    <h2>${h}</h2>
    <div class="support">${s.hook.support_html}</div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${escapeHtml(s.hook.swipe)}</span>
    <span class="pg">2 / 10</span>
  </div>
</section>`;
};

const renderCode = (s) => `<section class="code-slide">
  <div class="top"><div class="eyebrow">${escapeHtml(s.code.eyebrow)}</div></div>
  <div class="stretch">
    <h2>${escapeHtml(s.code.title)}</h2>
    <div class="code-window">
      <div class="code-header">
        <span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
        <span class="filename">${escapeHtml(s.code.filename)}</span>
      </div>
      <div class="code-body">${joinRaw(s.code.body_lines)}</div>
    </div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${escapeHtml(s.code.swipe)}</span>
    <span class="pg">3 / 10</span>
  </div>
</section>`;

const renderField = (f, idx) => `<section class="field">
  <div class="top"><div class="eyebrow">Field ${idx + 1} · ${escapeHtml(f.name)}</div></div>
  <div class="stretch">
    <div class="icon-wrap"><svg viewBox="0 0 24 24">${ICONS[f.icon]}</svg></div>
    <h2>${escapeHtml(f.name)}</h2>
    <div class="def">${escapeHtml(f.definition)}</div>
    <div class="compare">
      <div class="box"><div class="label">Engineering writes</div><div class="q">${escapeHtml(f.eng)}</div></div>
      <div class="box pm"><div class="label">PM writes</div><div class="q">${escapeHtml(f.pm)}</div></div>
    </div>
    <div class="takeaway">${f.takeaway_html}</div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${escapeHtml(f.swipe)}</span>
    <span class="pg">${idx + 4} / 10</span>
  </div>
</section>`;

const renderPattern = (s) => `<section class="pattern">
  <div class="top"><div class="eyebrow">${escapeHtml(s.pattern.eyebrow)}</div></div>
  <div class="stretch">
    <h2>${escapeHtml(s.pattern.title)}</h2>
    <div class="grid">
      <div class="card">
        <div class="date">${escapeHtml(s.pattern.card_left.date)}</div>
        <div class="lab">${escapeHtml(s.pattern.card_left.lab)}</div>
        <div class="feat">${escapeHtml(s.pattern.card_left.feature)}</div>
        <div class="desc">${escapeHtml(s.pattern.card_left.desc)}</div>
      </div>
      <div class="eq">${escapeHtml(s.pattern.connector)}</div>
      <div class="card">
        <div class="date">${escapeHtml(s.pattern.card_right.date)}</div>
        <div class="lab">${escapeHtml(s.pattern.card_right.lab)}</div>
        <div class="feat">${escapeHtml(s.pattern.card_right.feature)}</div>
        <div class="desc">${escapeHtml(s.pattern.card_right.desc)}</div>
      </div>
    </div>
    <div class="closer">${s.pattern.closer_html}</div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${escapeHtml(s.pattern.swipe)}</span>
    <span class="pg">8 / 10</span>
  </div>
</section>`;

const renderCTA = (s) => `<section class="cta">
  <div class="top"><div class="eyebrow">${escapeHtml(s.cta.eyebrow)}</div></div>
  <div class="stretch">
    <h2>${escapeHtml(s.cta.question)}</h2>
    <div class="options">${joinEscaped(s.cta.options)}</div>
    <div class="closer">${escapeHtml(s.cta.closer)}</div>
  </div>
  <div class="foot">
    <span></span>
    <span class="swipe">${escapeHtml(s.cta.swipe)}</span>
    <span class="pg">9 / 10</span>
  </div>
</section>`;

const renderBonus = (s) => `<section class="bonus">
  <div class="top"><div class="eyebrow">${escapeHtml(s.bonus.eyebrow)}</div></div>
  <div class="stretch">
    <h2>${escapeHtml(s.bonus.title)}</h2>
    <div class="intro">${escapeHtml(s.bonus.intro)}</div>
    <div class="template">${joinRaw(s.bonus.template_lines)}</div>
    <div class="outro">${s.bonus.outro_html}</div>
  </div>
  <div class="foot">
    <span></span>
    <span></span>
    <span class="pg">10 / 10</span>
  </div>
</section>`;

export function render(data, { width, height }) {
  const head = corporateHead({ width, height, extraCss: css() });
  const pages = [
    renderCover(data),
    renderHook(data),
    renderCode(data),
    ...data.fields.map((f, i) => renderField(f, i)),
    renderPattern(data),
    renderCTA(data),
    renderBonus(data),
  ].join('\n');
  return `<!DOCTYPE html><html><head>${head}</head><body>${pages}</body></html>`;
}

export default { render, validate, TEMPLATE_VERSION };
