// Matrix layout — opinionated 2×2 quadrant.
//   Light clinical canvas, strict grid. Axes in monospace along the outer
//   edges. Each cell has a geometric tone icon + label + body. The FIRST
//   cell with tone="good" is the opinionated winner: accent outline + "BEST
//   PICK" chip + upsized label. If no good cell exists, nothing highlighted.
//
// Data shape unchanged: { title, subtitle, axes:{x,y}, cells[{label,body,tone?}], doodle? }.

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireArray } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-clinical-v6';
const VALID_TONES = ['good', 'bad', 'neutral'];

export function validate(data) {
  const errors = [
    requireString(data, 'title'),
    requireArray(data, 'cells', { exactLen: 4 }),
  ];
  if (!data.axes || typeof data.axes !== 'object') {
    errors.push('axes: object with {x, y} required');
  } else {
    errors.push(requireArray(data.axes, 'x', { exactLen: 2 }));
    errors.push(requireArray(data.axes, 'y', { exactLen: 2 }));
  }
  if (Array.isArray(data.cells)) {
    data.cells.forEach((c, i) => {
      if (!c || typeof c !== 'object') {
        errors.push(`cells[${i}]: object required`);
        return;
      }
      if (requireString(c, 'label')) errors.push(`cells[${i}].label: string required`);
      if (requireString(c, 'body')) errors.push(`cells[${i}].body: string required`);
      if (c.tone !== undefined && !VALID_TONES.includes(c.tone)) {
        errors.push(`cells[${i}].tone: must be one of ${VALID_TONES.join(', ')}`);
      }
    });
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

// Stroke icons — currentColor so tone class can recolor.
const TONE_ICONS = {
  good: `<svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <path d="M7.5 12.2l3 3 6-6.4"/>
  </svg>`,
  bad: `<svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>
  </svg>`,
  neutral: `<svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <path d="M7.5 12h9"/>
  </svg>`,
};

export function render(data, { width, height }) {
  // First "good" cell wins the highlight. Deterministic, doesn't require
  // new data fields. If no good cells, no highlight (still reads fine).
  const highlightIdx = data.cells.findIndex((c) => c.tone === 'good');

  const cells = data.cells.map((c, i) => {
    const tone = VALID_TONES.includes(c.tone) ? c.tone : 'neutral';
    const isHighlighted = i === highlightIdx;
    const icon = TONE_ICONS[tone];
    return `
      <div class="cell tone-${tone}${isHighlighted ? ' highlighted' : ''}">
        ${isHighlighted ? '<div class="best-chip">Best pick</div>' : ''}
        <div class="icon">${icon}</div>
        <div class="label">${escapeHtml(c.label)}</div>
        <div class="body">${escapeHtml(c.body)}</div>
      </div>`;
  }).join('');

  const extraCss = `
  body {
    background: ${T.clinical.bg};
    color: ${T.clinical.fg};
    font-family: ${T.fonts.sansSystem};
    padding: 80px 80px 80px;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .header {
    flex: 0 0 auto;
    margin-bottom: 36px;
    padding-bottom: 26px;
    border-bottom: 1.5px solid ${T.clinical.gridBorder};
  }
  .title {
    font-family: ${T.fonts.sansSystem};
    font-size: 62px; font-weight: 800; line-height: 1.05;
    letter-spacing: -1.5px; color: ${T.clinical.fg};
    max-width: 1020px;
  }
  .subtitle {
    font-family: ${T.fonts.sansSystem};
    font-size: 28px; font-weight: 400; line-height: 1.4;
    color: ${T.clinical.fgMuted};
    max-width: 900px;
  }
  .matrix-frame {
    flex: 1 1 auto;
    position: relative;
    padding: 62px 0 0 62px;
    min-height: 0;
  }
  .axis-x {
    position: absolute; top: 0; left: 62px; right: 0;
    display: grid; grid-template-columns: 1fr 1fr;
    font-family: ${T.fonts.monoTech};
    font-size: 20px; font-weight: 700;
    letter-spacing: 2.5px; text-transform: uppercase;
    color: ${T.clinical.fgMuted};
    text-align: center; padding-bottom: 18px;
  }
  .axis-x span {
    display: flex; align-items: center; justify-content: center;
  }
  .axis-y {
    position: absolute; left: 0; top: 62px; bottom: 0; width: 62px;
    display: grid; grid-template-rows: 1fr 1fr;
  }
  .axis-y span {
    display: flex; align-items: center; justify-content: center;
    writing-mode: vertical-rl; transform: rotate(180deg);
    font-family: ${T.fonts.monoTech};
    font-size: 20px; font-weight: 700;
    letter-spacing: 2.5px; text-transform: uppercase;
    color: ${T.clinical.fgMuted};
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 2px;
    background: ${T.clinical.gridBorder};
    border: 1.5px solid ${T.clinical.gridBorder};
    border-radius: 8px;
    overflow: hidden;
    height: 100%;
  }
  .cell {
    padding: 34px 36px;
    background: white;
    display: flex; flex-direction: column;
    position: relative;
  }
  .cell.tone-good { background: ${T.clinical.toneGood}; }
  .cell.tone-bad { background: ${T.clinical.toneBad}; }
  .cell.tone-neutral { background: ${T.clinical.toneNeutral}; }
  .cell.highlighted {
    box-shadow: inset 0 0 0 4px ${T.clinical.accent};
  }
  .best-chip {
    position: absolute; top: 18px; right: 18px;
    background: ${T.clinical.accent}; color: white;
    font-family: ${T.fonts.monoTech};
    font-size: 14px; font-weight: 700;
    letter-spacing: 1.8px; text-transform: uppercase;
    padding: 7px 14px; border-radius: 100px;
  }
  .cell .icon { width: 52px; height: 52px; margin-bottom: 18px; line-height: 0; }
  .cell.tone-good .icon { color: ${T.clinical.accent}; }
  .cell.tone-bad .icon { color: ${T.clinical.warnRed}; }
  .cell.tone-neutral .icon { color: ${T.clinical.fgMuted}; }
  .cell .label {
    font-family: ${T.fonts.sansSystem};
    font-size: 32px; font-weight: 800;
    letter-spacing: -0.3px;
    color: ${T.clinical.fg};
    margin-bottom: 10px;
    line-height: 1.1;
  }
  .cell.highlighted .label { font-size: 38px; color: ${T.clinical.accent}; }
  .cell .body {
    font-family: ${T.fonts.sansSystem};
    font-size: 22px; font-weight: 400; line-height: 1.4;
    color: ${T.clinical.fgMuted};
    max-width: 380px;
  }
  `;

  const body = `
    <div class="header">
      <h1 class="title">${escapeHtml(data.title)}</h1>
    </div>
    <div class="matrix-frame">
      <div class="axis-x">
        <span>${escapeHtml(data.axes.x[0])}</span>
        <span>${escapeHtml(data.axes.x[1])}</span>
      </div>
      <div class="axis-y">
        <span>${escapeHtml(data.axes.y[0])}</span>
        <span>${escapeHtml(data.axes.y[1])}</span>
      </div>
      <div class="grid">${cells}</div>
    </div>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
