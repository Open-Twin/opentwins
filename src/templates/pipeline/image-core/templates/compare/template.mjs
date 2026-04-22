// Compare layout — binary side-by-side.
//   Title + subtitle header, then two cells at 50/50 with contrasting
//   tone backgrounds. Each side has a small label (Before/After, Old/New,
//   etc.), a headline, and 2-4 supporting points. First side tone-coded bad
//   (muted pink), second side tone-coded good (brand blue tint) — the
//   visual contrast carries the comparison.
//
// Aesthetic: magazine spread. Distinct from `matrix` (2D grid) — this is
// 1D focused contrast on a single dimension.
//
// Data shape:
//   { title, subtitle,
//     left:  { label, tone?, headline, points[] },
//     right: { label, tone?, headline, points[] } }

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireArray } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-compare-duotone-v1';
const VALID_TONES = ['good', 'bad', 'neutral'];

function validateSide(data, side, errors) {
  const obj = data[side];
  if (!obj || typeof obj !== 'object') {
    errors.push(`${side}: object with {label, headline, points[]} required`);
    return;
  }
  if (requireString(obj, 'label')) errors.push(`${side}.label: string required`);
  if (requireString(obj, 'headline')) errors.push(`${side}.headline: string required`);
  if (requireArray(obj, 'points', { minLen: 2, maxLen: 4 })) {
    errors.push(`${side}.points: 2-4 entries required`);
  }
  if (obj.tone !== undefined && !VALID_TONES.includes(obj.tone)) {
    errors.push(`${side}.tone: must be one of ${VALID_TONES.join(', ')}`);
  }
}

export function validate(data) {
  const errors = [
    requireString(data, 'title'),
  ];
  validateSide(data, 'left', errors);
  validateSide(data, 'right', errors);
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

function sideToneDefault(side) {
  return side === 'left' ? 'bad' : 'good';
}

export function render(data, { width, height }) {
  const renderSide = (side, data_side) => {
    const tone = VALID_TONES.includes(data_side.tone) ? data_side.tone : sideToneDefault(side);
    const pointsHtml = data_side.points.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
    return `
      <div class="side ${side} tone-${tone}">
        <div class="side-top">
          <div class="side-label">${escapeHtml(data_side.label)}</div>
          <h2 class="side-headline">${escapeHtml(data_side.headline)}</h2>
        </div>
        <ul class="side-points">${pointsHtml}</ul>
      </div>
    `;
  };

  // Bold duotone: left side deep navy (bad/before), right side warm cream
  // (good/after). Saturated contrast, not pale tints. Text colors flip per
  // side for readability.
  const leftBg  = T.brand.navy;
  const rightBg = T.parchment.bg;
  const divider = T.brand.blue;

  const extraCss = `
  body {
    background: linear-gradient(to right, ${leftBg} 0, ${leftBg} calc(50% - 2px), ${divider} calc(50% - 2px), ${divider} calc(50% + 2px), ${rightBg} calc(50% + 2px), ${rightBg} 100%);
    color: ${T.clinical.fg};
    font-family: ${T.fonts.sansSystem};
    padding: 0;
    margin: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .side {
    padding: 80px 68px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 30px;
    overflow: hidden;
  }
  .side.left  { color: ${T.editorial.fg}; }
  .side.right { color: ${T.parchment.ink}; }
  .side-top {
    display: flex; flex-direction: column; gap: 20px;
  }
  /* Side tone backgrounds are painted by body's linear-gradient — don't set them on .side. */
  .side-label {
    font-family: ${T.fonts.sansSystem};
    font-size: 26px; font-weight: 700;
    letter-spacing: 3.5px; text-transform: uppercase;
    display: flex; align-items: center; gap: 16px;
    line-height: 1.3;
  }
  .side-label::before {
    content: ''; display: inline-block;
    width: 38px; height: 3px;
  }
  /* Label color hugs each side's foreground tone for strong contrast. */
  .side.left  .side-label          { color: ${T.brand.blueLight}; }
  .side.left  .side-label::before  { background: ${T.brand.blueLight}; }
  .side.right .side-label          { color: ${T.brand.blue}; }
  .side.right .side-label::before  { background: ${T.brand.blue}; }
  .side-headline {
    font-family: ${T.fonts.sansSystem};
    font-size: 64px; font-weight: 800;
    line-height: 1.05; letter-spacing: -1.5px;
    max-width: 540px;
  }
  .side-points {
    list-style: none;
    font-family: ${T.fonts.sansSystem};
    font-size: 30px; font-weight: 500;
    line-height: 1.35;
    padding: 0;
  }
  .side-points li {
    padding: 12px 0 12px 30px;
    position: relative;
  }
  .side.left  .side-points li { border-top: 1px solid rgba(245,241,232,0.14); }
  .side.right .side-points li { border-top: 1px solid rgba(42,34,26,0.1); }
  .side .side-points li:first-child { border-top: none; padding-top: 14px; }
  .side-points li::before {
    content: ''; position: absolute;
    left: 0; top: 26px;
    width: 14px; height: 2px;
    background: currentColor;
    opacity: 0.55;
  }
  `;

  const body = `
    ${renderSide('left', data.left)}
    ${renderSide('right', data.right)}
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
