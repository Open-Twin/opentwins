// Venn layout — poster manifesto.
//   Deep ink canvas, minimal chrome. overlap_label is the HUGE italic serif
//   hero (with curly quotes). center is the supporting caption below it.
//   Two subtle circular arcs in the background imply the Venn without
//   literally drawing it. Anchor labels + bullets sit at the bottom as a
//   two-column supporting zone.
//
// Data shape unchanged: { title, subtitle, left:{label, bullets[]}, right:{label, bullets[]}, center, overlap_label, doodle? }.

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireArray } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-poster-v8';

export function validate(data) {
  const errors = [
    requireString(data, 'title'),
    requireString(data, 'center'),
    requireString(data, 'overlap_label'),
  ];
  for (const side of ['left', 'right']) {
    if (!data[side] || typeof data[side] !== 'object') {
      errors.push(`${side}: object with {label, bullets} required`);
    } else {
      if (requireString(data[side], 'label')) errors.push(`${side}.label: string required`);
      if (requireArray(data[side], 'bullets', { minLen: 1, maxLen: 6 })) {
        errors.push(`${side}.bullets: 1–6 entries required`);
      }
    }
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  // Cap bullets at 4 so the columns don't overflow. Writer can emit up to 6
  // per schema; we truncate visually but keep the data shape tolerant.
  const leftBullets = data.left.bullets.slice(0, 4).map((b) => `<li>${escapeHtml(b)}</li>`).join('');
  const rightBullets = data.right.bullets.slice(0, 4).map((b) => `<li>${escapeHtml(b)}</li>`).join('');

  const extraCss = `
  body {
    background: ${T.poster.bg};
    color: ${T.poster.fg};
    font-family: ${T.fonts.serifDisplay};
    padding: 86px 80px 86px;
    position: relative;
    overflow: hidden;
    display: flex; flex-direction: column;
  }

  /* Two background circles — visible enough to carry the Venn metaphor
     even when the image is shrunk to mobile feed size. Overlap zone sits
     directly behind the hero phrase. */
  .bg-venn {
    position: absolute; inset: 0; z-index: 0;
    pointer-events: none;
  }
  .bg-venn svg { width: 100%; height: 100%; }

  .content {
    position: relative; z-index: 1;
    flex: 1;
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
  }

  .top-strip { text-align: center; margin-bottom: 24px; }
  .title {
    font-family: ${T.fonts.sansSystem};
    font-weight: 700; font-size: 34px;
    letter-spacing: 4.5px; text-transform: uppercase;
    color: ${T.poster.accent};
    line-height: 1.2;
  }
  .subtitle {
    font-family: ${T.fonts.serifDisplay};
    font-style: italic;
    font-weight: 400; font-size: 28px;
    line-height: 1.3;
    color: ${T.poster.fgMuted};
    max-width: 820px; margin: 0 auto;
  }

  /* 3-column main zone: left anchor | hero+caption | right anchor.
     Every column left-aligned to its own column for reading consistency. */
  .main {
    display: grid;
    grid-template-columns: 240px 1fr 240px;
    gap: 48px;
    align-items: center;
    min-height: 0;
  }

  .anchor {
    display: flex; flex-direction: column; gap: 16px;
    align-self: center;
  }
  .anchor.right { text-align: right; }
  .anchor-label {
    font-family: ${T.fonts.sansSystem};
    font-size: 18px; font-weight: 700;
    letter-spacing: 3.5px; text-transform: uppercase;
    color: ${T.poster.accent};
    line-height: 1.3;
  }
  .anchor-bullets {
    list-style: none;
    font-family: ${T.fonts.sansSystem};
    font-size: 26px; font-weight: 400;
    line-height: 1.5;
    color: ${T.poster.fg};
  }
  .anchor-bullets li { padding: 2px 0; }

  .center {
    text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 28px;
    padding: 0 20px;
  }
  .hero {
    font-family: ${T.fonts.serifDisplay};
    font-style: italic;
    font-weight: 400;
    font-size: 118px;
    line-height: 1.02;
    letter-spacing: -2px;
    color: ${T.poster.fg};
    text-wrap: balance;
  }
  .hero .quote {
    color: ${T.poster.accent};
    opacity: 0.85;
    padding: 0 4px;
  }
  .caption {
    font-family: ${T.fonts.serifDisplay};
    font-weight: 400; font-size: 28px;
    font-style: normal;
    line-height: 1.3;
    color: ${T.poster.fgMuted};
    max-width: 560px;
    text-wrap: balance;
  }
  `;

  // Background circles sit where the anchor columns live. Overlap is
  // centered, behind the hero. Visible enough to read at mobile sizes.
  const bgSvg = `
    <svg viewBox="0 0 1200 1200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <circle cx="420" cy="660" r="400" fill="none" stroke="${T.poster.arc}" stroke-width="3"/>
      <circle cx="780" cy="660" r="400" fill="none" stroke="${T.poster.arc}" stroke-width="3"/>
    </svg>
  `;

  const body = `
    <div class="bg-venn">${bgSvg}</div>
    <div class="content">
      <div class="top-strip">
        <div class="title">${escapeHtml(data.title)}</div>
      </div>
      <div class="main">
        <div class="anchor left">
          <div class="anchor-label">${escapeHtml(data.left.label)}</div>
          <ul class="anchor-bullets">${leftBullets}</ul>
        </div>
        <div class="center">
          <div class="hero"><span class="quote">&ldquo;</span>${escapeHtml(data.overlap_label)}<span class="quote">&rdquo;</span></div>
          <div class="caption">${escapeHtml(data.center)}</div>
        </div>
        <div class="anchor right">
          <div class="anchor-label">${escapeHtml(data.right.label)}</div>
          <ul class="anchor-bullets">${rightBullets}</ul>
        </div>
      </div>
    </div>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
