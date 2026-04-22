// Checklist layout — do / don't / maybe action items.
//   Clean off-white canvas. Title + subtitle header, then 4-7 items stacked
//   vertically. Each item has a circled check/x/dash icon color-coded by
//   `check` value (do=blue, dont=red, maybe=muted) followed by the action
//   text in sans.
//
// Aesthetic: functional pocket reference. Distinct from `stack` (which is
// sequenced 1→2→3); checklist is unordered parallel actions.
//
// Data shape:
//   { title, subtitle, items: [ { text, check: "do"|"dont"|"maybe" } ] }

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireArray } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-checklist-ruled-v3';
const VALID_CHECKS = ['do', 'dont', 'maybe'];

export function validate(data) {
  const errors = [
    requireString(data, 'title'),
    requireArray(data, 'items', { minLen: 4, maxLen: 7 }),
  ];
  if (Array.isArray(data.items)) {
    data.items.forEach((it, i) => {
      if (!it || typeof it !== 'object') {
        errors.push(`items[${i}]: object required`);
        return;
      }
      if (requireString(it, 'text')) errors.push(`items[${i}].text: string required`);
      if (!VALID_CHECKS.includes(it.check)) {
        errors.push(`items[${i}].check: must be one of ${VALID_CHECKS.join(', ')}`);
      }
    });
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

function checkIconSvg(kind, size) {
  const paths = {
    do:    '<path d="M7.5 12.2l3 3 6-6.4"/>',
    dont:  '<path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
    maybe: '<path d="M7.5 12h9"/>',
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    ${paths[kind]}
  </svg>`;
}

export function render(data, { width, height }) {
  const count = data.items.length;
  // Scale item font with count so 7-item lists stay legible without overflow.
  const itemFontSize = count >= 7 ? 30 : count === 6 ? 34 : 38;
  const iconSize = count >= 7 ? 58 : count === 6 ? 64 : 68;

  const items = data.items.map((it) => {
    const check = VALID_CHECKS.includes(it.check) ? it.check : 'maybe';
    return `
      <li class="item check-${check}">
        <div class="item-icon">${checkIconSvg(check, iconSize)}</div>
        <div class="item-text">${escapeHtml(it.text)}</div>
      </li>
    `;
  }).join('');

  const extraCss = `
  body {
    background: ${T.ruled.bg};
    color: ${T.ruled.ink};
    font-family: ${T.fonts.sansSystem};
    padding: 80px 90px 80px;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .header {
    flex: 0 0 auto;
    margin-bottom: 30px;
    padding-bottom: 24px;
    border-bottom: 2px solid ${T.ruled.ruleHeavy};
  }
  .title {
    font-family: ${T.fonts.serifDisplay};
    font-size: 64px; font-weight: 400;
    line-height: 1.05; letter-spacing: -1.2px;
    color: ${T.ruled.ink};
    max-width: 1020px;
  }
  .items {
    flex: 1 1 auto;
    display: flex; flex-direction: column;
    list-style: none;
    min-height: 0;
  }
  .item {
    flex: 1 1 0;
    display: grid;
    grid-template-columns: ${iconSize + 32}px 1fr;
    align-items: center;
    gap: 26px;
    padding: 10px 0;
    border-bottom: 1px solid ${T.ruled.rule};
    min-height: 0;
  }
  .item:last-child { border-bottom: none; }
  .item-icon {
    display: flex; align-items: center; justify-content: center;
    width: ${iconSize}px; height: ${iconSize}px;
    line-height: 0;
  }
  .item.check-do .item-icon    { color: ${T.ruled.accent}; }
  .item.check-dont .item-icon  { color: ${T.ruled.warnRed}; }
  .item.check-maybe .item-icon { color: ${T.ruled.accentMuted}; }
  .item-text {
    font-family: ${T.fonts.sansSystem};
    font-size: ${itemFontSize}px;
    font-weight: 600;
    line-height: 1.2;
    color: ${T.ruled.ink};
    letter-spacing: -0.3px;
  }
  .item.check-dont .item-text {
    text-decoration: line-through;
    text-decoration-color: rgba(169,68,50,0.45);
    text-decoration-thickness: 2px;
    color: ${T.ruled.inkMuted};
  }
  `;

  const body = `
    <div class="header">
      <h1 class="title">${escapeHtml(data.title)}</h1>
    </div>
    <ul class="items">${items}</ul>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
